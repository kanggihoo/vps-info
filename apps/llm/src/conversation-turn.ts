/**
 * Entry 대화 한 턴을 엔진에 넘긴다(ADR-0015).
 *
 * 대화 기록은 엔진 세션(세션 파일)이 들고 있고, 이 모듈은 세션 id가 어느 엔진·모델의 것인지만 메모리에 둔다.
 * 세션 파일과 이 표는 둘 다 프로세스(컨테이너)와 함께 사라지므로, 표에 없는 id는 만료된 대화다.
 */
import type { LlmEngine, LlmTurnRequest } from '@trendboda/api-types';
import { buildFirstTurnPrompt } from './entry-conversation-prompt.ts';
import { LlmFailure } from './llm-failure.ts';

/** 한 턴이 이보다 오래 걸리면 끊는다. 앱 서버는 이보다 조금 더 기다린다. */
export const TURN_TIMEOUT_MILLISECONDS = 180_000;

/** 엔진에 넘기는 한 턴. 첫 턴이면 `sessionId`가 `null`이고 `prompt`에 Entry가 들어 있다. */
export type EngineTurnInput = { model: string; prompt: string; sessionId: string | null; signal: AbortSignal };

/** 엔진이 돌려주는 결과. 첫 턴이면 새 세션 id다. */
export type EngineTurn = { sessionId: string; answer: string };

/** 엔진 하나의 실행 함수와 사용 가능 여부. 테스트에서는 가짜를 넣는다. */
export type Engine = { isAvailable: () => boolean; runTurn: (input: EngineTurnInput) => Promise<EngineTurn> };

/** 세션 id → 그 세션을 만든 엔진과 모델. 이어 가는 턴은 요청의 엔진·모델이 아니라 이 값을 쓴다. */
const sessions = new Map<string, { engine: LlmEngine; model: string }>();

/**
 * 한 턴을 돌리고 결과와 함께 로그 한 줄을 남긴다. DB에는 아무것도 남기지 않는다(결정 8).
 *
 * @throws {LlmFailure} 세션이 없거나, 엔진 인증 정보가 없거나, 엔진이 실패·시간 초과했을 때
 */
export async function runConversationTurn(request: LlmTurnRequest, engines: Record<LlmEngine, Engine>): Promise<EngineTurn> {
  const session = request.sessionId ? sessions.get(request.sessionId) : { engine: request.engine, model: request.model };
  if (!session) throw new LlmFailure('conversation-expired', '대화 세션이 없습니다. llm 서비스가 재시작되었을 수 있습니다');
  if (!request.sessionId && !request.entry) throw new LlmFailure('llm-failed', '첫 질문에는 Entry가 필요합니다');
  const engine = engines[session.engine];
  if (!engine.isAvailable()) throw new LlmFailure('llm-unavailable', `${session.engine} 인증 정보가 없습니다`);

  const prompt = request.entry && !request.sessionId ? buildFirstTurnPrompt(request.entry, request.question) : request.question;
  const signal = AbortSignal.timeout(TURN_TIMEOUT_MILLISECONDS);
  const startedAt = Date.now();
  const label = `[llm] ${session.engine}/${session.model} ${request.sessionId ? '이어 가기' : '첫 질문'}`;
  try {
    const turn = await engine.runTurn({ model: session.model, prompt, sessionId: request.sessionId, signal });
    sessions.set(turn.sessionId, session);
    console.log(`${label} 성공 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return turn;
  } catch (error) {
    const failure = signal.aborted
      ? new LlmFailure('llm-timeout', `${TURN_TIMEOUT_MILLISECONDS / 1000}초 안에 답하지 않았습니다`)
      : error instanceof LlmFailure
        ? error
        : new LlmFailure('llm-failed', String(error).slice(0, 500));
    console.log(`${label} 실패(${failure.reason}) ${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${failure.message}`);
    throw failure;
  }
}
