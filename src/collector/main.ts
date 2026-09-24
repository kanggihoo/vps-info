/**
 * 수집기 진입점. 상주하면서 기한이 된 Feed를 순차로 수집한다(ADR-0007).
 *
 * 사용법:
 * - `node src/collector/main.ts` : 상주 모드
 * - `node src/collector/main.ts --once hn-best` : 해당 Feed만 지금 한 번 수집하고 종료(개발용)
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { asc, eq, lte, sql } from 'drizzle-orm';
import { connectionPool, database } from '../db/database-client.ts';
import { feed } from '../db/schema.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { markInterruptedAttemptsFailed, runFetchAttempt } from './fetch-attempt.ts';

/** 기한이 된 Feed가 있는지 DB를 확인하는 간격. 가장 짧은 재시도 간격(5분)보다 충분히 짧다. */
const DUE_CHECK_INTERVAL_MILLISECONDS = 30_000;

const definitionsById = new Map(feedDefinitions.map((definition) => [definition.id, definition]));

/** 코드에 선언된 Feed 중 DB에 없는 것만 넣는다. 이미 있는 Feed의 주기는 덮어쓰지 않는다(ADR-0007). */
async function insertMissingFeeds(): Promise<void> {
  await database
    .insert(feed)
    .values(feedDefinitions.map((definition) => ({ id: definition.id, intervalMinutes: definition.intervalMinutes })))
    .onConflictDoNothing();
}

/** `next_run_at`이 지난 Feed를 하나씩 수집한다. 선언에서 빠진 Feed는 건너뛴다. */
async function runDueFeeds(): Promise<void> {
  const dueFeeds = await database
    .select({ id: feed.id, intervalMinutes: feed.intervalMinutes, consecutiveFailures: feed.consecutiveFailures })
    .from(feed)
    .where(lte(feed.nextRunAt, sql`now()`))
    .orderBy(asc(feed.nextRunAt));
  for (const dueFeed of dueFeeds) {
    const definition = definitionsById.get(dueFeed.id);
    if (!definition) continue;
    const insertedCount = await runFetchAttempt(definition, dueFeed);
    if (insertedCount !== undefined) console.log(`[${dueFeed.id}] 새 Entry ${insertedCount}건`);
  }
}

/** `--once <feedId>`: 기한과 상관없이 Feed 하나를 지금 수집한다. */
async function runOnce(feedId: string): Promise<void> {
  const definition = definitionsById.get(feedId);
  if (!definition) throw new Error(`선언되지 않은 Feed입니다: ${feedId}`);
  const [state] = await database
    .select({ intervalMinutes: feed.intervalMinutes, consecutiveFailures: feed.consecutiveFailures })
    .from(feed)
    .where(eq(feed.id, feedId));
  const insertedCount = await runFetchAttempt(definition, state);
  console.log(insertedCount === undefined ? `[${feedId}] 실패` : `[${feedId}] 새 Entry ${insertedCount}건`);
}

await markInterruptedAttemptsFailed();
await insertMissingFeeds();

const onceFlagIndex = process.argv.indexOf('--once');
if (onceFlagIndex !== -1) {
  await runOnce(process.argv[onceFlagIndex + 1]);
} else {
  // docker stop(SIGTERM)을 받으면 지금 돌던 Feed만 마치고 루프를 빠져나온다.
  const shutdown = new AbortController();
  process.once('SIGTERM', () => shutdown.abort());
  process.once('SIGINT', () => shutdown.abort());
  console.log(`수집기 시작: Feed ${feedDefinitions.length}개`);
  while (!shutdown.signal.aborted) {
    await runDueFeeds();
    await sleep(DUE_CHECK_INTERVAL_MILLISECONDS, undefined, { signal: shutdown.signal }).catch(() => {});
  }
  console.log('수집기 종료');
}
await connectionPool.end();
