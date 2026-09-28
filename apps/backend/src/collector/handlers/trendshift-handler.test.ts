import { describe, expect, it } from 'vitest';
import { parseTrendshiftPage } from './trendshift-handler.ts';

const itemList = {
  '@type': 'ItemList',
  itemListElement: [
    {
      position: 1,
      url: 'https://trendshift.io/repositories/15603',
      item: { name: 'owner/repo', description: 'Agent Memory', codeRepository: 'https://github.com/owner/repo', programmingLanguage: 'Python', author: { name: 'owner' }, keywords: ['AI'] },
    },
  ],
};

describe('parseTrendshiftPage', () => {
  it('JSON-LD ItemList의 저장소를 EntryDraft로 바꾼다', () => {
    const html = `<script type="application/ld+json">{"@type":"WebSite"}</script><script type="application/ld+json">${JSON.stringify(itemList)}</script>`;
    expect(parseTrendshiftPage(html)).toEqual([
      expect.objectContaining({
        url: 'https://github.com/owner/repo',
        title: 'owner/repo',
        externalId: 'owner/repo',
        extra: { language: 'Python', keywords: ['AI'], trendshiftUrl: 'https://trendshift.io/repositories/15603' },
      }),
    ]);
  });

  it('ItemList가 없으면 실패로 끝낸다(0건 저장 대신 오류 기록)', () => {
    expect(() => parseTrendshiftPage('<html></html>')).toThrow('ItemList');
  });
});
