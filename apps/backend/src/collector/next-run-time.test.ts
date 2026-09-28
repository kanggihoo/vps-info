import { describe, expect, it } from 'vitest';
import { computeNextRunAt } from './next-run-time.ts';

const now = new Date('2026-09-24T14:00:00Z');
const minutesAfterNow = (consecutiveFailures: number, intervalMinutes: number) =>
  (computeNextRunAt(consecutiveFailures, intervalMinutes, now).getTime() - now.getTime()) / 60_000;

describe('computeNextRunAt', () => {
  it('성공하면 주기만큼 뒤다', () => {
    expect(minutesAfterNow(0, 30)).toBe(30);
  });

  it('실패하면 5분·15분·45분… 뒤지만 주기를 넘지 않는다', () => {
    expect([1, 2, 3, 4].map((failures) => minutesAfterNow(failures, 30))).toEqual([5, 15, 30, 30]);
    expect([1, 2, 3, 4, 5, 6].map((failures) => minutesAfterNow(failures, 360))).toEqual([5, 15, 45, 135, 360, 360]);
  });
});
