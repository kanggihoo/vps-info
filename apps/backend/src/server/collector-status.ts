/** 수집기 응답이 늦어도 프로세스 종료로 단정하지 않는다(ADR-0017). */
import type { CollectorStatus } from '@trendboda/api-types';

/** 응답 기록으로 표시 상태를 판정한다. 종료 기록은 heartbeat가 오래되기 전에도 표시한다. */
export function describeCollectorStatus(
  heartbeat: { lastSeenAt: Date; stoppedAt: Date | null } | undefined,
  runningFeedId: string | null,
  now = new Date(),
): CollectorStatus {
  return {
    status: !heartbeat ? 'unknown' : heartbeat.stoppedAt ? 'stopped' : now.getTime() - heartbeat.lastSeenAt.getTime() >= 120_000 ? 'stale' : 'alive',
    lastSeenAt: heartbeat?.lastSeenAt.toISOString() ?? null,
    runningFeedId,
  };
}
