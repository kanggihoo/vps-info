/** 관리자 화면의 날짜·주기·실행 상태와 변경 시각 미리보기(ADR-0017). */
import type { AdminFeed } from '@trendboda/api-types';

const dateFormatter = new Intl.DateTimeFormat('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** 표시할 날짜가 없으면 아직 기록이 없음을 나타낸다. */
export function formatAdminDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '기록 없음';
}

/** 분 단위 운영 주기를 사람이 읽는 단위로 표시한다. */
export function formatInterval(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}일`;
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  return `${minutes}분`;
}

/** 일시정지와 별개로 수동 요청·실행 상태를 우선 표시한다. */
export function describeAdminFeed(feed: AdminFeed): string {
  if (feed.latestAttempt?.status === 'running') return '실행 중';
  if (feed.manualRequestedAt) return '요청됨';
  if (feed.paused) return '일시정지';
  if (feed.consecutiveFailures > 0) return `연속 ${feed.consecutiveFailures}회 실패`;
  return feed.lastSuccessAt ? '정상' : '첫 수집 대기';
}

/** 저장 시각은 서버가 확정한다. 화면은 기존 5분·3배 백오프에 따른 예상 시각만 표시한다. */
export function previewNextRunAt(failures: number, intervalMinutes: number, now = Date.now()): string {
  const delayMinutes = failures === 0 ? intervalMinutes : Math.min(5 * 3 ** (failures - 1), intervalMinutes);
  return new Date(now + delayMinutes * 60_000).toISOString();
}
