/**
 * 위비티(wevity.com) 공모전 전체 분야 목록을 HTML에서 뽑는 Handler.
 * 공식 RSS·API가 없어 목록 페이지(robots.txt가 전부 허용)를 파싱한다. 상세 페이지는 열지 않는다.
 * 목록은 등록순(공모전 번호 내림차순)이고, 1페이지 앞쪽에는 광고 상품(SPECIAL)이 고정으로 붙는다.
 */
import * as cheerio from 'cheerio';
import { defineHandler } from './define-handler.ts';
import { toKoreanDateString } from './job-posting.ts';

/** `gub=1`은 공모전, `gp`는 페이지 번호다. */
const LIST_URL = 'https://www.wevity.com/';
const LIST_QUERY = { c: 'find', s: 1, gub: 1 };

/**
 * 페이지당 15행이고 1페이지는 SPECIAL 14개 + 일반 1개라서, 3페이지면 일반 공모전 31개다.
 * 일반 공모전은 하루 15~20개 꼴이라(2026-11-14~19 측정, docs/feeds.md) 31개는 약 2일 치다.
 */
const PAGE_COUNT = 3;

/** 같은 호스트에 연달아 요청하지 않도록 페이지 사이에 두는 간격. */
const PAGE_INTERVAL_MILLISECONDS = 2_000;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * "D-11" 같은 남은 날짜 표기를 한국 날짜의 마감일로 바꾼다. 접수예정 공모전도 마감까지의 날 수다.
 *
 * @param now - 목록을 받은 시각. 테스트에서 고정한다.
 */
function parseDeadline(text: string, now: Date): string | undefined {
  const matched = text.match(/D-(\d+|day)/i);
  if (!matched?.[1]) return undefined;
  const days = /day/i.test(matched[1]) ? 0 : Number(matched[1]);
  return toKoreanDateString(new Date(now.getTime() + days * MILLISECONDS_PER_DAY));
}

/**
 * 목록 페이지 HTML을 EntryDraft 목록으로 바꾼다. 페이지 구조가 바뀌면 여기만 고친다.
 *
 * @param now - 목록을 받은 시각. 남은 날짜(D-N)를 마감일로 바꾸는 기준이다.
 */
export function parseContestListPage(html: string, now: Date) {
  const $ = cheerio.load(html);
  return $('ul.list > li:not(.top)')
    .map((_, element) => {
      const item = $(element);
      const anchor = item.find('.tit > a');
      const id = anchor.attr('href')?.match(/[?&]ix=(\d+)/)?.[1];
      // 제목 뒤의 SPECIAL·IDEA·신규 표시(span.stat)는 제목이 아니다. 다른 자식 요소는 제목의 일부로 둔다.
      const title = anchor.clone().find('span.stat').remove().end().text().replace(/\s+/g, ' ').trim();
      if (!id || !title) return [];
      const fieldText = item.find('.sub-tit').text().replace(/^\s*분야\s*:\s*/, '').trim();
      const dayText = item.find('.day').text().replace(/\s+/g, ' ').trim();
      const badges = anchor.find('span.stat').map((__, span) => $(span).text().trim()).get();
      return {
        url: `https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&ix=${id}`,
        title,
        externalId: id,
        author: item.find('.organ').text().trim() || undefined,
        extra: {
          deadline: parseDeadline(dayText, now),
          tags: fieldText ? fieldText.split(/\s*,\s*/) : [],
        },
        raw: { id, title, fieldText, organization: item.find('.organ').text().trim(), dayText, badges, viewCount: item.find('.read').text().trim() },
      };
    })
    .get();
}

export const wevityHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const drafts = [];
    for (let page = 1; page <= PAGE_COUNT; page += 1) {
      if (page > 1) await new Promise((resolve) => setTimeout(resolve, PAGE_INTERVAL_MILLISECONDS));
      const html = await httpClient(LIST_URL, { query: { ...LIST_QUERY, gp: page }, responseType: 'text' });
      drafts.push(...parseContestListPage(html, new Date()));
    }
    return drafts;
  },
});
