import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BookmarkedEntryView, EntryView, FeedSummary } from '@signal-archive/api-types';
import { connectionPool, database } from '../db/database-client.ts';
import { entry, feed } from '../db/schema.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { buildServer } from './build-server.ts';

// 라우트는 코드의 Feed 선언을 기준으로 동작하므로, 실제로 선언된 Feed id(hn-best, hn-show)를 쓴다.
let server: FastifyInstance;

/** Feed에 Entry를 count개 넣는다. id는 넣은 순서대로 커진다. */
async function insertEntries(feedId: string, count: number) {
  await database.insert(entry).values(
    Array.from({ length: count }, (_, index) => ({
      feedId,
      dedupKey: `ext:${feedId}-${index}`,
      url: `https://example.com/${feedId}/${index}`,
      title: `${feedId} ${index}`,
      raw: { secret: '원본' },
    })),
  );
}

const moveCursor = (feedId: string, entryId: unknown) =>
  server.inject({ method: 'PUT', url: `/api/feeds/${feedId}/read-cursor`, payload: { entryId } });

beforeAll(async () => {
  server = await buildServer({ logger: false });
});
beforeEach(async () => {
  await resetDatabase();
  await database.insert(feed).values([
    { id: 'hn-best', intervalMinutes: 60 },
    { id: 'hn-show', intervalMinutes: 60 },
    { id: 'removed-feed', intervalMinutes: 60 }, // 선언에서 빠진 Feed
  ]);
  await insertEntries('hn-best', 5); // id 1~5
  await insertEntries('hn-show', 2); // id 6~7
});
afterAll(async () => {
  await server.close();
  await connectionPool.end();
});

describe('GET /api/feeds', () => {
  it('선언된 Feed만 선언 순서대로, 안 읽음 수와 마지막 Entry id를 함께 준다', async () => {
    await moveCursor('hn-best', 2);
    const feeds = (await server.inject('/api/feeds')).json<FeedSummary[]>();
    expect(feeds.map((summary) => [summary.id, summary.title, summary.unreadCount, summary.readCursorEntryId, summary.latestEntryId])).toEqual([
      ['hn-best', 'Hacker News Best', 3, 2, 5],
      ['hn-show', 'Show HN', 2, null, 7],
    ]);
  });
});

describe('GET /api/feeds/:feedId/entries', () => {
  it('after는 그보다 새로운 Entry를, before는 그보다 오래된 가장 가까운 Entry를 오름차순으로 준다', async () => {
    const after = (await server.inject('/api/feeds/hn-best/entries?after=2&limit=2')).json<EntryView[]>();
    expect(after.map((item) => item.id)).toEqual([3, 4]);
    const before = (await server.inject('/api/feeds/hn-best/entries?before=5&limit=2')).json<EntryView[]>();
    expect(before.map((item) => item.id)).toEqual([3, 4]);
  });

  it('다른 Feed의 Entry는 섞이지 않고, 정보원 원본(raw)은 응답에 없다 (ADR-0003)', async () => {
    const response = await server.inject('/api/feeds/hn-show/entries');
    expect(response.json<EntryView[]>().map((item) => item.id)).toEqual([6, 7]);
    expect(response.body).not.toContain('raw');
    expect(response.body).not.toContain('원본');
  });

  it('잘못된 쿼리는 400이다', async () => {
    expect((await server.inject('/api/feeds/hn-best/entries?limit=0')).statusCode).toBe(400);
    expect((await server.inject('/api/feeds/hn-best/entries?after=abc')).statusCode).toBe(400);
  });
});

describe('PUT /api/feeds/:feedId/read-cursor', () => {
  it('최신 쪽으로만 움직인다', async () => {
    expect((await moveCursor('hn-best', 4)).json()).toEqual({ readCursorEntryId: 4 });
    expect((await moveCursor('hn-best', 2)).json()).toEqual({ readCursorEntryId: 4 });
  });

  it('다른 Feed의 Entry id는 404, 형식이 틀리면 400이다', async () => {
    expect((await moveCursor('hn-best', 6)).statusCode).toBe(404);
    expect((await moveCursor('hn-best', 'x')).statusCode).toBe(400);
  });
});

describe('Entry 상태 API', () => {
  it('Opened At은 처음 연 시각만 남긴다', async () => {
    expect((await server.inject({ method: 'POST', url: '/api/entries/1/open' })).statusCode).toBe(204);
    const [first] = (await server.inject('/api/feeds/hn-best/entries?limit=1')).json<EntryView[]>();
    await server.inject({ method: 'POST', url: '/api/entries/1/open' });
    const [second] = (await server.inject('/api/feeds/hn-best/entries?limit=1')).json<EntryView[]>();
    expect(first.openedAt).not.toBeNull();
    expect(second.openedAt).toBe(first.openedAt);
  });

  it('Bookmark 목록은 여러 Feed를 최근 Bookmark 순으로 모으고, 해제하면 빠진다 (Q46)', async () => {
    await server.inject({ method: 'PUT', url: '/api/entries/1/bookmark' });
    await server.inject({ method: 'PUT', url: '/api/entries/6/bookmark' });
    const bookmarks = (await server.inject('/api/bookmarks')).json<BookmarkedEntryView[]>();
    expect(bookmarks.map((item) => [item.id, item.feedTitle])).toEqual([
      [6, 'Show HN'],
      [1, 'Hacker News Best'],
    ]);

    await server.inject({ method: 'DELETE', url: '/api/entries/6/bookmark' });
    expect((await server.inject('/api/bookmarks')).json<BookmarkedEntryView[]>().map((item) => item.id)).toEqual([1]);
  });

  it('없는 Entry는 404다', async () => {
    expect((await server.inject({ method: 'POST', url: '/api/entries/999/open' })).statusCode).toBe(404);
    expect((await server.inject({ method: 'PUT', url: '/api/entries/999/bookmark' })).statusCode).toBe(404);
  });
});
