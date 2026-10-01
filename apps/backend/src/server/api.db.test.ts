import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BookmarkedEntryView, EntryView, FeedGroupView, FeedSummary, RankSnapshotView } from '@trendboda/api-types';
import { runFetchAttempt } from '../collector/fetch-attempt.ts';
import type { EntryDraft } from '../collector/handlers/define-handler.ts';
import { connectionPool, database } from '../db/database-client.ts';
import { entry, feed } from '../db/schema.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { buildServer } from './build-server.ts';

// 라우트는 코드의 Feed 선언을 기준으로 동작하므로, 실제로 선언된 Feed id를 쓴다.
// Stream Feed는 geeknews·producthunt, Ranked Feed는 hn-best다.
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
    { id: 'geeknews', intervalMinutes: 60 },
    { id: 'producthunt', intervalMinutes: 60 },
    { id: 'hn-best', intervalMinutes: 360, rankLimit: 100 },
    { id: 'removed-feed', intervalMinutes: 60 }, // 선언에서 빠진 Feed
  ]);
  await insertEntries('geeknews', 5); // id 1~5
  await insertEntries('producthunt', 2); // id 6~7
});
afterAll(async () => {
  await server.close();
  await connectionPool.end();
});

describe('GET /api/feeds', () => {
  it('선언된 Feed만 선언 순서대로, 종류·안 읽음 수·마지막 Entry id를 함께 준다', async () => {
    await moveCursor('geeknews', 2);
    const feeds = (await server.inject('/api/feeds')).json<FeedSummary[]>();
    expect(feeds.map((summary) => [summary.id, summary.kind, summary.unreadCount, summary.readCursorEntryId, summary.latestEntryId])).toEqual([
      ['hn-best', 'ranked', 0, null, null],
      ['geeknews', 'stream', 3, 2, 5],
      ['producthunt', 'stream', 2, null, 7],
    ]);
  });

  it('Feed Group에 든 Feed는 Group과 축 위의 값을 함께 준다 (ADR-0010)', async () => {
    const feeds = (await server.inject('/api/feeds')).json<FeedSummary[]>();
    expect(feeds.find((summary) => summary.id === 'hn-best')?.group).toEqual({ id: 'hacker-news', variant: { section: 'best' } });
    expect(feeds.find((summary) => summary.id === 'geeknews')?.group).toBeNull();
  });
});

describe('GET /api/feed-groups', () => {
  it('Group과 축을 선언 순서대로 준다', async () => {
    const groups = (await server.inject('/api/feed-groups')).json<FeedGroupView[]>();
    expect(groups.map((group) => [group.id, group.axes.map((axis) => axis.key)])).toEqual([
      ['hacker-news', ['section']],
      ['trendshift', ['period', 'language']],
      ['hellogithub-ranking', ['period', 'language']],
      ['wanted', ['role']],
    ]);
  });
});

describe('GET /api/feeds/:feedId/entries', () => {
  it('after는 그보다 새로운 Entry를, before는 그보다 오래된 가장 가까운 Entry를 오름차순으로 준다', async () => {
    const after = (await server.inject('/api/feeds/geeknews/entries?after=2&limit=2')).json<EntryView[]>();
    expect(after.map((item) => item.id)).toEqual([3, 4]);
    const before = (await server.inject('/api/feeds/geeknews/entries?before=5&limit=2')).json<EntryView[]>();
    expect(before.map((item) => item.id)).toEqual([3, 4]);
  });

  it('다른 Feed의 Entry는 섞이지 않고, 정보원 원본(raw)은 응답에 없다 (ADR-0003)', async () => {
    const response = await server.inject('/api/feeds/producthunt/entries');
    expect(response.json<EntryView[]>().map((item) => item.id)).toEqual([6, 7]);
    expect(response.body).not.toContain('raw');
    expect(response.body).not.toContain('원본');
  });

  it('잘못된 쿼리는 400이다', async () => {
    expect((await server.inject('/api/feeds/geeknews/entries?limit=0')).statusCode).toBe(400);
    expect((await server.inject('/api/feeds/geeknews/entries?after=abc')).statusCode).toBe(400);
  });
});

describe('PUT /api/feeds/:feedId/read-cursor', () => {
  it('최신 쪽으로만 움직인다', async () => {
    expect((await moveCursor('geeknews', 4)).json()).toEqual({ readCursorEntryId: 4 });
    expect((await moveCursor('geeknews', 2)).json()).toEqual({ readCursorEntryId: 4 });
  });

  it('다른 Feed의 Entry id는 404, 형식이 틀리면 400이다', async () => {
    expect((await moveCursor('geeknews', 6)).statusCode).toBe(404);
    expect((await moveCursor('geeknews', 'x')).statusCode).toBe(400);
  });

  it('Ranked Feed에는 Read Cursor가 없어서 409다 (ADR-0009)', async () => {
    expect((await moveCursor('hn-best', 1)).statusCode).toBe(409);
  });
});

