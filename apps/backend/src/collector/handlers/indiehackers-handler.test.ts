import { describe, expect, it } from 'vitest';
import { makePreviousWeekMonday, parsePostListPage } from './indiehackers-handler.ts';

const POST_LIST_HTML = `
<div class="feed-item">
  <a class="feed-item__likes"><span class="feed-item__likes-count">68</span></a>
  <div class="feed-item__content">
    <a class="feed-item__title-link" href="/post/i-built-this-cedfbfd82e">I built this for myself</a>
    <div class="feed-item__metadata">
      <a class="user-link__link" href="/Saied71"><span class="user-link__name">Saied71</span></a>
      <a class="feed-item__date" title="Thursday, September 17th 2026 (7:09 am)">10 days ago</a>
      <a class="feed-item__reply-count">115</a>
    </div>
  </div>
</div>`;

describe('parsePostListPage', () => {
  it('글 제목·작성자·게시 시각·좋아요·댓글 수를 뽑는다', () => {
    const url = 'https://www.indiehackers.com/post/i-built-this-cedfbfd82e';
    expect(parsePostListPage(POST_LIST_HTML)).toEqual([
      expect.objectContaining({
        url,
        title: 'I built this for myself',
        author: 'Saied71',
        publishedAt: new Date('2026-09-17T07:09:00Z'),
        extra: { score: 68, commentCount: 115, commentsUrl: url },
      }),
    ]);
  });
});

describe('makePreviousWeekMonday', () => {
  it('지난주 월요일을 만든다', () => {
    expect(makePreviousWeekMonday(new Date('2026-09-28T00:00:00Z'))).toBe('2026-09-21'); // 월요일
    expect(makePreviousWeekMonday(new Date('2026-09-27T23:00:00Z'))).toBe('2026-09-14'); // 일요일
    expect(makePreviousWeekMonday(new Date('2026-01-01T00:00:00Z'))).toBe('2025-12-22');
  });
});
