import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, EntryConversationTurnRequest, LlmTurnRequest } from '@trendboda/api-types';
import { connectionPool, database } from '../db/database-client.ts';
import { entry, feed } from '../db/schema.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { buildServer } from './build-server.ts';
import type { LlmRequester } from './conversation-routes.ts';

let server: FastifyInstance | undefined;
/** 가짜 `llm` 서비스가 받은 본문. */
let sentBodies: LlmTurnRequest[] = [];

const fakeLlm: LlmRequester = async (_path, init) => {
  if (init) sentBodies.push(init.body);
  return Response.json({ sessionId: 'session-1', answer: '답' });
};

const firstTurn: EntryConversationTurnRequest = { question: '요약해 줘', sessionId: null, engine: 'anthropic', model: 'sonnet', original: '# 본문' };

beforeEach(async () => {
  sentBodies = [];
  await resetDatabase();
  await database.insert(feed).values({ id: 'geeknews', intervalMinutes: 60 });
  await database.insert(entry).values({ feedId: 'geeknews', dedupKey: 'ext:1', url: 'https://example.com/1', title: 'Queues in Postgres', summary: 'Why a table can be a queue.', raw: {} });
});
afterEach(async () => {
  await server?.close();
  server = undefined;
});
afterAll(async () => {
  await connectionPool.end();
});

describe('POST /api/entries/:entryId/conversation', () => {
  it('첫 질문은 DB의 Entry와 화면이 보낸 원문 본문을 함께 넘기고, 이어 가는 질문은 Entry 없이 넘긴다', async () => {
    server = await buildServer({ logger: false, translateTexts: null, requestLlm: fakeLlm });

    const first = await server.inject({ method: 'POST', url: '/api/entries/1/conversation', payload: firstTurn });
    await server.inject({ method: 'POST', url: '/api/entries/1/conversation', payload: { ...firstTurn, question: '더', sessionId: 'session-1' } });

    expect(first.json()).toEqual({ sessionId: 'session-1', answer: '답' });
    expect(sentBodies).toEqual([
      {
        question: '요약해 줘',
        sessionId: null,
        engine: 'anthropic',
        model: 'sonnet',
        entry: { title: 'Queues in Postgres', url: 'https://example.com/1', summary: 'Why a table can be a queue.', original: '# 본문' },
      },
      { question: '더', sessionId: 'session-1', engine: 'anthropic', model: 'sonnet', entry: null },
    ]);
  });

  it('없는 Entry의 첫 질문은 llm에 보내지 않고 404다', async () => {
    server = await buildServer({ logger: false, translateTexts: null, requestLlm: fakeLlm });
    const response = await server.inject({ method: 'POST', url: '/api/entries/999/conversation', payload: firstTurn });
    expect(response.statusCode).toBe(404);
    expect(sentBodies).toEqual([]);
  });

  it('llm의 실패 응답은 상태와 이유를 그대로 전한다', async () => {
    const expired = { message: '대화 세션이 없습니다', reason: 'conversation-expired' } satisfies ApiErrorBody;
    server = await buildServer({ logger: false, translateTexts: null, requestLlm: async () => Response.json(expired, { status: 410 }) });
    const response = await server.inject({ method: 'POST', url: '/api/entries/1/conversation', payload: { ...firstTurn, sessionId: 'gone' } });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toEqual(expired);
  });

  it('llm 서비스 주소가 없으면 503 llm-disabled다', async () => {
    server = await buildServer({ logger: false, translateTexts: null, requestLlm: null });
    const response = await server.inject({ method: 'POST', url: '/api/entries/1/conversation', payload: firstTurn });
    expect(response.statusCode).toBe(503);
    expect(response.json<ApiErrorBody>().reason).toBe('llm-disabled');
  });
});
