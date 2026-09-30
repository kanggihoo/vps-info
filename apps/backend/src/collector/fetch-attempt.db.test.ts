import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectionPool, database } from '../db/database-client.ts';
import { entry, feed, fetchAttempt, rankSnapshot } from '../db/schema.ts';
import type { FeedDefinition } from '../feed-definitions.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { type EntryFetcher, markInterruptedAttemptsFailed, runFetchAttempt } from './fetch-attempt.ts';
import type { EntryDraft } from './handlers/define-handler.ts';

const definition: FeedDefinition = { id: 'test-feed', title: '테스트', handler: 'rss', params: { url: 'https://example.com/rss' }, intervalMinutes: 30 };

const draft = (externalId: string, publishedAt: string): EntryDraft => ({
  url: `https://example.com/${externalId}`,
  title: `글 ${externalId}`,
  externalId,
  publishedAt: new Date(publishedAt),
  raw: { externalId },
});

const fetcherReturning = (drafts: EntryDraft[]): EntryFetcher => async () => drafts;

async function readFeedRow() {
  const [row] = await database.select({ consecutiveFailures: feed.consecutiveFailures, nextRunAt: feed.nextRunAt }).from(feed).where(eq(feed.id, definition.id));
  return row;
}

async function readAttempts() {
  return database
    .select({ status: fetchAttempt.status, insertedEntryCount: fetchAttempt.insertedEntryCount, errorMessage: fetchAttempt.errorMessage, finishedAt: fetchAttempt.finishedAt })
    .from(fetchAttempt)
    .orderBy(asc(fetchAttempt.id));
}

const minutesFromNow = (date: Date) => Math.round((date.getTime() - Date.now()) / 60_000);

beforeEach(async () => {
  await resetDatabase();
  await database.insert(feed).values({ id: definition.id, intervalMinutes: 30 });
});
afterAll(() => connectionPool.end());

describe('runFetchAttempt 성공', () => {
  it('게시 시각이 빠른 것부터 저장해 id 순서가 게시 시각 순서가 된다', async () => {
    const insertedCount = await runFetchAttempt(
      definition,
      { intervalMinutes: 30, consecutiveFailures: 0 },
      fetcherReturning([draft('b', '2026-09-22T12:00:00Z'), draft('a', '2026-09-22T10:00:00Z')]),
    );
    expect(insertedCount).toBe(2);
    const rows = await database.select({ id: entry.id, title: entry.title, dedupKey: entry.dedupKey }).from(entry).orderBy(asc(entry.id));
    expect(rows.map((row) => row.title)).toEqual(['글 a', '글 b']);
    expect(rows[0].dedupKey).toBe('ext:a');
  });

  it('성공하면 attempt는 success, 연속 실패는 0, 다음 실행은 주기만큼 뒤다', async () => {
    await runFetchAttempt(definition, { intervalMinutes: 30, consecutiveFailures: 2 }, fetcherReturning([draft('a', '2026-09-22T10:00:00Z')]));
    expect(await readAttempts()).toEqual([expect.objectContaining({ status: 'success', insertedEntryCount: 1, errorMessage: null })]);
    const feedRow = await readFeedRow();
    expect(feedRow.consecutiveFailures).toBe(0);
    expect(minutesFromNow(feedRow.nextRunAt)).toBe(30);
  });

  it('같은 항목을 다시 수집하면 저장하지 않는다 (ADR-0002)', async () => {
    const fetcher = fetcherReturning([draft('a', '2026-09-22T10:00:00Z'), draft('b', '2026-09-22T11:00:00Z')]);
    await runFetchAttempt(definition, { intervalMinutes: 30, consecutiveFailures: 0 }, fetcher);
    const secondInsertedCount = await runFetchAttempt(definition, { intervalMinutes: 30, consecutiveFailures: 0 }, fetcher);
    expect(secondInsertedCount).toBe(0);
    expect(await database.$count(entry)).toBe(2);
  });

  it('allowEmpty인 Feed는 0건도 성공이다', async () => {
    const insertedCount = await runFetchAttempt({ ...definition, allowEmpty: true }, { intervalMinutes: 30, consecutiveFailures: 0 }, fetcherReturning([]));
    expect(insertedCount).toBe(0);
    expect((await readAttempts())[0].status).toBe('success');
  });
});

