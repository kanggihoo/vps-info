import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminAttemptPage, AdminOverview } from '@trendboda/api-types';
import { runDueFeeds } from '../collector/feed-scheduler.ts';
import { connectionPool, database } from '../db/database-client.ts';
import { collectorHeartbeat, feed, fetchAttempt } from '../db/schema.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { buildServer } from './build-server.ts';

let server: FastifyInstance;
const geeknews = feedDefinitions.find((definition) => definition.id === 'geeknews')!;
const producthunt = feedDefinitions.find((definition) => definition.id === 'producthunt')!;
const patch = (feedId: string, payload: Record<string, unknown>) => server.inject({ method: 'PATCH', url: `/api/admin/feeds/${feedId}`, payload });
const requestFetch = (feedId = 'geeknews') => server.inject({ method: 'POST', url: `/api/admin/feeds/${feedId}/fetch` });
const collect = () => runDueFeeds([geeknews], async () => [{ title: '글', url: 'https://example.com/1', raw: {} }]);

beforeAll(async () => { server = await buildServer({ logger: false, readDeepLUsage: null, requestLlm: null, translateTexts: null }); });
beforeEach(async () => {
  await resetDatabase();
  await database.insert(feed).values([
    { id: 'geeknews', intervalMinutes: 60 }, { id: 'producthunt', intervalMinutes: 180 },
    { id: 'wanted-backend', intervalMinutes: 525600 }, { id: 'removed', intervalMinutes: 60 },
  ]);
});
afterAll(async () => { await server.close(); await connectionPool.end(); });

