import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { rssHandler } from './rss-handler.ts';

/** URL과 상관없이 정해진 본문을 돌려주는 가짜 HTTP 클라이언트. */
const fakeHttpClientReturning = (body: string) => (async () => body) as unknown as HttpClient;

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example</title>
  <item>
    <title>첫 글</title><link>https://example.com/first</link>
    <guid>first-guid</guid><pubDate>Tue, 22 Sep 2026 10:00:00 GMT</pubDate>
    <description>${'가'.repeat(600)}</description>
  </item>
  <item><title>링크 없는 글</title></item>
</channel></rss>`;

const YOUTUBE_ATOM_XML = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Channel</title>
  <entry>
    <id>yt:video:abc123</id><title>영상 제목</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
    <author><name>채널 이름</name></author>
    <published>2026-09-22T23:00:10+00:00</published>
  </entry>
</feed>`;

describe('rssHandler', () => {
  it('RSS 항목을 EntryDraft로 바꾸고, 링크나 제목이 없는 항목은 버린다', async () => {
    const drafts = await rssHandler.fetchEntries({ url: 'https://example.com/rss' }, { httpClient: fakeHttpClientReturning(RSS_XML) });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      url: 'https://example.com/first',
      title: '첫 글',
      externalId: 'first-guid',
      publishedAt: new Date('2026-09-22T10:00:00Z'),
    });
    expect(drafts[0].summary).toHaveLength(500); // 요약은 500자로 자른다
    expect(drafts[0].raw).toBeDefined();
  });

  it('YouTube 채널의 Atom 피드는 id를 고유 식별자로 쓴다', async () => {
    const drafts = await rssHandler.fetchEntries(
      { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=x' },
      { httpClient: fakeHttpClientReturning(YOUTUBE_ATOM_XML) },
    );
    expect(drafts).toEqual([
      expect.objectContaining({
        url: 'https://www.youtube.com/watch?v=abc123',
        title: '영상 제목',
        externalId: 'yt:video:abc123',
        publishedAt: new Date('2026-09-22T23:00:10Z'),
      }),
    ]);
  });
});
