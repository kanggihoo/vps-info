/** Fetch Attempt 결과에 따라 다음 수집 시각을 정한다(ADR-0008). */

const MINUTE_IN_MILLISECONDS = 60_000;

/** 첫 번째 재시도까지의 간격(분). */
const FIRST_RETRY_DELAY_MINUTES = 5;

/** 연속 실패가 하나 늘 때마다 재시도 간격에 곱하는 값. */
const RETRY_DELAY_MULTIPLIER = 3;

/**
 * 다음 수집 시각을 계산한다.
 *
 * 성공하면 주기만큼 뒤다. 실패하면 `5분 × 3^(연속 실패 − 1)` 뒤지만 주기를 넘지 않는다.
 * 그래서 재시도 횟수에 상한을 두지 않아도, 간격이 주기에 닿으면 원래 주기와 같아진다.
 *
 * @param consecutiveFailures - 이번 결과까지 반영한 연속 실패 수. 성공이면 0이다.
 * @param intervalMinutes - Feed의 수집 주기(분)
 * @param now - 기준 시각
 */
export function computeNextRunAt(consecutiveFailures: number, intervalMinutes: number, now: Date): Date {
  const delayMinutes =
    consecutiveFailures === 0
      ? intervalMinutes
      : Math.min(FIRST_RETRY_DELAY_MINUTES * RETRY_DELAY_MULTIPLIER ** (consecutiveFailures - 1), intervalMinutes);
  return new Date(now.getTime() + delayMinutes * MINUTE_IN_MILLISECONDS);
}
