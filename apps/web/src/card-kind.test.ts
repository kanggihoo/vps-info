import { describe, expect, it } from 'vitest';
import { findCardKind, findChangeMetricKey } from './card-kind.ts';

describe('findCardKind', () => {
  it('Feed id, Feed Group id 순서로 찾고 없으면 글 카드다', () => {
    expect(findCardKind('openrouter-models')).toBe('model');
    expect(findCardKind('trendshift-weekly-python', 'trendshift')).toBe('repository');
    expect(findCardKind('hn-best', 'hacker-news')).toBe('article');
    expect(findCardKind('geeknews')).toBe('article');
  });
});

describe('findChangeMetricKey', () => {
  it('저장소는 늘어난 스타, 나머지는 점수의 증감을 본다', () => {
    expect(findChangeMetricKey('repository')).toBe('starsGained');
    expect(findChangeMetricKey('article')).toBe('score');
  });
});
