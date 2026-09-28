/**
 * 어떤 Feed를 언제 수집할지 정한다: 선언된 Feed를 DB에 등록하고, 기한이 된 Feed를 순차로 실행한다(ADR-0004).
 */
import { asc, eq, lte, sql } from 'drizzle-orm';
import { database } from '../db/database-client.ts';
import { feed } from '../db/schema.ts';
import type { FeedDefinition } from '../feed-definitions.ts';
import { type EntryFetcher, fetchEntriesWithRegisteredHandler, runFetchAttempt } from './fetch-attempt.ts';

/** 코드에 선언된 Feed 중 DB에 없는 것만 넣는다. 이미 있는 Feed의 주기는 덮어쓰지 않는다(ADR-0004). */
export async function insertMissingFeeds(definitions: FeedDefinition[]): Promise<void> {
  if (definitions.length === 0) return;
  await database
    .insert(feed)
    .values(definitions.map((definition) => ({ id: definition.id, intervalMinutes: definition.intervalMinutes })))
    .onConflictDoNothing();
}

/**
 * `next_run_at`이 지난 Feed를 오래 기다린 순서로 하나씩 수집한다. 선언에서 빠진 Feed는 건너뛴다.
 *
 * @returns 실제로 수집을 시도한 Feed의 id 목록
 */
export async function runDueFeeds(
  definitions: FeedDefinition[],
  fetchEntries: EntryFetcher = fetchEntriesWithRegisteredHandler,
): Promise<string[]> {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const dueFeeds = await database
    .select({ id: feed.id, intervalMinutes: feed.intervalMinutes, consecutiveFailures: feed.consecutiveFailures })
    .from(feed)
    .where(lte(feed.nextRunAt, sql`now()`))
    .orderBy(asc(feed.nextRunAt));
  const attemptedFeedIds: string[] = [];
  for (const dueFeed of dueFeeds) {
    const definition = definitionsById.get(dueFeed.id);
    if (!definition) continue;
    attemptedFeedIds.push(dueFeed.id);
    const insertedCount = await runFetchAttempt(definition, dueFeed, fetchEntries);
    if (insertedCount !== undefined) console.log(`[${dueFeed.id}] 새 Entry ${insertedCount}건`);
  }
  return attemptedFeedIds;
}

/**
 * 기한과 상관없이 Feed 하나를 지금 수집한다(`--once`). Feed가 DB에 없으면 먼저 넣는다.
 *
 * @returns 새로 저장된 Entry 수. 실패하면 `undefined`.
 */
export async function runFeedOnce(
  definition: FeedDefinition,
  fetchEntries: EntryFetcher = fetchEntriesWithRegisteredHandler,
): Promise<number | undefined> {
  await insertMissingFeeds([definition]);
  const [state] = await database
    .select({ intervalMinutes: feed.intervalMinutes, consecutiveFailures: feed.consecutiveFailures })
    .from(feed)
    .where(eq(feed.id, definition.id));
  return runFetchAttempt(definition, state, fetchEntries);
}
