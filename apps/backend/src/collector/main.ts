/**
 * 수집기 진입점. 상주하면서 기한이 된 Feed를 순차로 수집한다(ADR-0004).
 *
 * 사용법:
 * - `node src/collector/main.ts` : 상주 모드
 * - `node src/collector/main.ts --once hn-best` : 해당 Feed만 지금 한 번 수집하고 종료(개발용)
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { connectionPool } from '../db/database-client.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { insertMissingFeeds, runDueFeeds, runFeedOnce } from './feed-scheduler.ts';
import { markInterruptedAttemptsFailed } from './fetch-attempt.ts';

/** 기한이 된 Feed가 있는지 DB를 확인하는 간격. 가장 짧은 재시도 간격(5분)보다 충분히 짧다. */
const DUE_CHECK_INTERVAL_MILLISECONDS = 30_000;

await markInterruptedAttemptsFailed();
await insertMissingFeeds(feedDefinitions);

const onceFlagIndex = process.argv.indexOf('--once');
if (onceFlagIndex !== -1) {
  const feedId = process.argv[onceFlagIndex + 1];
  const definition = feedDefinitions.find((candidate) => candidate.id === feedId);
  if (!definition) throw new Error(`선언되지 않은 Feed입니다: ${feedId}`);
  const insertedCount = await runFeedOnce(definition);
  console.log(insertedCount === undefined ? `[${feedId}] 실패` : `[${feedId}] 새 Entry ${insertedCount}건`);
} else {
  // docker stop(SIGTERM)을 받으면 지금 돌던 Feed만 마치고 루프를 빠져나온다.
  const shutdown = new AbortController();
  process.once('SIGTERM', () => shutdown.abort());
  process.once('SIGINT', () => shutdown.abort());
  console.log(`수집기 시작: Feed ${feedDefinitions.length}개`);
  while (!shutdown.signal.aborted) {
    await runDueFeeds(feedDefinitions);
    await sleep(DUE_CHECK_INTERVAL_MILLISECONDS, undefined, { signal: shutdown.signal }).catch(() => {});
  }
  console.log('수집기 종료');
}
await connectionPool.end();
