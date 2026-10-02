/** Feed 운영·수집기 응답·외부 사용량 조회 API. 실제 수집은 기존 collector에 요청한다(ADR-0017). */
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AdminAttemptPage, AdminFetchAttempt, AdminOverview, DeepLUsageView, UpdateAdminFeedRequest } from '@trendboda/api-types';
import { computeNextRunAt } from '../collector/next-run-time.ts';
import { database } from '../db/database-client.ts';
import { collectorHeartbeat, feed, fetchAttempt } from '../db/schema.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { describeCollectorStatus } from './collector-status.ts';
import { fetchDeepLUsage } from './deepl-usage.ts';

const attemptColumns = {
  id: fetchAttempt.id, feedId: fetchAttempt.feedId, status: fetchAttempt.status, startedAt: fetchAttempt.startedAt,
  finishedAt: fetchAttempt.finishedAt, insertedEntryCount: fetchAttempt.insertedEntryCount, errorMessage: fetchAttempt.errorMessage,
};

function toAttempt(row: typeof fetchAttempt.$inferSelect): AdminFetchAttempt {
  return { ...row, startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null };
}

const feedParamsSchema = { type: 'object', required: ['feedId'], properties: { feedId: { type: 'string' } } } as const;

/** DeepL 조회를 테스트에서 대체할 수 있는 옵션. null이면 설정 없음으로 표시한다. */
export type AdminRouteOptions = { readDeepLUsage?: (() => Promise<DeepLUsageView>) | null };

