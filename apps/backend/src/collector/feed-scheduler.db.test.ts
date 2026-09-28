import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectionPool, database } from '../db/database-client.ts';
import { feed } from '../db/schema.ts';
import type { FeedDefinition } from '../feed-definitions.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { insertMissingFeeds, runDueFeeds, runFeedOnce } from './feed-scheduler.ts';
import type { EntryFetcher } from './fetch-attempt.ts';

const defineTestFeed = (id: string, intervalMinutes = 60): FeedDefinition => ({
  id,
  title: id,
  handler: 'rss',
  params: { url: `https://example.com/${id}` },
  intervalMinutes,
});

/** 부른 Feed id를 기록하고 항목 하나를 돌려주는 가짜 수집 함수. */
function createRecordingFetcher() {
  const fetchedFeedIds: string[] = [];
  const fetcher: EntryFetcher = async (definition) => {
    fetchedFeedIds.push(definition.id);
    return [{ url: `https://example.com/${definition.id}/1`, title: '글', raw: {} }];
  };
  return { fetcher, fetchedFeedIds };
}

beforeEach(resetDatabase);
afterAll(() => connectionPool.end());

describe('insertMissingFeeds', () => {
  it('없는 Feed만 넣고, 이미 있는 Feed의 주기는 DB 값을 유지한다 (ADR-0004)', async () => {
    await insertMissingFeeds([defineTestFeed('a', 60)]);
    await database.update(feed).set({ intervalMinutes: 15 }).where(eq(feed.id, 'a')); // 운영 중 DB에서 주기를 바꿈
    await insertMissingFeeds([defineTestFeed('a', 60), defineTestFeed('b', 30)]);

    const rows = await database.select({ id: feed.id, intervalMinutes: feed.intervalMinutes }).from(feed).orderBy(asc(feed.id));
    expect(rows).toEqual([
      { id: 'a', intervalMinutes: 15 },
      { id: 'b', intervalMinutes: 30 },
    ]);
  });

  it('Ranked Feed의 rank_limit은 비어 있을 때만 선언 값으로 채운다 (ADR-0009)', async () => {
    await insertMissingFeeds([defineTestFeed('a')]); // Stream Feed로 먼저 등록된 Feed
    await insertMissingFeeds([{ ...defineTestFeed('a'), kind: 'ranked', rankLimit: 100 }]);
    const [filled] = await database.select({ rankLimit: feed.rankLimit }).from(feed).where(eq(feed.id, 'a'));
    expect(filled.rankLimit).toBe(100);

    await database.update(feed).set({ rankLimit: 50 }).where(eq(feed.id, 'a')); // 운영 중 DB에서 바꿈
    await insertMissingFeeds([{ ...defineTestFeed('a'), kind: 'ranked', rankLimit: 100 }]);
    const [kept] = await database.select({ rankLimit: feed.rankLimit }).from(feed).where(eq(feed.id, 'a'));
    expect(kept.rankLimit).toBe(50);
  });
});

describe('runDueFeeds', () => {
  it('기한이 지난 Feed만, 오래 기다린 순서로 수집하고 선언에서 빠진 Feed는 건너뛴다', async () => {
    await database.insert(feed).values([
      { id: 'due-later', intervalMinutes: 60, nextRunAt: sql`now() - interval '1 minute'` },
      { id: 'due-earlier', intervalMinutes: 60, nextRunAt: sql`now() - interval '10 minutes'` },
      { id: 'not-due', intervalMinutes: 60, nextRunAt: sql`now() + interval '10 minutes'` },
      { id: 'undeclared', intervalMinutes: 60, nextRunAt: sql`now() - interval '1 hour'` },
    ]);
    const { fetcher, fetchedFeedIds } = createRecordingFetcher();
    const attemptedFeedIds = await runDueFeeds([defineTestFeed('due-later'), defineTestFeed('due-earlier'), defineTestFeed('not-due')], fetcher);

    expect(attemptedFeedIds).toEqual(['due-earlier', 'due-later']);
    expect(fetchedFeedIds).toEqual(['due-earlier', 'due-later']);
  });
});

describe('runFeedOnce', () => {
  it('DB에 없는 Feed도 먼저 등록한 뒤 기한과 상관없이 수집한다', async () => {
    const { fetcher } = createRecordingFetcher();
    expect(await runFeedOnce(defineTestFeed('new-feed'), fetcher)).toBe(1);
    expect(await database.$count(feed, eq(feed.id, 'new-feed'))).toBe(1);
  });
});
