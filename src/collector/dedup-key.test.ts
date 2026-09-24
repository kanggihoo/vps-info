import { describe, expect, it } from 'vitest';
import { makeDedupKey, normalizeUrl } from './dedup-key.ts';

describe('normalizeUrl', () => {
  it('프래그먼트와 추적 파라미터를 지우고 쿼리를 정렬한다', () => {
    expect(normalizeUrl('HTTPS://Example.com/a?b=2&utm_source=x&a=1#top')).toBe('https://example.com/a?a=1&b=2');
  });
});

describe('makeDedupKey', () => {
  it('외부 식별자가 있으면 그 값을 쓴다', () => {
    expect(makeDedupKey({ externalId: '42', url: 'https://example.com' })).toBe('ext:42');
  });

  it('외부 식별자가 없으면 정규화한 URL이 같을 때 같은 키가 된다', () => {
    const first = makeDedupKey({ url: 'https://example.com/a?utm_source=x' });
    expect(first).toBe(makeDedupKey({ url: 'https://example.com/a#section' }));
    expect(first).toMatch(/^url:[0-9a-f]{64}$/);
  });
});
