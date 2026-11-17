/** 실제 HTML의 형제 날짜·제목 구조와 중복·분류 링크 제외를 검사한다. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNewsListPage } from './anthropic-news-handler.ts';

const NEWS_LIST_HTML = readFileSync(new URL('./fixtures/anthropic-news.html', import.meta.url), 'utf8');

describe('parseNewsListPage', () => {
  it('현재 뉴스 카드와 목록 행에서 제목·게시일·분류를 뽑는다', () => {
    const drafts = parseNewsListPage(NEWS_LIST_HTML);
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    expect(drafts[0]).toMatchObject({
      url: 'https://www.anthropic.com/news/public-benefit-fund',
      title: 'Investing in the public benefit',
      publishedAt: new Date('2026-10-18T00:00:00Z'),
      extra: { subject: 'Announcements' },
    });
    expect(drafts.every((draft) => draft.title && draft.publishedAt)).toBe(true);
  });

  it('같은 글의 카드·목록 중복은 제거하고 분류·이미지·날짜 없는 링크는 제외한다', () => {
    const drafts = parseNewsListPage(NEWS_LIST_HTML + NEWS_LIST_HTML + '<a href="/news/announcements">Announcements</a><article><a href="/news/undated"><h3>No date</h3></a></article>');
    expect(drafts).toEqual(parseNewsListPage(NEWS_LIST_HTML));
    expect(drafts.some((draft) => draft.url.endsWith('/news/announcements'))).toBe(false);
  });

  it('뉴스에 올라온 다른 경로도 수집하고 datetime을 읽되 외부 링크는 제외한다', () => {
    const html = `<article><header><time datetime="2026-11-17T09:00:00Z">Nov 17, 2026</time></header>
      <a href="/claude-sonnet-5-5"><h3>Introducing Claude Sonnet 5.5</h3></a></article>
      <article><time>Nov 17, 2026</time><a href="https://example.com/news"><h3>External</h3></a></article>`;
    expect(parseNewsListPage(html)).toEqual([expect.objectContaining({
      url: 'https://www.anthropic.com/claude-sonnet-5-5', publishedAt: new Date('2026-11-17T09:00:00Z'),
    })]);
  });

  it('해석할 수 없는 게시일을 Invalid Date로 저장하지 않는다', () => {
    expect(parseNewsListPage('<article><time>unknown</time><a href="/news/example"><h3>Example</h3></a></article>')[0]?.publishedAt).toBeUndefined();
  });
});
