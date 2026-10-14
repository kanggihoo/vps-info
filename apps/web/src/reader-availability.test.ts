import { describe, expect, it } from 'vitest';
import { isReaderAvailable, READER_UNAVAILABLE_MESSAGE } from './reader-availability.ts';

describe('isReaderAvailable', () => {
  it('제품·대시보드·지원 화면으로 가는 Feed는 읽기 버튼을 비활성으로 둔다', () => {
    for (const feedId of ['openrouter-models', 'jumpit-backend', 'saramin-backend', 'linkareer-backend']) {
      expect(isReaderAvailable(feedId)).toBe(false);
    }
  });

  it('나머지 Feed와 Feed Group의 Feed는 쓸 수 있다. Product Hunt와 원티드도 쓸 수 있다', () => {
    expect(isReaderAvailable('techcrunch')).toBe(true);
    expect(isReaderAvailable('trendshift-weekly', 'trendshift')).toBe(true);
    expect(isReaderAvailable('producthunt')).toBe(true);
    expect(isReaderAvailable('wanted-backend', 'wanted')).toBe(true);
  });

  it('쓸 수 없는 이유를 알리는 문구가 있다', () => {
    expect(READER_UNAVAILABLE_MESSAGE).toContain('원문 읽기');
  });
});