/** 관리자 API를 등록한다. 로그인은 기존 nginx Basic Auth를 따르고 브라우저의 외부 사이트 쓰기 요청은 거부한다. */
export async function registerAdminRoutes(server: FastifyInstance, options: AdminRouteOptions): Promise<void> {
  server.addHook('onRequest', async (request, reply) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
    const origin = request.headers.origin;
    let foreignOrigin = false;
    if (origin) {
      try { foreignOrigin = new URL(origin).host !== request.headers.host; }
      catch { foreignOrigin = true; }
    }
    if (request.headers['sec-fetch-site'] === 'cross-site' || foreignOrigin) {
      return reply.code(403).send({ message: '관리 요청은 같은 서비스 화면에서 보내야 합니다.' });
    }
  });

  server.get('/api/admin/overview', async (): Promise<AdminOverview> => {
    const rows = await database.select({ id: feed.id, intervalMinutes: feed.intervalMinutes, nextRunAt: feed.nextRunAt,
      paused: feed.paused, manualRequestedAt: feed.manualRequestedAt, consecutiveFailures: feed.consecutiveFailures }).from(feed);
    const latest = await database.selectDistinctOn([fetchAttempt.feedId], attemptColumns).from(fetchAttempt)
      .orderBy(fetchAttempt.feedId, desc(fetchAttempt.id));
    const successes = await database.select({ feedId: fetchAttempt.feedId, lastSuccessAt: sql<Date | string | null>`max(${fetchAttempt.finishedAt})` })
      .from(fetchAttempt).where(eq(fetchAttempt.status, 'success')).groupBy(fetchAttempt.feedId);
    const [heartbeat] = await database.select({ lastSeenAt: collectorHeartbeat.lastSeenAt, stoppedAt: collectorHeartbeat.stoppedAt })
      .from(collectorHeartbeat).where(eq(collectorHeartbeat.id, 'main'));
    const [running] = await database.select({ feedId: fetchAttempt.feedId }).from(fetchAttempt)
      .where(eq(fetchAttempt.status, 'running')).orderBy(desc(fetchAttempt.id)).limit(1);
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const latestById = new Map(latest.map((row) => [row.feedId, toAttempt(row)]));
    const successesById = new Map(successes.map((row) => [row.feedId, row.lastSuccessAt ? new Date(row.lastSuccessAt).toISOString() : null]));
    return {
      collector: describeCollectorStatus(heartbeat, running?.feedId ?? null),
      feeds: feedDefinitions.flatMap((definition) => {
        const row = rowsById.get(definition.id);
        return row ? [{ ...row, title: definition.title, kind: definition.kind ?? 'stream', wanted: definition.handler === 'wanted',
          nextRunAt: row.nextRunAt.toISOString(), manualRequestedAt: row.manualRequestedAt?.toISOString() ?? null,
          latestAttempt: latestById.get(row.id) ?? null, lastSuccessAt: successesById.get(row.id) ?? null }] : [];
      }),
    };
  });

  server.patch<{ Params: { feedId: string }; Body: UpdateAdminFeedRequest }>('/api/admin/feeds/:feedId', {
    schema: { params: feedParamsSchema, body: { type: 'object', additionalProperties: false, minProperties: 1,
      properties: { intervalMinutes: { type: 'integer', minimum: 1, maximum: 525600 }, paused: { type: 'boolean' } } } },
  }, async (request, reply) => {
    const definition = feedDefinitions.find((candidate) => candidate.id === request.params.feedId);
    if (!definition) return reply.code(404).send({ message: '없는 Feed입니다.' });
    if (definition.handler === 'wanted') return reply.code(409).send({ message: '원티드는 맥에서 수집을 요청하므로 주기·일시정지를 변경하지 않습니다.' });
    const updated = await database.transaction(async (transaction) => {
      const [current] = await transaction.select({ intervalMinutes: feed.intervalMinutes, consecutiveFailures: feed.consecutiveFailures, paused: feed.paused,
        nextRunAt: feed.nextRunAt, scheduleRevision: feed.scheduleRevision }).from(feed).where(eq(feed.id, definition.id)).for('update');
      if (!current) return false;
      const { intervalMinutes = current.intervalMinutes, paused = current.paused } = request.body;
      const now = new Date();
      const nextRunAt = current.paused && !paused ? now : request.body.intervalMinutes !== undefined
        ? computeNextRunAt(current.consecutiveFailures, intervalMinutes, now) : current.nextRunAt;
      await transaction.update(feed).set({ intervalMinutes, paused, nextRunAt, scheduleRevision: current.scheduleRevision + 1 }).where(eq(feed.id, definition.id));
      return true;
    });
    return updated ? reply.code(204).send() : reply.code(404).send({ message: '등록되지 않은 Feed입니다.' });
  });

  server.post<{ Params: { feedId: string } }>('/api/admin/feeds/:feedId/fetch', { schema: { params: feedParamsSchema } }, async (request, reply) => {
    const definition = feedDefinitions.find((candidate) => candidate.id === request.params.feedId);
    if (!definition) return reply.code(404).send({ message: '없는 Feed입니다.' });
    const result = await database.transaction(async (transaction) => {
      const [current] = await transaction.select({ manualRequestedAt: feed.manualRequestedAt }).from(feed).where(eq(feed.id, definition.id)).for('update');
      if (!current) return 'missing';
      const [running] = await transaction.select({ id: fetchAttempt.id }).from(fetchAttempt)
        .where(and(eq(fetchAttempt.feedId, definition.id), eq(fetchAttempt.status, 'running'))).limit(1);
      if (current.manualRequestedAt || running) return 'duplicate';
      await transaction.update(feed).set({ manualRequestedAt: new Date() }).where(eq(feed.id, definition.id));
      return 'accepted';
    });
    if (result === 'missing') return reply.code(404).send({ message: '등록되지 않은 Feed입니다.' });
    if (result === 'duplicate') return reply.code(409).send({ message: '이미 수집 요청이 대기 중이거나 실행 중입니다.' });
    return reply.code(202).send({ message: '수집을 요청했습니다.' });
  });

  server.get<{ Params: { feedId: string }; Querystring: { before?: number; status?: 'success' | 'failed' } }>('/api/admin/feeds/:feedId/attempts', {
    schema: { params: feedParamsSchema, querystring: { type: 'object', properties: {
      before: { type: 'integer', minimum: 1 }, status: { enum: ['success', 'failed'] },
    } } },
  }, async (request, reply): Promise<AdminAttemptPage> => {
    if (!feedDefinitions.some((definition) => definition.id === request.params.feedId)) return reply.code(404).send({ message: '없는 Feed입니다.' });
    const { before, status } = request.query;
    const rows = await database.select(attemptColumns).from(fetchAttempt).where(and(eq(fetchAttempt.feedId, request.params.feedId),
      before === undefined ? undefined : lt(fetchAttempt.id, before), status === undefined ? undefined : eq(fetchAttempt.status, status)))
      .orderBy(desc(fetchAttempt.id)).limit(51);
    const page = rows.slice(0, 50);
    return { attempts: page.map(toAttempt), nextBefore: rows.length > 50 ? page.at(-1)!.id : null };
  });

  server.get('/api/admin/deepl/usage', async (_request, reply): Promise<DeepLUsageView> => {
    const apiKey = process.env.DEEPL_API_KEY?.trim();
    const readUsage = options.readDeepLUsage === undefined ? (apiKey ? () => fetchDeepLUsage(apiKey) : null) : options.readDeepLUsage;
    if (!readUsage) return reply.code(503).send({ message: 'DeepL API 키가 설정되지 않았습니다.', reason: 'translation-disabled' });
    try { return await readUsage(); }
    catch { return reply.code(502).send({ message: 'DeepL 사용량을 조회하지 못했습니다. API 키와 연결을 확인하세요.' }); }
  });
}
