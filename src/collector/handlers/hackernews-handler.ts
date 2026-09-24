/** Hacker News 공식 API(Firebase)로 best·show 목록을 가져오는 Handler. */
import { defineHandler } from './define-handler.ts';

const API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';

/**
 * 목록에서 가져올 상위 항목 수. 목록은 최대 약 200개지만, 매번 200번씩 요청하지 않도록 상위만 본다.
 * ponytail: 순위 밖에서 들어왔다 나간 글은 놓친다. 놓치는 글이 문제되면 늘린다.
 */
const TOP_STORY_COUNT = 30;

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
  async fetchEntries({ section }, { httpClient }) {
    const storyIds = await httpClient<number[]>(`${API_BASE_URL}/${section}stories.json`);
    const items = await Promise.all(
      storyIds.slice(0, TOP_STORY_COUNT).map((id) => httpClient<HackerNewsItem | null>(`${API_BASE_URL}/item/${id}.json`)),
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
          extra: { score: item.score, commentCount: item.descendants, commentsUrl },
          raw: item,
        };
      });
  },
});
