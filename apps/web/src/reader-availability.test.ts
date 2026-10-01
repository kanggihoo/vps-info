import { describe, expect, it } from 'vitest';
import { isReaderAvailable } from './reader-availability.ts';

describe('isReaderAvailable', () => {
  it('제품·대시보드 화면으로 가는 Feed는 읽기 버튼을 숨긴다', () => {
    expect(isReaderAvailable('openrouter-models')).toBe(false);
  });

  it('나머지 Feed와 Feed Group의 Feed는 보여 준다', () => {
    expect(isReaderAvailable('techcrunch')).toBe(true);
    expect(isReaderAvailable('trendshift-weekly', 'trendshift')).toBe(true);
  });
});
