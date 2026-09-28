import { describe, expect, it } from 'vitest';
import { parseNewsListPage } from './anthropic-news-handler.ts';

const NEWS_LIST_HTML = `
<a href="/news/claude-discovers" class="PublicationList-module__KxYrHG__listItem">
  <div><time class="PublicationList-module__KxYrHG__date">Sep 23, 2026</time>
  <span class="PublicationList-module__KxYrHG__subject">Science</span></div>
  <span class="PublicationList-module__KxYrHG__title"> Claude discovers an enzyme</span>
</a>
<a href="/news/no-date">날짜 없는 링크는 목록 항목이 아니다</a>`;

describe('parseNewsListPage', () => {
  it('날짜가 있는 뉴스 목록 항목만 뽑는다', () => {
    expect(parseNewsListPage(NEWS_LIST_HTML)).toEqual([
      expect.objectContaining({
        url: 'https://www.anthropic.com/news/claude-discovers',
        title: 'Claude discovers an enzyme',
        publishedAt: new Date('2026-09-23T00:00:00Z'),
        extra: { subject: 'Science' },
      }),
    ]);
  });
});
