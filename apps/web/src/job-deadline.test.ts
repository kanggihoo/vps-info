import { describe, expect, it } from 'vitest';
import { describeJobDeadline, getTodayInKorea } from './job-deadline.ts';

describe('describeJobDeadline', () => {
  it('마감일이 남았으면 날짜를, 당일까지는 진행 중으로 본다', () => {
    expect(describeJobDeadline('2026-10-31', false, '2026-10-01')).toBe('~10/31');
    expect(describeJobDeadline('2026-10-31', false, '2026-10-31')).toBe('~10/31');
  });

  it('마감일이 지났으면 마감이다', () => {
    expect(describeJobDeadline('2026-10-31', false, '2026-11-01')).toBe('마감');
  });

  it('마감일이 없으면 상시일 때만 표시한다', () => {
    expect(describeJobDeadline(undefined, true, '2026-10-01')).toBe('상시');
    expect(describeJobDeadline(undefined, false, '2026-10-01')).toBeUndefined();
  });

  it('마감일이 있으면 상시 표시보다 앞선다', () => {
    expect(describeJobDeadline('2026-10-31', true, '2026-10-01')).toBe('~10/31');
  });
});

describe('getTodayInKorea', () => {
  it('UTC 15시부터는 한국의 다음 날이다', () => {
    expect(getTodayInKorea(new Date('2026-10-30T14:59:00Z'))).toBe('2026-10-30');
    expect(getTodayInKorea(new Date('2026-10-30T15:00:00Z'))).toBe('2026-10-31');
  });
});
