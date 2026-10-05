/**
 * Entry 대화 한 턴을 pi-ai로 모델에 보낸다(ADR-0018).
 *
 * pi-ai는 대화 상태를 갖지 않으므로, 이 모듈이 세션 id → 엔진·모델·메시지 배열을 메모리에 둔다.
 * 이 표는 프로세스(컨테이너)와 함께 사라지므로, 표에 없는 id는 만료된 대화다.
 */
import { randomUUID } from 'node:crypto';
import type { Context } from '@earendil-works/pi-ai';
import type { Models } from '@earendil-works/pi-ai/models';
import type { EntryConversationTurnView, LlmEngine, LlmTurnRequest } from '@trendboda/api-types';
import { buildFirstTurnPrompt, ENTRY_CONVERSATION_INSTRUCTIONS } from './entry-conversation-prompt.ts';
import { LlmFailure } from './llm-failure.ts';

/** 한 턴이 이보다 오래 걸리면 끊는다. 앱 서버는 이보다 조금 더 기다린다. */
export const TURN_TIMEOUT_MILLISECONDS = 180_000;

/** 메모리에 두는 대화 수. 넘으면 가장 오래 쓰지 않은 대화부터 지운다. 대화마다 원문 본문(최대 6만 자)을 들고 있다. */
const MAX_SESSIONS = 100;

/** 대화 하나. 이어 가는 턴은 요청의 엔진·모델이 아니라 처음 만든 값을 쓴다. */
type Session = { engine: LlmEngine; model: string; context: Context };

const sessions = new Map<string, Session>();

/**
 * 한 턴을 돌리고 결과와 함께 로그 한 줄을 남긴다. DB에는 아무것도 남기지 않는다(ADR-0015 결정 8).
 *
 * @param models - 세 provider를 등록한 pi-ai 모델 모음. 테스트에서는 가짜 provider를 넣는다.
 * @throws {LlmFailure} 세션이 없거나, 엔진 인증 정보가 없거나, 모델이 실패·시간 초과했을 때
 */
export async function runConversationTurn(request: LlmTurnRequest, models: Models): Promise<EntryConversationTurnView> {
  const resumed = request.sessionId ? sessions.get(request.sessionId) : undefined;
  if (request.sessionId && !resumed) throw new LlmFailure('conversation-expired', '대화 세션이 없습니다. llm 서비스가 재시작되었을 수 있습니다');
  if (!resumed && !request.entry) throw new LlmFailure('llm-failed', '첫 질문에는 Entry가 필요합니다');
  const session: Session = resumed ?? {
    engine: request.engine,
    model: request.model,
    context: { systemPrompt: ENTRY_CONVERSATION_INSTRUCTIONS, messages: [] },
  };
  const model = models.getModel(session.engine, session.model);
  if (!model) throw new LlmFailure('llm-failed', `${session.engine}에 ${session.model} 모델이 없습니다`);
  if (!(await models.checkAuth(session.engine))) throw new LlmFailure('llm-unavailable', `${session.engine} 인증 정보가 없습니다`);

  const content = resumed || !request.entry ? request.question : buildFirstTurnPrompt(request.entry, request.question);
  const messages = [...session.context.messages, { role: 'user' as const, content, timestamp: Date.now() }];
  const signal = AbortSignal.timeout(TURN_TIMEOUT_MILLISECONDS);
  const startedAt = Date.now();
  const label = `[llm] ${session.engine}/${session.model} ${resumed ? '이어 가기' : '첫 질문'}`;

  // pi-ai는 실패해도 던지지 않고 stopReason이 error·aborted인 메시지를 돌려준다.
  const reply = await models.completeSimple(model, { ...session.context, messages }, { signal });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (reply.stopReason === 'error' || reply.stopReason === 'aborted') {
    const failure = signal.aborted
      ? new LlmFailure('llm-timeout', `${TURN_TIMEOUT_MILLISECONDS / 1000}초 안에 답하지 않았습니다`)
      : new LlmFailure('llm-failed', (reply.errorMessage ?? '모델이 답하지 못했습니다').slice(0, 500));
    console.log(`${label} 실패(${failure.reason}) ${seconds}s: ${failure.message}`);
    throw failure;
  }

  // 성공한 턴만 기록에 넣는다. 실패한 질문은 다시 보내면 된다.
  session.context.messages = [...messages, reply];
  const sessionId = request.sessionId ?? randomUUID();
  sessions.delete(sessionId);
  sessions.set(sessionId, session);
  if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
  console.log(`${label} 성공 ${seconds}s, 입력 ${reply.usage.input} 출력 ${reply.usage.output} 토큰`);

  const answer = reply.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  return { sessionId, answer };
}
