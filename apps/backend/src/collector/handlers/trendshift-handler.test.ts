import { describe, expect, it, vi } from 'vitest';
import { makeTrendshiftUrl, parseTrendshiftPage } from './trendshift-handler.ts';

/** 실제 주간 페이지의 `initialData` 한 줄을 줄인 것. */
const rankRow = {
  id: 1206390571,
  week: 40,
  rank: 1,
  score: 19890,
  full_name: 'owner/repo',
  repository_id: 28176,
  repository_stars: 43983,
  repository_forks: 4900,
  repository_stars_gained: 4097,
  repository_language: 'Python',
  repository_description: 'Local voice studio',
  tags: [{ id: 4, name: 'ai-voice', display_name: 'AI voice' }],
};

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

/** Next.js가 RSC 데이터를 넣는 모양대로 만든다. 문자열 안의 JSON은 한 번 더 이스케이프된다. */
function makeRscScript(rows: unknown[]): string {
  const chunk = `3b:["$","$L3c",null,{"children":["$","$L3d",null,{"initialData":${JSON.stringify(rows)},"label":"[not a bracket]"}]}]\n`;
  return `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`;
}

const jsonLdScript = `<script type="application/ld+json">{"@type":"WebSite"}</script><script type="application/ld+json">${JSON.stringify(itemList)}</script>`;

describe('parseTrendshiftPage', () => {
  it('RSC initialData를 순위순 EntryDraft로 바꾸고 점수·스타 수는 metrics에 넣는다', () => {
    const secondRow = { ...rankRow, rank: 2, full_name: 'other/tool', repository_id: 7 };
    const drafts = parseTrendshiftPage(makeRscScript([secondRow, rankRow]) + jsonLdScript);
    expect(drafts.map((draft) => draft.title)).toEqual(['owner/repo', 'other/tool']);
    expect(drafts[0]).toMatchObject({
      url: 'https://github.com/owner/repo',
      externalId: 'owner/repo',
      author: 'owner',
      summary: 'Local voice studio',
      extra: { language: 'Python', tags: ['AI voice'], trendshiftUrl: 'https://trendshift.io/repositories/28176' },
      metrics: { score: 19890, stars: 43983, forks: 4900, starsGained: 4097 },
    });
  });

  it('RSC 데이터가 없으면 JSON-LD로 읽고 대신 읽었다고 알린다', () => {
    const onFallback = vi.fn();
    const drafts = parseTrendshiftPage(jsonLdScript, onFallback);
    expect(drafts).toEqual([
      expect.objectContaining({
        url: 'https://github.com/owner/repo',
        title: 'owner/repo',
        extra: { language: 'Python', tags: ['AI'], trendshiftUrl: 'https://trendshift.io/repositories/15603' },
      }),
    ]);
    expect(drafts[0].metrics).toBeUndefined();
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it('둘 다 없으면 실패로 끝낸다(0건 저장 대신 오류 기록)', () => {
    expect(() => parseTrendshiftPage('<html></html>')).toThrow('ItemList');
  });
});

describe('makeTrendshiftUrl', () => {
  it('기간과 언어로 순위표 주소를 만든다', () => {
    expect(makeTrendshiftUrl('weekly')).toBe('https://trendshift.io/weekly');
    expect(makeTrendshiftUrl('yearly', 'TypeScript')).toBe('https://trendshift.io/yearly?language=TypeScript');
  });
});
