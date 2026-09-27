/** Anthropic 뉴스 목록 페이지(HTML)에서 글을 뽑는 Handler. 공식 RSS가 없다. */
import * as cheerio from 'cheerio';
import { defineHandler } from './define-handler.ts';

const BASE_URL = 'https://www.anthropic.com';

/** 뉴스 목록 페이지 HTML을 EntryDraft 목록으로 바꾼다. 클래스 이름은 빌드마다 해시가 붙어서 앞부분만 맞춘다. */
export function parseNewsListPage(html: string) {
  const $ = cheerio.load(html);
  return $('a[href^="/news/"]:has(time)')
    .map((_, element) => {
      const link = $(element);
      const path = link.attr('href')!;
      const dateText = link.find('time').text().trim();
      const publishedAt = new Date(`${dateText} UTC`);
      const subject = link.find('[class*="__subject"]').text().trim() || undefined;
      return {
        url: `${BASE_URL}${path}`,
        title: link.find('[class*="__title"]').text().trim(),
        publishedAt: Number.isNaN(publishedAt.getTime()) ? undefined : publishedAt,
        extra: { subject },
        raw: { path, dateText, subject },
      };
    })
    .get()
    .filter((draft) => draft.title);
}

export const anthropicNewsHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const html = await httpClient(`${BASE_URL}/news`, { responseType: 'text' });
    return parseNewsListPage(html);
  },
});
