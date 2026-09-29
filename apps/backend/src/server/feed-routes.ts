/**
 * Feed 단위 API: Feed 목록, Feed의 Entry 조회, Read Cursor 이동, Ranked Feed의 순위표.
 */
import { and, asc, desc, eq, exists, gt, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { EntryView, FeedSummary, MoveReadCursorRequest, RankSnapshotView } from '@trendboda/api-types';
import { database } from '../db/database-client.ts';
import { entry, feed } from '../db/schema.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { entryViewColumns, toEntryView } from './entry-view.ts';
import { loadRankSnapshotView } from './rank-snapshot-view.ts';

/** 한 번에 돌려주는 Entry 수의 기본값과 상한. */
const DEFAULT_ENTRY_PAGE_SIZE = 50;
const MAX_ENTRY_PAGE_SIZE = 200;

const feedIdParamsSchema = {
  type: 'object',
  required: ['feedId'],
  properties: { feedId: { type: 'string' } },
} as const;

/** Feed 관련 라우트를 등록한다. */
export async function registerFeedRoutes(server: FastifyInstance): Promise<void> {
  /**
   * 선언된 Feed 목록을 선언 순서대로 돌려준다.
   * 선언에서 빠진 Feed는 DB에 남아 있어도 보이지 않는다(ADR-0004).
   */
  server.get('/api/feeds', async (): Promise<FeedSummary[]> => {
    const rows = await database
      .select({
        id: feed.id,
        readCursorEntryId: feed.readCursorEntryId,
        consecutiveFailures: feed.consecutiveFailures,
        nextRunAt: feed.nextRunAt,
        // 한 테이블만 조회하면 Drizzle이 컬럼 앞의 테이블 이름을 생략해서 하위 쿼리의 id가 모호해진다.
        // 그래서 하위 쿼리는 별칭(candidate)과 "feed".컬럼으로 직접 쓴다.
        // ponytail: Feed마다 하위 쿼리 두 번. Feed가 수백 개가 되면 한 번의 GROUP BY로 바꾼다.
        unreadCount: sql<number>`(select count(*)::int from entry as candidate where candidate.feed_id = "feed"."id" and candidate.id > coalesce("feed"."read_cursor_entry_id", 0))`,
        latestEntryId: sql<number | null>`(select max(candidate.id)::int from entry as candidate where candidate.feed_id = "feed"."id")`,
        // 최신 Rank Snapshot에서 그 수집 때 처음 발견한 Entry 수(ADR-0009). Stream Feed는 Snapshot이 없어서 0이다.
        rankSnapshotNewCount: sql<number>`(
          select count(*)::int
          from rank_snapshot as ranked
          join entry as ranked_entry on ranked_entry.id = ranked.entry_id
          join fetch_attempt as latest_attempt on latest_attempt.id = ranked.fetch_attempt_id
          where latest_attempt.id = (
            select max(snapshot_attempt.id) from fetch_attempt as snapshot_attempt
            where snapshot_attempt.feed_id = "feed"."id"
              and exists (select 1 from rank_snapshot as any_rank where any_rank.fetch_attempt_id = snapshot_attempt.id)
          )
          and ranked_entry.first_seen_at >= latest_attempt.started_at
        )`,
      })
      .from(feed);
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    return feedDefinitions.flatMap((definition): FeedSummary[] => {
      const row = rowsById.get(definition.id);
      if (!row) return [];
      const kind = definition.kind ?? 'stream';
      return [
        {
          ...row,
          title: definition.title,
          kind,
          // Ranked Feed에는 Read Cursor가 없다(ADR-0009). Stream Feed였던 때의 커서가 남아 있어도 세지 않는다.
          unreadCount: kind === 'ranked' ? 0 : row.unreadCount,
          nextRunAt: row.nextRunAt.toISOString(),
        },
      ];
    });
  });

  /**
   * Feed의 Entry를 id 오름차순(오래된 것 → 새것)으로 돌려준다.
   * - `after`: 이 id보다 새로운 Entry를 앞에서부터 (아래로 스크롤, 안 읽음 불러오기)
   * - `before`: 이 id보다 오래된 Entry 중 가장 가까운 것들 (위로 스크롤)
   */
  server.get<{
    Params: { feedId: string };
    Querystring: { after?: number; before?: number; limit: number };
  }>(
    '/api/feeds/:feedId/entries',
    {
      schema: {
        params: feedIdParamsSchema,
        querystring: {
          type: 'object',
          properties: {
            after: { type: 'integer', minimum: 0 },
            before: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: MAX_ENTRY_PAGE_SIZE, default: DEFAULT_ENTRY_PAGE_SIZE },
          },
        },
      },
    },
    async (request): Promise<EntryView[]> => {
      const { feedId } = request.params;
      const { after, before, limit } = request.query;
      if (before !== undefined) {
        const rows = await database
          .select(entryViewColumns)
          .from(entry)
          .where(and(eq(entry.feedId, feedId), lt(entry.id, before)))
          .orderBy(desc(entry.id))
          .limit(limit);
        return rows.reverse().map(toEntryView);
      }
      const rows = await database
        .select(entryViewColumns)
        .from(entry)
        .where(and(eq(entry.feedId, feedId), gt(entry.id, after ?? 0)))
        .orderBy(asc(entry.id))
        .limit(limit);
      return rows.map(toEntryView);
    },
  );

  /** Ranked Feed의 최신 Rank Snapshot을 직전과 비교해 돌려준다(ADR-0009). 선언되지 않았거나 Stream Feed면 404다. */
  server.get<{ Params: { feedId: string } }>(
    '/api/feeds/:feedId/rank-snapshot',
    { schema: { params: feedIdParamsSchema } },
    async (request, reply): Promise<RankSnapshotView> => {
      const { feedId } = request.params;
      const definition = feedDefinitions.find((candidate) => candidate.id === feedId);
      if (definition?.kind !== 'ranked') return reply.code(404).send({ message: 'Ranked Feed가 아닙니다' });
      return loadRankSnapshotView(feedId);
    },
  );

  /**
   * Read Cursor를 옮긴다. 최신 쪽으로만 움직이므로 지금 커서보다 작은 값은 무시한다.
   * 다른 Feed의 Entry id를 보내면 404, Ranked Feed면 409다(Read Cursor가 없다, ADR-0009).
   */
  server.put<{ Params: { feedId: string }; Body: MoveReadCursorRequest }>(
    '/api/feeds/:feedId/read-cursor',
    {
      schema: {
        params: feedIdParamsSchema,
        body: {
          type: 'object',
          required: ['entryId'],
          properties: { entryId: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { feedId } = request.params;
      const { entryId } = request.body;
      if (feedDefinitions.find((candidate) => candidate.id === feedId)?.kind === 'ranked') {
        return reply.code(409).send({ message: 'Ranked Feed에는 Read Cursor가 없습니다' });
      }
      const updated = await database
        .update(feed)
        .set({ readCursorEntryId: sql`greatest(coalesce(${feed.readCursorEntryId}, 0), ${entryId})` })
        .where(
          and(
            eq(feed.id, feedId),
            exists(
              database
                .select({ id: entry.id })
                .from(entry)
                .where(and(eq(entry.id, entryId), eq(entry.feedId, feedId))),
            ),
          ),
        )
        .returning({ readCursorEntryId: feed.readCursorEntryId });
      if (updated.length === 0) return reply.code(404).send({ message: '해당 Feed의 Entry가 아닙니다' });
      return updated[0];
    },
  );
}
