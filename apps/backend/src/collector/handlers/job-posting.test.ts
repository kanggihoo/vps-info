import { describe, expect, it } from 'vitest';
import { makeCareerLabel, toKoreanDateString } from './job-posting.ts';

describe('makeCareerLabel', () => {
  it('경력 범위를 한 줄로 만든다', () => {
    expect(makeCareerLabel(0, 0)).toBe('신입');
    expect(makeCareerLabel(0, 3)).toBe('신입~3년');
    expect(makeCareerLabel(0, 100)).toBe('경력 무관');
    expect(makeCareerLabel(0, undefined)).toBe('경력 무관');
    expect(makeCareerLabel(2, 5)).toBe('2~5년');
    expect(makeCareerLabel(3, 3)).toBe('3년');
    expect(makeCareerLabel(5, 100)).toBe('5년 이상');
  });
});

describe('toKoreanDateString', () => {
  it('UTC 자정 직전도 한국 날짜로 바꾼다', () => {
    expect(toKoreanDateString(new Date('2026-10-29T14:59:59Z'))).toBe('2026-10-29');
    expect(toKoreanDateString(new Date('2026-10-29T15:00:00Z'))).toBe('2026-10-30');
  });
});
