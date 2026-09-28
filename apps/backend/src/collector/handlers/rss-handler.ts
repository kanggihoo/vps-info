/** RSS와 Atom을 읽는 일반 Handler. YouTube 채널 RSS도 이 Handler로 수집한다. */
import Parser from 'rss-parser';
import { defineHandler } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

const feedParser = new Parser();

export const rssHandler = defineHandler<{ url: string }>({
  async fetchEntries({ url }, { httpClient }) {
    const xml = await httpClient(url, { responseType: 'text' });
    const parsedFeed = await feedParser.parseString(xml);
    return parsedFeed.items
      .filter((item) => item.link && item.title)
      .map((item) => ({
        url: item.link!,
        title: item.title!,
        // RSS는 guid, Atom(YouTube 등)은 id에 고유 식별자가 있다.
        externalId: item.guid ?? item.id,
        publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
        author: item.creator ?? item.author,
        // rss-parser의 contentSnippet은 들여쓰기된 첫 문단을 잃는 경우가 있어(Product Hunt) 본문 HTML에서 직접 뽑는다.
        summary: toSummaryText(item.content ?? item.contentSnippet),
        raw: item,
      }));
  },
});
