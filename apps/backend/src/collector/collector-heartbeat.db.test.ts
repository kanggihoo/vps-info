import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { database, connectionPool } from '../db/database-client.ts';
import { collectorHeartbeat, feed, fetchAttempt } from '../db/schema.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { startCollectorHeartbeat } from './collector-heartbeat.ts';

beforeEach(resetDatabase);
afterAll(() => connectionPool.end());

it('Fetch Attempt가 진행 중이어도 30초 응답을 갱신하고 정상 종료를 기록한다', async () => {
  await database.insert(feed).values({ id: 'geeknews', intervalMinutes: 60 });
  await database.insert(fetchAttempt).values({ feedId: 'geeknews', status: 'running' });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const now = new Date('2026-10-02T00:00:00Z');
  vi.setSystemTime(now);
  let stop: (() => Promise<void>) | undefined;
  try {
    stop = await startCollectorHeartbeat();
    await vi.advanceTimersByTimeAsync(30_000);
    await stop();
    stop = undefined;
    const [row] = await database.select({ lastSeenAt: collectorHeartbeat.lastSeenAt, stoppedAt: collectorHeartbeat.stoppedAt }).from(collectorHeartbeat);
    expect(row.lastSeenAt.toISOString()).toBe('2026-10-02T00:00:30.000Z');
    expect(row.stoppedAt?.toISOString()).toBe('2026-10-02T00:00:30.000Z');
    expect(await database.$count(fetchAttempt)).toBe(1);
  } finally { if (stop) await stop(); vi.useRealTimers(); }
});
