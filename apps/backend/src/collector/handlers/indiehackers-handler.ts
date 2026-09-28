/**
 * Indie Hackers의 지난주 인기글(`/top/week-of-<월요일>`)을 HTML에서 뽑는 Handler.
 * 공식 RSS·API가 없고 비공식 피드도 동작하지 않는다. `/newest`는 스팸이 많아 주간 인기글을 쓴다.
 * 끝난 주만 보므로 주가 바뀐 뒤 첫 수집에서만 새 Entry가 생긴다.
 */
import * as cheerio from 'cheerio';
import { defineHandler } from './define-handler.ts';

const BASE_URL = 'https://www.indiehackers.com';

/** `now` 직전에 끝난 주의 월요일을 `2026-09-21` 형식으로 만든다(UTC 기준). */
export function makePreviousWeekMonday(now: Date): string {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

/** 날짜 툴팁 "Thursday, September 17th 2026 (7:09 am)"를 Date로 바꾼다. 시간대 표기가 없어 UTC로 읽는다. */
function parsePostDate(title: string | undefined): Date | undefined {
  if (!title) return undefined;
  const normalized = title.replace(/^\w+, /, '').replace(/(\d)(st|nd|rd|th)/, '$1').replace(/[()]/g, '');
  const date = new Date(`${normalized} UTC`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** 글 목록 페이지 HTML을 EntryDraft 목록으로 바꾼다. 페이지 구조가 바뀌면 여기만 고친다. */
export function parsePostListPage(html: string) {
  const $ = cheerio.load(html);
  return $('.feed-item')
    .map((_, element) => {
      const item = $(element);
      const titleLink = item.find('.feed-item__title-link');
      const postPath = titleLink.attr('href');
      if (!postPath) return [];
      const url = `${BASE_URL}${postPath}`;
      return {
        url,
        title: titleLink.text().trim(),
        publishedAt: parsePostDate(item.find('.feed-item__date').attr('title')),
        author: item.find('.user-link__name').first().text().trim() || undefined,
        extra: {
          score: Number(item.find('.feed-item__likes-count').text().trim()) || undefined,
          commentCount: Number(item.find('.feed-item__reply-count').text().trim()) || 0,
          commentsUrl: url,
        },
        raw: { postPath, dateTitle: item.find('.feed-item__date').attr('title') },
      };
    })
    .get();
}

export const indiehackersHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const html = await httpClient(`${BASE_URL}/top/week-of-${makePreviousWeekMonday(new Date())}`, { responseType: 'text' });
    return parsePostListPage(html);
  },
});
