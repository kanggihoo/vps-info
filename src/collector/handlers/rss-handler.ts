/** RSS와 Atom을 읽는 일반 Handler. YouTube 채널 RSS도 이 Handler로 수집한다. */
import Parser from 'rss-parser';
import { defineHandler } from './define-handler.ts';

/** 요약으로 남길 최대 글자 수. 원문 본문을 저장하지 않는다는 결정(링크와 메타데이터만 저장)을 지키기 위한 상한이다. */
const SUMMARY_MAX_LENGTH = 500;

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
        summary: item.contentSnippet?.slice(0, SUMMARY_MAX_LENGTH),
        raw: item,
      }));
  },
});
