/**
 * Entry 단위 API: Opened At 기록, Bookmark 토글, Bookmark 목록.
 */
import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { BookmarkedEntryView } from '@trendboda/api-types';
import { database } from '../db/database-client.ts';
import { entry } from '../db/schema.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { entryViewColumns, toEntryView } from './entry-view.ts';

/** Bookmark 목록에서 돌려주는 최대 개수. ponytail: 넘치면 페이지를 나눈다. */
const MAX_BOOKMARK_COUNT = 500;

const entryIdParamsSchema = {
  type: 'object',
  required: ['entryId'],
  properties: { entryId: { type: 'integer', minimum: 1 } },
} as const;

type EntryIdRequest = { Params: { entryId: number } };

const feedTitlesById = new Map(feedDefinitions.map((definition) => [definition.id, definition.title]));

/** 한 행이라도 바뀌었으면 204, 해당 Entry가 없으면 404로 응답한다. */
function replyByUpdatedCount(reply: FastifyReply, updatedCount: number) {
  return updatedCount === 0 ? reply.code(404).send({ message: 'Entry가 없습니다' }) : reply.code(204).send();
}

/** Entry 관련 라우트를 등록한다. */
export async function registerEntryRoutes(server: FastifyInstance): Promise<void> {
  /** 원문 링크를 열었다고 기록한다. 처음 연 시각만 남기므로 여러 번 불러도 값이 바뀌지 않는다. */
  server.post<EntryIdRequest>('/api/entries/:entryId/open', { schema: { params: entryIdParamsSchema } }, async (request, reply) => {
    const updated = await database
      .update(entry)
      .set({ openedAt: sql`coalesce(${entry.openedAt}, now())` })
      .where(eq(entry.id, request.params.entryId))
      .returning({ id: entry.id });
    return replyByUpdatedCount(reply, updated.length);
  });

  /** Bookmark한다. 이미 Bookmark된 Entry는 처음 Bookmark한 시각을 유지한다. */
  server.put<EntryIdRequest>('/api/entries/:entryId/bookmark', { schema: { params: entryIdParamsSchema } }, async (request, reply) => {
    const updated = await database
      .update(entry)
      .set({ bookmarkedAt: sql`coalesce(${entry.bookmarkedAt}, now())` })
      .where(eq(entry.id, request.params.entryId))
      .returning({ id: entry.id });
    return replyByUpdatedCount(reply, updated.length);
  });

  /** Bookmark를 해제한다. */
  server.delete<EntryIdRequest>('/api/entries/:entryId/bookmark', { schema: { params: entryIdParamsSchema } }, async (request, reply) => {
    const updated = await database
      .update(entry)
      .set({ bookmarkedAt: null })
      .where(eq(entry.id, request.params.entryId))
      .returning({ id: entry.id });
    return replyByUpdatedCount(reply, updated.length);
  });

  /** 여러 Feed의 Bookmark를 최근에 Bookmark한 순서로 모아 돌려준다. */
  server.get('/api/bookmarks', async (): Promise<BookmarkedEntryView[]> => {
    const rows = await database
      .select(entryViewColumns)
      .from(entry)
      .where(isNotNull(entry.bookmarkedAt))
      .orderBy(desc(entry.bookmarkedAt))
      .limit(MAX_BOOKMARK_COUNT);
    return rows.map((row) => ({ ...toEntryView(row), feedTitle: feedTitlesById.get(row.feedId) ?? row.feedId }));
  });
}
