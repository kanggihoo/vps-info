/**
 * Entry 대화 API(ADR-0015). 화면의 요청을 `llm` 서비스로 넘긴다.
 *
 * 엔진(Claude·Codex CLI)은 셸을 가진 에이전트라 DB 자격 증명이 있는 이 컨테이너에서 띄우지 않고 `llm` 컨테이너에서 돌린다.
 * 첫 질문의 Entry 제목·주소·요약은 화면이 보낸 값이 아니라 DB에서 채운다. 원문 본문만 화면이 읽어 둔 것을 받는다.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorBody, EntryConversationTurnRequest, EntryConversationTurnView, LlmModelsView, LlmTurnRequest } from '@trendboda/api-types';
import { database } from '../db/database-client.ts';
import { entry } from '../db/schema.ts';

/** `llm` 서비스가 한 턴에 쓰는 시간(180초)보다 조금 더 기다린다. */
const TURN_TIMEOUT_MILLISECONDS = 190_000;
/** 원문 본문이 실려 오므로 Fastify 기본 상한(1MB)보다 크게 둔다. `llm`이 프롬프트에 넣을 때 다시 자른다. */
const TURN_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

/** `llm` 서비스에 요청을 보내는 함수. 테스트에서는 가짜를 넣는다. */
export type LlmRequester = (path: '/models' | '/turns', init?: { body: LlmTurnRequest; signal: AbortSignal }) => Promise<Response>;

/** `LLM_URL`(예: `http://llm:8100`)로 요청 함수를 만든다. 없으면 대화를 끈다. */
export function makeLlmRequester(baseUrl: string | undefined): LlmRequester | undefined {
  if (!baseUrl) return undefined;
  return (path, init) =>
    fetch(`${baseUrl}${path}`, {
      method: init ? 'POST' : 'GET',
      headers: init ? { 'content-type': 'application/json' } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
}

export type ConversationRouteOptions = { requestLlm: LlmRequester | undefined };

const turnSchema = {
  params: { type: 'object', required: ['entryId'], properties: { entryId: { type: 'integer', minimum: 1 } } },
  body: {
    type: 'object',
    required: ['question', 'sessionId', 'engine', 'model', 'original'],
    properties: {
      question: { type: 'string', minLength: 1, maxLength: 4000 },
      sessionId: { type: ['string', 'null'], maxLength: 200 },
      engine: { enum: ['claude', 'codex'] },
      model: { type: 'string', minLength: 1, maxLength: 100 },
      original: { type: ['string', 'null'] },
    },
  },
} as const;

const disabled = { message: '서버에 llm 서비스 주소(LLM_URL)가 없습니다', reason: 'llm-disabled' } satisfies ApiErrorBody;
const unreachable = { message: 'llm 서비스에 연결하지 못했습니다', reason: 'llm-unreachable' } satisfies ApiErrorBody;

/** Entry 대화 라우트를 등록한다. */
export async function registerConversationRoutes(server: FastifyInstance, { requestLlm }: ConversationRouteOptions): Promise<void> {
  /** 엔진별 사용 가능 여부와 모델 목록. 화면의 엔진·모델 드롭다운이 쓴다. */
  server.get('/api/llm/models', async (request, reply): Promise<LlmModelsView> => {
    if (!requestLlm) return reply.code(503).send(disabled);
    try {
      const response = await requestLlm('/models');
      return reply.code(response.status).send(await response.json());
    } catch (error) {
      request.log.warn({ error: String(error) }, unreachable.message);
      return reply.code(503).send(unreachable);
    }
  });

  /** 대화 한 턴. 이어 가는 대화는 질문만 넘기고, 대화 기록은 `llm`의 엔진 세션이 들고 있다. */
  server.post<{ Params: { entryId: number }; Body: EntryConversationTurnRequest }>(
    '/api/entries/:entryId/conversation',
    { schema: turnSchema, bodyLimit: TURN_BODY_LIMIT_BYTES },
    async (request, reply): Promise<EntryConversationTurnView> => {
      if (!requestLlm) return reply.code(503).send(disabled);
      const { original, ...turn } = request.body;
      let entryContext: LlmTurnRequest['entry'] = null;
      if (turn.sessionId === null) {
        const [row] = await database
          .select({ title: entry.title, url: entry.url, summary: entry.summary })
          .from(entry)
          .where(eq(entry.id, request.params.entryId));
        if (!row) return reply.code(404).send({ message: 'Entry가 없습니다' } satisfies ApiErrorBody);
        entryContext = { ...row, original };
      }

      let response: Response;
      try {
        response = await requestLlm('/turns', { body: { ...turn, entry: entryContext }, signal: AbortSignal.timeout(TURN_TIMEOUT_MILLISECONDS) });
      } catch (error) {
        request.log.warn({ error: String(error) }, unreachable.message);
        return reply.code(503).send(unreachable);
      }
      // `llm`의 성공·실패 응답은 화면이 받을 모양(`EntryConversationTurnView`, `ApiErrorBody`) 그대로다.
      return reply.code(response.status).send(await response.json());
    },
  );
}
