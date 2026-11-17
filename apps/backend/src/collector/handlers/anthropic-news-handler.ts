/** Anthropic 뉴스 목록 페이지(HTML)에서 글을 뽑는 Handler. 공식 RSS가 없다. */
import * as cheerio from 'cheerio';
import { defineHandler } from './define-handler.ts';

const BASE_URL = 'https://www.anthropic.com';

/** 뉴스 카드와 목록 행의 제목 링크·형제 time을 읽는다. 이미지·분류 링크와 중복 카드는 제외한다. */
export function parseNewsListPage(html: string) {
  const $ = cheerio.load(html);
  const seenUrls = new Set<string>();
  return $('article:has(time), [data-peek]:has(time)')
    .filter((_, element) => $(element).find('article').length === 0)
    .map((_, element) => {
      const item = $(element);
      const link = item.find('a:has(h2), a:has(h3)').first();
      const path = link.attr('href');
      const title = link.find('h2, h3').text().trim();
      if (!path || !title) return [];
      const url = new URL(path, BASE_URL);
      if (url.origin !== BASE_URL || seenUrls.has(url.href)) return [];
      seenUrls.add(url.href);
      const time = item.find('time').first();
      const dateText = time.attr('datetime') || time.text().trim();
      const publishedAt = new Date(time.attr('datetime') ? dateText : `${dateText} UTC`);
      const subject = item.find('header p a, [class*="_category"] a').first().text().trim() || undefined;
      return {
        url: url.href,
        title,
        publishedAt: Number.isNaN(publishedAt.getTime()) ? undefined : publishedAt,
        extra: { subject },
        raw: { path, dateText, subject },
      };
    })
    .get();
}

export const anthropicNewsHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const html = await httpClient(`${BASE_URL}/news`, { responseType: 'text' });
    return parseNewsListPage(html);
  },
});
