import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { hackernewsHandler } from './hackernews-handler.ts';

const API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';

/** URL별로 정해진 응답을 돌려주고, 요청한 URL을 기록하는 가짜 HTTP 클라이언트. */
function createFakeHttpClient(responsesByUrl: Record<string, unknown>) {
  const requestedUrls: string[] = [];
  const httpClient = (async (url: string) => {
    requestedUrls.push(url);
    return responsesByUrl[url] ?? null;
  }) as unknown as HttpClient;
  return { httpClient, requestedUrls };
}

describe('hackernewsHandler', () => {
  it('목록의 각 item을 EntryDraft로 바꾼다', async () => {
    const { httpClient } = createFakeHttpClient({
      [`${API_BASE_URL}/beststories.json`]: [1, 2, 3],
      [`${API_BASE_URL}/item/1.json`]: { id: 1, title: '외부 링크 글', url: 'https://example.com/a', by: 'alice', time: 1_758_000_000, score: 120, descendants: 45 },
      [`${API_BASE_URL}/item/2.json`]: { id: 2, title: 'Ask HN: 링크 없는 글', by: 'bob', time: 1_758_000_100 },
      // 3번은 삭제된 글이라 null이 온다
    });
    const drafts = await hackernewsHandler.fetchEntries({ section: 'best' }, { httpClient });

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      url: 'https://example.com/a',
      title: '외부 링크 글',
      externalId: '1',
      author: 'alice',
      publishedAt: new Date(1_758_000_000 * 1000),
      extra: { score: 120, commentCount: 45, commentsUrl: 'https://news.ycombinator.com/item?id=1' },
    });
    // 외부 링크가 없는 글은 HN 토론 페이지가 원문이다.
    expect(drafts[1].url).toBe('https://news.ycombinator.com/item?id=2');
  });

  it('section에 따라 목록 주소가 바뀌고, 상위 30개 item만 요청한다', async () => {
    const storyIds = Array.from({ length: 50 }, (_, index) => index + 1);
    const { httpClient, requestedUrls } = createFakeHttpClient({ [`${API_BASE_URL}/showstories.json`]: storyIds });
    await hackernewsHandler.fetchEntries({ section: 'show' }, { httpClient });

    expect(requestedUrls[0]).toBe(`${API_BASE_URL}/showstories.json`);
    expect(requestedUrls.filter((url) => url.includes('/item/'))).toHaveLength(30);
  });
});