describe('runFetchAttempt Ranked Feed (ADR-0009)', () => {
  const rankedDefinition: FeedDefinition = { ...definition, kind: 'ranked', rankLimit: 10 };
  const rankedDraft = (externalId: string, score: number): EntryDraft => ({
    ...draft(externalId, '2026-09-22T10:00:00Z'),
    extra: { commentsUrl: `https://example.com/${externalId}#comments` },
    metrics: { score },
  });

  async function readSnapshotRows() {
    return database
      .select({ fetchAttemptId: rankSnapshot.fetchAttemptId, rank: rankSnapshot.rank, title: entry.title, metrics: rankSnapshot.metrics })
      .from(rankSnapshot)
      .innerJoin(entry, eq(entry.id, rankSnapshot.entryId))
      .orderBy(asc(rankSnapshot.fetchAttemptId), asc(rankSnapshot.rank));
  }

  it('Handler가 돌려준 순서대로 Rank와 수치를 저장하고, 순위가 같아도 수집마다 쌓는다', async () => {
    const fetcher = fetcherReturning([rankedDraft('b', 20), rankedDraft('a', 10)]);
    await runFetchAttempt(rankedDefinition, { intervalMinutes: 30, consecutiveFailures: 0, rankLimit: 10 }, fetcher);
    await runFetchAttempt(rankedDefinition, { intervalMinutes: 30, consecutiveFailures: 0, rankLimit: 10 }, fetcher);
    expect(await readSnapshotRows()).toEqual([
      { fetchAttemptId: 1, rank: 1, title: '글 b', metrics: { score: 20 } },
      { fetchAttemptId: 1, rank: 2, title: '글 a', metrics: { score: 10 } },
      { fetchAttemptId: 2, rank: 1, title: '글 b', metrics: { score: 20 } },
      { fetchAttemptId: 2, rank: 2, title: '글 a', metrics: { score: 10 } },
    ]);
  });

  it('DB의 rank_limit을 Handler에 넘기고, 돌려받은 목록도 그 개수로 자른다', async () => {
    let receivedRankLimit: number | undefined;
    const fetcher: EntryFetcher = async (_definition, rankLimit) => {
      receivedRankLimit = rankLimit;
      return [rankedDraft('a', 3), rankedDraft('b', 2), rankedDraft('c', 1)];
    };
    const insertedCount = await runFetchAttempt(rankedDefinition, { intervalMinutes: 30, consecutiveFailures: 0, rankLimit: 2 }, fetcher);
    expect(receivedRankLimit).toBe(2);
    expect(insertedCount).toBe(2);
    expect((await readSnapshotRows()).map((row) => row.title)).toEqual(['글 a', '글 b']);
  });

  it('처음 저장하는 Entry의 extra에는 처음 봤을 때의 수치를 합친다', async () => {
    await runFetchAttempt(rankedDefinition, { intervalMinutes: 30, consecutiveFailures: 0, rankLimit: 10 }, fetcherReturning([rankedDraft('a', 7)]));
    const [row] = await database.select({ extra: entry.extra }).from(entry);
    expect(row.extra).toEqual({ commentsUrl: 'https://example.com/a#comments', score: 7 });
  });

  it('Stream Feed는 Rank Snapshot을 남기지 않는다', async () => {
    await runFetchAttempt(definition, { intervalMinutes: 30, consecutiveFailures: 0 }, fetcherReturning([rankedDraft('a', 7)]));
    expect(await database.$count(rankSnapshot)).toBe(0);
  });
});