describe('Entry 상태 API', () => {
  it('Opened At은 처음 연 시각만 남긴다', async () => {
    expect((await server.inject({ method: 'POST', url: '/api/entries/1/open' })).statusCode).toBe(204);
    const [first] = (await server.inject('/api/feeds/geeknews/entries?limit=1')).json<EntryView[]>();
    await server.inject({ method: 'POST', url: '/api/entries/1/open' });
    const [second] = (await server.inject('/api/feeds/geeknews/entries?limit=1')).json<EntryView[]>();
    expect(first.openedAt).not.toBeNull();
    expect(second.openedAt).toBe(first.openedAt);
  });

  it('Bookmark 목록은 여러 Feed를 최근 Bookmark 순으로 모으고, 해제하면 빠진다 (Q46)', async () => {
    await server.inject({ method: 'PUT', url: '/api/entries/1/bookmark' });
    await server.inject({ method: 'PUT', url: '/api/entries/6/bookmark' });
    const bookmarks = (await server.inject('/api/bookmarks')).json<BookmarkedEntryView[]>();
    expect(bookmarks.map((item) => [item.id, item.feedTitle])).toEqual([
      [6, 'Product Hunt'],
      [1, 'GeekNews'],
    ]);

    await server.inject({ method: 'DELETE', url: '/api/entries/6/bookmark' });
    expect((await server.inject('/api/bookmarks')).json<BookmarkedEntryView[]>().map((item) => item.id)).toEqual([1]);
  });

  it('없는 Entry는 404다', async () => {
    expect((await server.inject({ method: 'POST', url: '/api/entries/999/open' })).statusCode).toBe(404);
    expect((await server.inject({ method: 'PUT', url: '/api/entries/999/bookmark' })).statusCode).toBe(404);
  });
});

describe('GET /api/feeds/:feedId/rank-snapshot (ADR-0009)', () => {
  const hnBest = feedDefinitions.find((definition) => definition.id === 'hn-best')!;
  const story = (id: string, score: number): EntryDraft => ({
    url: `https://example.com/${id}`,
    title: `글 ${id}`,
    externalId: id,
    metrics: { score },
    raw: {},
  });
  /** hn-best를 실제 수집 경로로 한 번 수집한다. 목록 순서가 Rank다. */
  const collect = (stories: EntryDraft[]) =>
    runFetchAttempt(hnBest, { intervalMinutes: 360, consecutiveFailures: 0, rankLimit: 100 }, async () => stories);
  const readSnapshot = async () => (await server.inject('/api/feeds/hn-best/rank-snapshot')).json<RankSnapshotView>();

  it('Snapshot이 아직 없으면 빈 순위표를 준다', async () => {
    expect(await readSnapshot()).toEqual({ takenAt: null, previousTakenAt: null, entries: [], droppedEntries: [] });
  });

  it('첫 Snapshot은 처음 발견한 Entry만 NEW로 표시한다', async () => {
    await collect([story('a', 300), story('b', 250)]);
    const snapshot = await readSnapshot();
    expect(snapshot.previousTakenAt).toBeNull();
    expect(snapshot.entries.map((item) => [item.title, item.rank, item.movement, item.previousRank])).toEqual([
      ['글 a', 1, 'new', null],
      ['글 b', 2, 'new', null],
    ]);
  });

  it('직전 Snapshot과 비교해 순위 변동, NEW, 재진입, 빠짐을 준다', async () => {
    await collect([story('a', 300), story('b', 250), story('c', 200)]);
    await collect([story('c', 500), story('a', 400), story('d', 150)]);
    const second = await readSnapshot();
    expect(second.entries.map((item) => [item.title, item.rank, item.previousRank, item.movement])).toEqual([
      ['글 c', 1, 3, 'stayed'],
      ['글 a', 2, 1, 'stayed'],
      ['글 d', 3, null, 'new'],
    ]);
    expect(second.entries[0]).toMatchObject({ metrics: { score: 500 }, previousMetrics: { score: 200 } });
    expect(second.droppedEntries.map((item) => [item.title, item.previousRank])).toEqual([['글 b', 2]]);
    const [hnBestSummary] = (await server.inject('/api/feeds')).json<FeedSummary[]>();
    expect(hnBestSummary.rankSnapshotNewCount).toBe(1);

    await collect([story('b', 260), story('c', 520)]);
    const third = await readSnapshot();
    expect(third.entries.map((item) => [item.title, item.movement])).toEqual([
      ['글 b', 'reentered'],
      ['글 c', 'stayed'],
    ]);
  });

  it('Stream Feed와 선언되지 않은 Feed는 404다', async () => {
    expect((await server.inject('/api/feeds/geeknews/rank-snapshot')).statusCode).toBe(404);
    expect((await server.inject('/api/feeds/removed-feed/rank-snapshot')).statusCode).toBe(404);
  });
});
