/**
 * Claude Agent SDK로 Entry 대화 한 턴을 돌린다(ADR-0015).
 *
 * 인증은 `claude setup-token`으로 받은 구독 토큰(`CLAUDE_CODE_OAUTH_TOKEN`)이다.
 * 도구를 모두 빼고(`tools: []`), 설정 파일·MCP·CLAUDE.md를 읽지 않게 해서 텍스트를 넣고 텍스트만 받는다(결정 5).
 * 세션 파일은 `CLAUDE_CONFIG_DIR`(tmpfs)에 쌓여 컨테이너가 재시작되면 사라진다(결정 8).
 */
import { type ModelInfo, type Options, query } from '@anthropic-ai/claude-agent-sdk';
import type { LlmEngineView } from '@trendboda/api-types';
import { ENTRY_CONVERSATION_INSTRUCTIONS } from './entry-conversation-prompt.ts';
import { LlmFailure } from './llm-failure.ts';
import type { EngineTurn, EngineTurnInput } from './conversation-turn.ts';

/** 빈 작업 디렉터리. 도구가 없어 읽을 일은 없지만, 세션 파일 경로가 이 이름으로 정해진다. */
const WORK_DIRECTORY = '/tmp/work';

/** 두 호출(대화, 모델 목록)이 함께 쓰는 격리 설정. */
const isolatedOptions = {
  cwd: WORK_DIRECTORY,
  tools: [],
  settingSources: [],
  strictMcpConfig: true,
  systemPrompt: ENTRY_CONVERSATION_INSTRUCTIONS,
} satisfies Options;

/** 인증 정보가 있는지. 없으면 화면이 이 엔진을 고를 수 없게 한다. */
export function isClaudeAvailable(): boolean {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
}

/** Claude로 한 턴을 돌린다. `sessionId`가 있으면 그 세션을 이어 간다. */
export async function runClaudeTurn({ model, prompt, sessionId, signal }: EngineTurnInput): Promise<EngineTurn> {
  const abortController = new AbortController();
  signal.addEventListener('abort', () => abortController.abort(), { once: true });
  const messages = query({
    prompt,
    options: { ...isolatedOptions, model, maxTurns: 1, resume: sessionId ?? undefined, abortController },
  });
  for await (const message of messages) {
    if (message.type !== 'result') continue;
    if (message.subtype === 'success' && !message.is_error) return { sessionId: message.session_id, answer: message.result };
    // 사용 한도 초과도 여기로 온다. 문구는 CLI가 준 그대로 남긴다.
    const detail = message.subtype === 'success' ? message.result : message.errors.join(' ');
    throw new LlmFailure('llm-failed', `Claude가 답하지 못했습니다(${message.subtype}): ${detail}`);
  }
  throw new LlmFailure('llm-failed', 'Claude가 결과 없이 끝났습니다');
}

let modelsRequest: Promise<ModelInfo[]> | undefined;

/**
 * 구독으로 쓸 수 있는 Claude 모델 목록. CLI를 한 번 띄워 묻고, 성공하면 프로세스가 사는 동안 다시 묻지 않는다.
 * 프롬프트를 보내지 않으므로 사용 한도를 쓰지 않는다.
 */
export async function listClaudeModels(): Promise<LlmEngineView['models']> {
  modelsRequest ??= (async () => {
    const neverPrompt = (async function* () {
      await new Promise(() => {});
    })();
    const session = query({ prompt: neverPrompt, options: isolatedOptions });
    try {
      return await session.supportedModels();
    } finally {
      session.close();
    }
  })();
  try {
    const models = await modelsRequest;
    return models.map((model) => ({ value: model.value, title: model.displayName }));
  } catch (error) {
    modelsRequest = undefined;
    throw error;
  }
}
