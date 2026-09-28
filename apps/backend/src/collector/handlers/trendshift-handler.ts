/**
 * Trendshift(GitHub 저장소 트렌드) 첫 화면에서 저장소 목록을 뽑는 Handler.
 * 공식 API는 없지만 페이지에 schema.org `ItemList` JSON-LD가 있어서, 화면 구조 대신 그것을 읽는다.
 * 순위는 `position` 순서로 정렬해 돌려준다. 점수가 없어서 `metrics`도 없다.
 */
import * as cheerio from 'cheerio';
import { defineHandler } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

/** JSON-LD `ItemList`의 항목 중 쓰는 필드. */
type TrendshiftListItem = {
  position: number;
  /** Trendshift의 저장소 페이지. */
  url: string;
  item: {
    /** `owner/name`. */
    name: string;
    description?: string;
    codeRepository: string;
    programmingLanguage?: string;
    author?: { name?: string };
    keywords?: string[];
  };
};

/** Trendshift 페이지 HTML의 JSON-LD를 EntryDraft 목록으로 바꾼다. */
export function parseTrendshiftPage(html: string) {
  const $ = cheerio.load(html);
  const itemList = $('script[type="application/ld+json"]')
    .map((_, element) => JSON.parse($(element).text()))
    .get()
    .find((jsonLd) => jsonLd['@type'] === 'ItemList');
  if (!itemList) throw new Error('Trendshift 페이지에서 ItemList JSON-LD를 찾지 못했다. 페이지 구조가 바뀌었는지 확인한다.');

  return (itemList.itemListElement as TrendshiftListItem[])
    .toSorted((first, second) => first.position - second.position)
    .map((listItem) => ({
      url: listItem.item.codeRepository,
      title: listItem.item.name,
      externalId: listItem.item.name,
      author: listItem.item.author?.name,
      summary: toSummaryText(listItem.item.description),
      extra: {
        language: listItem.item.programmingLanguage,
        keywords: listItem.item.keywords,
        trendshiftUrl: listItem.url,
      },
      raw: listItem,
    }));
}

export const trendshiftHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const html = await httpClient('https://trendshift.io/', { responseType: 'text' });
    return parseTrendshiftPage(html);
  },
});