describe('runFetchAttempt 실패 (ADR-0005)', () => {
  it('0건이면 실패로 기록하고 연속 실패를 늘린다', async () => {
    const insertedCount = await runFetchAttempt(definition, { intervalMinutes: 30, consecutiveFailures: 0 }, fetcherReturning([]));
    expect(insertedCount).toBeUndefined();
    const [attempt] = await readAttempts();
    expect(attempt.status).toBe('failed');
    expect(attempt.errorMessage).toContain('0건');
    expect(attempt.finishedAt).not.toBeNull();
    const feedRow = await readFeedRow();
    expect(feedRow.consecutiveFailures).toBe(1);
    expect(minutesFromNow(feedRow.nextRunAt)).toBe(5);
  });

  it('Handler가 예외를 던지면 밖으로 새지 않고 실패로 기록하며, 재시도 간격이 늘어난다', async () => {
    const failingFetcher: EntryFetcher = async () => {
      throw new Error('정보원 응답 없음');
    };
    await expect(runFetchAttempt(definition, { intervalMinutes: 30, consecutiveFailures: 1 }, failingFetcher)).resolves.toBeUndefined();
    expect((await readAttempts())[0].errorMessage).toContain('정보원 응답 없음');
    const feedRow = await readFeedRow();
    expect(feedRow.consecutiveFailures).toBe(2);
    expect(minutesFromNow(feedRow.nextRunAt)).toBe(15);
  });
});

describe('markInterruptedAttemptsFailed', () => {
  it('running으로 남은 시도만 failed로 바꾼다', async () => {
    await database.insert(fetchAttempt).values([
      { feedId: definition.id, status: 'running' },
      { feedId: definition.id, status: 'success' },
    ]);
    await markInterruptedAttemptsFailed();
    expect((await readAttempts()).map((attempt) => attempt.status)).toEqual(['failed', 'success']);
  });
});

describe('runFetchAttempt 게시일 하한 (CONTEXT.md First Seen)', () => {
  const boundedDefinition: FeedDefinition = { ...definition, publishedSince: '2026-01-01' };
  const undatedDraft: EntryDraft = { url: 'https://example.com/undated', title: '게시 시각 없음', externalId: 'undated', raw: {} };

  it('하한보다 먼저 게시된 항목은 저장하지 않고, 게시 시각이 없는 항목은 저장한다', async () => {
    const insertedCount = await runFetchAttempt(
      boundedDefinition,
      { intervalMinutes: 30, consecutiveFailures: 0 },
      fetcherReturning([draft('old', '2025-12-31T23:59:59Z'), draft('new', '2026-01-01T00:00:00Z'), undatedDraft]),
    );
    expect(insertedCount).toBe(2);
    const rows = await database.select({ title: entry.title }).from(entry).orderBy(asc(entry.id));
    expect(rows.map((row) => row.title).sort()).toEqual(['게시 시각 없음', '글 new']);
  });

  it('모두 하한보다 먼저 게시됐으면 0건이지만 성공이다', async () => {
    const insertedCount = await runFetchAttempt(boundedDefinition, { intervalMinutes: 30, consecutiveFailures: 0 }, fetcherReturning([draft('old', '2015-06-01T00:00:00Z')]));
    expect(insertedCount).toBe(0);
    expect(await readAttempts()).toEqual([expect.objectContaining({ status: 'success', insertedEntryCount: 0 })]);
  });

  it('Handler가 0건을 돌려주면 하한이 있어도 실패다 (ADR-0005)', async () => {
    const insertedCount = await runFetchAttempt(boundedDefinition, { intervalMinutes: 30, consecutiveFailures: 0 }, fetcherReturning([]));
    expect(insertedCount).toBeUndefined();
    expect((await readAttempts())[0].status).toBe('failed');
  });

  it('하한을 선언하지 않은 Feed는 오래된 항목도 저장한다', async () => {
    const insertedCount = await runFetchAttempt(definition, { intervalMinutes: 30, consecutiveFailures: 0 }, fetcherReturning([draft('old', '2015-06-01T00:00:00Z')]));
    expect(insertedCount).toBe(1);
  });
});
