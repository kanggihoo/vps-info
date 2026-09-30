/**
 * Entry 단위 API: Entry 하나 조회, Opened At 기록, Bookmark 토글, Bookmark 목록, 원문 읽기, 번역(ADR-0011).
 */
import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ApiErrorBody, BookmarkedEntryView, FeedTitledEntryView, ReaderView, TranslationView } from '@trendboda/api-types';
import { database } from '../db/database-client.ts';
import { entry, entryTranslation } from '../db/schema.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { type TextTranslator, TranslationFailure } from './deepl-translator.ts';
import { entryViewColumns, toEntryView, translationJoin } from './entry-view.ts';
import { type OriginalPageFetcher, ReaderFailure } from './original-page.ts';
import { readOriginal } from './readable-content.ts';

/** Bookmark 목록에서 돌려주는 최대 개수. ponytail: 넘치면 페이지를 나눈다. */
const MAX_BOOKMARK_COUNT = 500;

const entryIdParamsSchema = {
  type: 'object',
  required: ['entryId'],
  properties: { entryId: { type: 'integer', minimum: 1 } },
} as const;

type EntryIdRequest = { Params: { entryId: number } };

/** Entry 라우트가 바깥 세계와 닿는 곳. 테스트에서는 가짜를 넣는다. */
export type EntryRouteOptions = {
  fetchOriginalPage: OriginalPageFetcher;
  /** DeepL 번역 함수. 키가 없으면 비워 두고, 번역 요청에 503으로 응답한다. */
  translateTexts: TextTranslator | undefined;
};

const feedTitlesById = new Map(feedDefinitions.map((definition) => [definition.id, definition.title]));

const entryNotFound = { message: 'Entry가 없습니다' } satisfies ApiErrorBody;

/** 한 행이라도 바뀌었으면 204, 해당 Entry가 없으면 404로 응답한다. */
function replyByUpdatedCount(reply: FastifyReply, updatedCount: number) {
  return updatedCount === 0 ? reply.code(404).send(entryNotFound) : reply.code(204).send();
}

/** Entry 관련 라우트를 등록한다. */
export async function registerEntryRoutes(server: FastifyInstance, options: EntryRouteOptions): Promise<void> {
  /** Entry 하나를 Feed 이름과 함께 돌려준다. 화면 주소로 Entry를 바로 펼칠 때 쓴다. */
  server.get<EntryIdRequest>(
    '/api/entries/:entryId',
    { schema: { params: entryIdParamsSchema } },
    async (request, reply): Promise<FeedTitledEntryView> => {
      const [row] = await database
        .select(entryViewColumns)
        .from(entry)
        .leftJoin(entryTranslation, translationJoin)
        .where(eq(entry.id, request.params.entryId));
      if (!row) return reply.code(404).send(entryNotFound);
      return { ...toEntryView(row), feedTitle: feedTitlesById.get(row.feedId) ?? row.feedId };
    },
  );

  /** Opened At을 기록한다(Entry를 펼치거나 원문을 열 때). 처음 연 시각만 남기므로 여러 번 불러도 값이 바뀌지 않는다. */
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
      .leftJoin(entryTranslation, translationJoin)
      .where(isNotNull(entry.bookmarkedAt))
      .orderBy(desc(entry.bookmarkedAt))
      .limit(MAX_BOOKMARK_COUNT);
    return rows.map((row) => ({ ...toEntryView(row), feedTitle: feedTitlesById.get(row.feedId) ?? row.feedId }));
  });

  /**
   * 원문 페이지를 가져와 본문을 Markdown으로 뽑아 돌려준다. 저장하지 않으므로 부를 때마다 원문을 다시 가져온다.
   * 받지 못했거나 본문이 비었으면 502와 실패 이유를 준다.
   */
  server.get<EntryIdRequest>(
    '/api/entries/:entryId/reader',
    { schema: { params: entryIdParamsSchema } },
    async (request, reply): Promise<ReaderView> => {
      const [row] = await database.select({ url: entry.url }).from(entry).where(eq(entry.id, request.params.entryId));
      if (!row) return reply.code(404).send(entryNotFound);
      try {
        return await readOriginal(row.url, options.fetchOriginalPage);
      } catch (error) {
        if (!(error instanceof ReaderFailure)) throw error;
        request.log.warn({ url: row.url, reason: error.reason }, error.message);
        return reply.code(502).send({ message: error.message, reason: error.reason } satisfies ApiErrorBody);
      }
    },
  );

  /**
   * 제목과 요약을 한국어로 번역해 저장하고 돌려준다. 이미 번역이 있으면 DeepL을 부르지 않는다.
   * 실패는 저장하지 않는다. 키가 없으면 503, DeepL이 실패하면 502와 실패 이유를 준다.
   */
  server.post<EntryIdRequest>(
    '/api/entries/:entryId/translation',
    { schema: { params: entryIdParamsSchema } },
    async (request, reply): Promise<TranslationView> => {
      const { entryId } = request.params;
      const [row] = await database
        .select({ title: entry.title, summary: entry.summary, translatedTitle: entryTranslation.title, translatedSummary: entryTranslation.summary })
        .from(entry)
        .leftJoin(entryTranslation, translationJoin)
        .where(eq(entry.id, entryId));
      if (!row) return reply.code(404).send(entryNotFound);
      if (row.translatedTitle !== null) return { translatedTitle: row.translatedTitle, translatedSummary: row.translatedSummary };
      if (!options.translateTexts) {
        return reply.code(503).send({ message: '서버에 DeepL 키가 없습니다', reason: 'translation-disabled' } satisfies ApiErrorBody);
      }

      let translated: string[];
      try {
        translated = await options.translateTexts(row.summary ? [row.title, row.summary] : [row.title]);
      } catch (error) {
        if (!(error instanceof TranslationFailure)) throw error;
        request.log.warn({ entryId, reason: error.reason }, error.message);
        return reply.code(502).send({ message: error.message, reason: error.reason } satisfies ApiErrorBody);
      }
      const [translatedTitle, translatedSummary = null] = translated;
      // 두 요청이 겹쳐도 같은 Entry의 번역이라 나중에 쓴 쪽이 남으면 된다.
      await database
        .insert(entryTranslation)
        .values({ entryId, title: translatedTitle, summary: translatedSummary })
        .onConflictDoUpdate({ target: entryTranslation.entryId, set: { title: translatedTitle, summary: translatedSummary, translatedAt: sql`now()` } });
      return { translatedTitle, translatedSummary };
    },
  );
}
