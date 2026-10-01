/**
 * Codex SDK로 Entry 대화 한 턴을 돌린다(ADR-0015).
 *
 * Codex는 도구를 한 번에 끄는 옵션이 없다. 셸 도구(`shell_tool`, `unified_exec`)를 끄고 read-only 샌드박스를 함께 건다.
 * 셸 끄기는 명령 실행을, read-only는 `apply_patch`의 파일 쓰기를 막는다. 둘 다 있어야 한다(결정 5의 확인 결과).
 *
 * 인증 파일은 이렇게 다룬다.
 * - `CODEX_HOME`은 tmpfs라서 세션·로그·sqlite 상태가 재시작 때 사라진다.
 * - 인증 파일만 볼륨(`CODEX_AUTH_FILE`)에 두고, 시작할 때 `CODEX_HOME`으로 복사한다.
 * - Codex가 약 8일마다 토큰을 갱신해 `CODEX_HOME/auth.json`을 다시 쓰므로, 턴이 끝날 때마다 바뀌었으면 볼륨에 되돌려 쓴다.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Codex, type ThreadOptions } from '@openai/codex-sdk';
import type { LlmEngineView } from '@trendboda/api-types';
import { ENTRY_CONVERSATION_INSTRUCTIONS } from './entry-conversation-prompt.ts';
import { LlmFailure } from './llm-failure.ts';
import type { EngineTurn, EngineTurnInput } from './conversation-turn.ts';

const WORK_DIRECTORY = '/tmp/work';
const codexHome = process.env.CODEX_HOME ?? join(process.env.HOME ?? '/tmp', '.codex');
const workingAuthFile = join(codexHome, 'auth.json');
/** 재시작해도 남는 인증 파일. 비우면 `CODEX_HOME`의 파일을 그대로 쓴다(로컬에서 직접 띄울 때). */
const persistentAuthFile = process.env.CODEX_AUTH_FILE;

/**
 * 고를 수 있는 Codex 모델. Codex TS SDK에는 목록 API가 없어 코드에 둔다(ADR-0015 결정 9).
 * 2026-10-01 `codex` 0.159.3의 목록에서 골랐다. 모델이 바뀌면 이 표를 고친다.
 */
const CODEX_MODELS: LlmEngineView['models'] = [
  { value: 'gpt-6.1-sol', title: 'GPT-6.1-Sol' },
  { value: 'gpt-6-sol', title: 'GPT-6-Sol' },
  { value: 'gpt-6-astra', title: 'GPT-6-Astra' },
  { value: 'gpt-6-luna', title: 'GPT-6-Luna' },
];

const threadOptions = {
  sandboxMode: 'read-only',
  approvalPolicy: 'never',
  webSearchMode: 'disabled',
  workingDirectory: WORK_DIRECTORY,
  skipGitRepoCheck: true,
  modelReasoningEffort: 'low',
} satisfies ThreadOptions;

const codex = new Codex({ config: { features: { shell_tool: false, unified_exec: false } } });

/** 볼륨의 인증 파일을 `CODEX_HOME`으로 가져온다. 서비스가 시작할 때 한 번 부른다. */
export function loadCodexAuth(): void {
  mkdirSync(codexHome, { recursive: true });
  if (persistentAuthFile && existsSync(persistentAuthFile)) copyFileSync(persistentAuthFile, workingAuthFile);
}

/** Codex가 토큰을 갱신했으면 볼륨에 되돌려 쓴다. 이어서 쓰다 죽어도 반쪽 파일이 남지 않게 바꿔치기로 쓴다. */
function saveRefreshedCodexAuth(): void {
  if (!persistentAuthFile || !existsSync(workingAuthFile)) return;
  const working = readFileSync(workingAuthFile);
  if (existsSync(persistentAuthFile) && working.equals(readFileSync(persistentAuthFile))) return;
  const temporaryFile = `${persistentAuthFile}.tmp`;
  writeFileSync(temporaryFile, working, { mode: 0o600 });
  renameSync(temporaryFile, persistentAuthFile);
}

/** 인증 정보가 있는지. 없으면 화면이 이 엔진을 고를 수 없게 한다. */
export function isCodexAvailable(): boolean {
  return existsSync(workingAuthFile);
}

/** Codex 모델 목록. */
export function listCodexModels(): LlmEngineView['models'] {
  return CODEX_MODELS;
}

/**
 * Codex로 한 턴을 돌린다. `sessionId`가 있으면 그 스레드를 이어 간다.
 * Codex SDK에는 시스템 프롬프트 옵션이 없어 지시문을 첫 질문 앞에 붙인다.
 */
export async function runCodexTurn({ model, prompt, sessionId, signal }: EngineTurnInput): Promise<EngineTurn> {
  const thread = sessionId ? codex.resumeThread(sessionId, { ...threadOptions, model }) : codex.startThread({ ...threadOptions, model });
  try {
    const turn = await thread.run(sessionId ? prompt : `${ENTRY_CONVERSATION_INSTRUCTIONS}\n\n${prompt}`, { signal });
    if (!thread.id) throw new LlmFailure('llm-failed', 'Codex가 스레드 id를 주지 않았습니다');
    return { sessionId: thread.id, answer: turn.finalResponse };
  } catch (error) {
    if (error instanceof LlmFailure || signal.aborted) throw error;
    throw new LlmFailure('llm-failed', `Codex가 답하지 못했습니다: ${String(error).slice(0, 500)}`);
  } finally {
    saveRefreshedCodexAuth();
  }
}
