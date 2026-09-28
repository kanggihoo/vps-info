/** Hacker News 공식 API(Firebase)로 best·show 목록을 가져오는 Handler. */
import { defineHandler } from './define-handler.ts';

const API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';

/**
 * `rankLimit`이 없을 때 가져올 상위 항목 수. 목록은 최대 약 200개이고 item마다 요청이 하나씩 나간다.
 * 운영에서는 DB `feed.rank_limit`으로 정한다(ADR-0009).
 */
const DEFAULT_STORY_COUNT = 30;

/** 공식 API의 item 응답 중 쓰는 필드. */
type HackerNewsItem = {
  id: number;
  title?: string;
  url?: string;
  by?: string;
  time?: number;
  score?: number;
  descendants?: number;
};

export const hackernewsHandler = defineHandler<{ section: 'best' | 'show' }>({
  async fetchEntries({ section }, { httpClient, rankLimit }) {
    const storyIds = await httpClient<number[]>(`${API_BASE_URL}/${section}stories.json`);
    const items = await Promise.all(
      storyIds.slice(0, rankLimit ?? DEFAULT_STORY_COUNT).map((id) => httpClient<HackerNewsItem | null>(`${API_BASE_URL}/item/${id}.json`)),
    );
    return items
      .filter((item): item is HackerNewsItem & { title: string } => Boolean(item?.title))
      .map((item) => {
        const commentsUrl = `https://news.ycombinator.com/item?id=${item.id}`;
        return {
          // Ask HN처럼 외부 링크가 없는 글은 토론 페이지가 원문이다.
          url: item.url ?? commentsUrl,
          title: item.title,
          externalId: String(item.id),
          publishedAt: item.time ? new Date(item.time * 1000) : undefined,
          author: item.by,
          extra: { commentsUrl },
          metrics: { score: item.score, commentCount: item.descendants },
          raw: item,
        };
      });
  },
});
