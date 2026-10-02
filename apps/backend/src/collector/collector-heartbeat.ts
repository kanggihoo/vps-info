/** 수집기의 생존 응답을 수집 실행과 독립적으로 기록한다(ADR-0017). */
import { eq } from 'drizzle-orm';
import { database } from '../db/database-client.ts';
import { collectorHeartbeat } from '../db/schema.ts';

/** 시작 즉시 및 30초마다 응답을 남긴다. 반환된 함수는 타이머를 정리하고 정상 종료를 기록한다. */
export async function startCollectorHeartbeat(): Promise<() => Promise<void>> {
  let pending = Promise.resolve();
  const record = () => {
    pending = pending.then(async () => {
      const lastSeenAt = new Date();
      await database.insert(collectorHeartbeat).values({ id: 'main', lastSeenAt, stoppedAt: null })
        .onConflictDoUpdate({ target: collectorHeartbeat.id, set: { lastSeenAt, stoppedAt: null } });
    }).catch((error: unknown) => console.error('[collector] 응답 기록 실패:', String(error)));
    return pending;
  };
  await record();
  const timer = setInterval(() => { void record(); }, 30_000);
  return async () => {
    clearInterval(timer);
    await pending;
    await database.update(collectorHeartbeat).set({ stoppedAt: new Date() }).where(eq(collectorHeartbeat.id, 'main'));
  };
}