describe('관리 API와 collector', () => {
  it('일시정지한 Feed는 자동 수집하지 않지만 수동 요청은 한 번 실행한다', async () => {
    expect((await patch('geeknews', { paused: true })).statusCode).toBe(204);
    expect(await collect()).toEqual([]);
    const requests = await Promise.all([requestFetch(), requestFetch()]);
    expect(requests.map((response) => response.statusCode).sort()).toEqual([202, 409]);
    expect(await collect()).toEqual(['geeknews']);
    expect(await collect()).toEqual([]);
    const [current] = await database.select({ paused: feed.paused, requested: feed.manualRequestedAt }).from(feed).where(eq(feed.id, 'geeknews'));
    expect(current).toEqual({ paused: true, requested: null });
    expect((await patch('geeknews', { paused: false })).statusCode).toBe(204);
    expect(await collect()).toEqual(['geeknews']);
  });

  it('주기 변경은 기존 실패 백오프를 쓰고 실패 수를 초기화하지 않는다', async () => {
    await database.update(feed).set({ consecutiveFailures: 2 }).where(eq(feed.id, 'geeknews'));
    expect((await patch('geeknews', { intervalMinutes: 10 })).statusCode).toBe(204);
    const [current] = await database.select({ intervalMinutes: feed.intervalMinutes, failures: feed.consecutiveFailures, nextRunAt: feed.nextRunAt }).from(feed).where(eq(feed.id, 'geeknews'));
    expect(current).toMatchObject({ intervalMinutes: 10, failures: 2 });
    expect((current.nextRunAt.getTime() - Date.now()) / 60000).toBeCloseTo(10, 1);
  });

  it('실행 중 중복 요청을 거부하고 운영자가 바꾼 주기·일시정지를 완료가 덮어쓰지 않는다', async () => {
    await runDueFeeds([geeknews], async () => {
      expect((await requestFetch()).statusCode).toBe(409);
      expect((await patch('geeknews', { intervalMinutes: 120, paused: true })).statusCode).toBe(204);
      return [{ title: '글', url: 'https://example.com/1', raw: {} }];
    });
    const [current] = await database.select({ intervalMinutes: feed.intervalMinutes, paused: feed.paused, nextRunAt: feed.nextRunAt }).from(feed).where(eq(feed.id, 'geeknews'));
    expect(current).toMatchObject({ intervalMinutes: 120, paused: true });
    expect((current.nextRunAt.getTime() - Date.now()) / 60000).toBeCloseTo(120, 1);
  });

  it('한 바퀴의 대기 목록에 있더라도 실행 직전에 바뀐 일시정지 상태를 확인한다', async () => {
    await database.update(feed).set({ nextRunAt: sql`now() - interval '1 minute'` }).where(eq(feed.id, 'geeknews'));
    const attempted = await runDueFeeds([geeknews, producthunt], async () => {
      await patch('producthunt', { paused: true });
      return [{ title: '글', url: 'https://example.com/1', raw: {} }];
    });
    expect(attempted).toEqual(['geeknews']);
  });

  it('원티드는 조회와 수동 요청만 허용하고 잘못된 값·미등록 Feed를 거부한다', async () => {
    expect((await patch('wanted-backend', { intervalMinutes: 60 })).statusCode).toBe(409);
    expect((await patch('wanted-backend', { paused: true })).statusCode).toBe(409);
    expect((await requestFetch('wanted-backend')).statusCode).toBe(202);
    expect((await patch('geeknews', { intervalMinutes: 0 })).statusCode).toBe(400);
    expect((await patch('geeknews', {})).statusCode).toBe(400);
    expect((await requestFetch('removed')).statusCode).toBe(404);
  });

  it('응답 기록과 최근 성공·오류를 표시하며 raw는 보내지 않는다', async () => {
    await collect();
    await database.insert(collectorHeartbeat).values({ id: 'main', lastSeenAt: new Date() });
    await database.insert(fetchAttempt).values({ feedId: 'geeknews', status: 'failed', finishedAt: new Date(), errorMessage: 'HTTP 403' });
    const overview = (await server.inject('/api/admin/overview')).json<AdminOverview>();
    expect(overview.collector.status).toBe('alive');
    expect(overview.feeds.map((item) => item.id)).toEqual(['geeknews', 'producthunt', 'wanted-backend']);
    expect(overview.feeds[0].lastSuccessAt).not.toBeNull();
    expect(overview.feeds[0].latestAttempt?.errorMessage).toBe('HTTP 403');
    expect(JSON.stringify(overview)).not.toContain('raw');
  });

  it('이력은 50건 페이지로 나누고 필터·Feed 범위를 유지한다', async () => {
    await database.insert(fetchAttempt).values(Array.from({ length: 52 }, (_, index): typeof fetchAttempt.$inferInsert => ({ feedId: 'geeknews', status: index % 2 ? 'success' : 'failed' })));
    await database.insert(fetchAttempt).values({ feedId: 'producthunt', status: 'failed' });
    const first = (await server.inject('/api/admin/feeds/geeknews/attempts')).json<AdminAttemptPage>();
    expect(first.attempts).toHaveLength(50);
    const second = (await server.inject(`/api/admin/feeds/geeknews/attempts?before=${first.nextBefore}`)).json<AdminAttemptPage>();
    expect(second.attempts).toHaveLength(2);
    expect(second.nextBefore).toBeNull();
    const failures = (await server.inject('/api/admin/feeds/geeknews/attempts?status=failed')).json<AdminAttemptPage>();
    expect(failures.attempts).toHaveLength(26);
    expect(failures.attempts.every((attempt) => attempt.status === 'failed')).toBe(true);
    expect((await server.inject('/api/admin/feeds/geeknews/attempts?status=invalid')).statusCode).toBe(400);
  });

  it('외부 사이트에서 Basic Auth가 자동 전송되더라도 관리 쓰기를 거부한다', async () => {
    const response = await server.inject({ method: 'POST', url: '/api/admin/feeds/geeknews/fetch', headers: { origin: 'https://other.example', 'sec-fetch-site': 'cross-site' } });
    expect(response.statusCode).toBe(403);
    expect((await server.inject('/api/admin/deepl/usage')).statusCode).toBe(503);
  });

  it('DeepL 사용량은 조회 결과만 전달하고 외부 오류 상세는 노출하지 않는다', async () => {
    const usage = { characterCount: 120, characterLimit: 500000, apiKeyCharacterCount: null, apiKeyCharacterLimit: null,
      periodStart: null, periodEnd: null, checkedAt: new Date().toISOString() };
    const usageServer = await buildServer({ logger: false, readDeepLUsage: async () => usage });
    const failedServer = await buildServer({ logger: false, readDeepLUsage: async () => { throw new Error('secret-test-key'); } });
    try {
      expect((await usageServer.inject('/api/admin/deepl/usage')).json()).toEqual(usage);
      const failed = await failedServer.inject('/api/admin/deepl/usage');
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain('secret-test-key');
    } finally { await usageServer.close(); await failedServer.close(); }
  });
});
