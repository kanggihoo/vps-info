import { describe, expect, it } from 'vitest';
import { describeCollectorStatus } from './collector-status.ts';

describe('collector status', () => {
  it('미기록·응답 중·2분 경과·정상 종료를 구분하며 실행 중 Feed를 보존한다', () => {
    const now = new Date('2026-10-02T00:00:00Z');
    const heartbeat = { lastSeenAt: now, stoppedAt: null };
    expect(describeCollectorStatus(undefined, null, now).status).toBe('unknown');
    expect(describeCollectorStatus(heartbeat, 'geeknews', now)).toMatchObject({ status: 'alive', runningFeedId: 'geeknews' });
    expect(describeCollectorStatus(heartbeat, 'geeknews', new Date(now.getTime() + 120_000)).status).toBe('stale');
    expect(describeCollectorStatus({ ...heartbeat, stoppedAt: now }, null, now).status).toBe('stopped');
  });
});
