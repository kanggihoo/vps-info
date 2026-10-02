import { describe, expect, it } from 'vitest';
import type { AdminFeed } from '@trendboda/api-types';
import { describeAdminFeed, previewNextRunAt } from './admin-display.ts';

describe('admin display', () => {
  it('주기 변경 미리보기에 실패 백오프와 주기 상한을 적용한다', () => {
    const now = Date.parse('2026-10-02T00:00:00Z');
    expect(previewNextRunAt(0, 60, now)).toBe('2026-10-02T01:00:00.000Z');
    expect(previewNextRunAt(2, 60, now)).toBe('2026-10-02T00:15:00.000Z');
    expect(previewNextRunAt(2, 10, now)).toBe('2026-10-02T00:10:00.000Z');
  });
  it('자동 수집 일시정지 중에도 수동 요청과 실행 중 상태를 표시한다', () => {
    const feed = { paused: true, manualRequestedAt: null, latestAttempt: null, consecutiveFailures: 0, lastSuccessAt: null } as AdminFeed;
    expect(describeAdminFeed(feed)).toBe('일시정지');
    expect(describeAdminFeed({ ...feed, manualRequestedAt: '2026-10-02T00:00:00Z' })).toBe('요청됨');
    expect(describeAdminFeed({ ...feed, latestAttempt: { status: 'running' } as AdminFeed['latestAttempt'] })).toBe('실행 중');
  });
});
