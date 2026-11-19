/** 실제 위비티 목록 HTML(fixture)의 제목·주최·분야·남은 날짜 구조와 페이지 요청을 검사한다. */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { parseContestListPage, wevityHandler } from './wevity-handler.ts';

const LIST_HTML = readFileSync(new URL('./fixtures/wevity-contest-list.html', import.meta.url), 'utf8');

/** fixture를 받은 시각(한국 2026-11-19 22시). D-N은 이날 기준이다. */
const FETCHED_AT = new Date('2026-11-19T13:00:00Z');

describe('parseContestListPage', () => {
  it('목록 행을 EntryDraft로 바꾸고 제목 뒤 표시(SPECIAL·신규)는 뺀다', () => {
    const drafts = parseContestListPage(LIST_HTML, FETCHED_AT);
    expect(drafts.map(({ url, title, externalId, author, extra }) => ({ url, title, externalId, author, extra }))).toEqual([
      {
        url: 'https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&ix=112398',
        title: '(4주) 신춘문예 작가님에게 글쓰기를 배워보세요! 참여자 모집 중',
        externalId: '112398',
        author: '작필(作筆)',
        extra: { deadline: '2026-11-30', tags: ['광고/마케팅', '논문/리포트', '문학/글/시나리오', '예체능/미술/음악', '대외활동/서포터즈', '기타'] },
      },
      {
        url: 'https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&ix=112349',
        title: '농민신문 제31회 신춘문예 작품 공모',
        externalId: '112349',
        author: '농민신문',
        extra: { deadline: '2026-11-27', tags: ['광고/마케팅', '논문/리포트', '문학/글/시나리오', '예체능/미술/음악', '기타'] },
      },
      // 접수예정도 D-N은 마감까지의 날 수다. 이 공모전 상세 페이지의 접수기간은 2027-02-22 ~ 2027-02-26이다(2026-11-19 확인).
      // 일반 공모전 112474도 상세 페이지 접수기간이 2026-11-19 ~ 2026-11-29로 아래 기대값과 같다.
      {
        url: 'https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&ix=111899',
        title: '농업가치 확산을 위한 농심천심 대학(원)생 논문 공모전',
        externalId: '111899',
        author: '농업협동조합중앙회',
        extra: { deadline: '2027-02-26', tags: ['기획/아이디어', '논문/리포트', '과학/공학', '예체능/미술/음악'] },
      },
      {
        url: 'https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&ix=112474',
        title: '일상 속 아이디어를 AI로 웹·앱 서비스로! INNO-CODER AI HACKATHON 참가팀 모집',
        externalId: '112474',
        author: '(재)운당나눔재단, (재)울산창조경제혁신센터',
        extra: { deadline: '2026-11-29', tags: ['게임/소프트웨어'] },
      },
    ]);
    expect(drafts[0]?.raw).toMatchObject({ badges: ['SPECIAL'], dayText: 'D-11 접수중', viewCount: '8,185' });
  });

  it('D-day는 오늘 마감, 제목 안의 강조 태그는 남기고, 제목이나 번호가 없는 행은 버린다', () => {
    const html = `<ul class="list">
      <li><div class="tit"><a href="?c=find&ix=1"><b>오늘</b> 마감 <span class='stat new'>신규</span></a></div><div class="day">D-day <span>마감임박</span></div></li>
      <li><div class="tit"><a href="?c=find">번호 없음</a></div></li>
      <li><div class="tit"><a href="?c=find&ix=2"><span class='stat spec'>SPECIAL</span></a></div></li>
    </ul>`;
    const drafts = parseContestListPage(html, FETCHED_AT);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ externalId: '1', title: '오늘 마감', author: undefined, extra: { deadline: '2026-11-19', tags: [] } });
    expect(drafts[0]?.raw).toMatchObject({ badges: ['신규'] });
  });

  it('구조가 바뀌어 목록을 못 찾으면 빈 목록을 돌려준다(코어가 0건 실패로 기록한다)', () => {
    expect(parseContestListPage('<html><body><ul class="cards"></ul></body></html>', FETCHED_AT)).toEqual([]);
  });
});

describe('wevityHandler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('공모전 목록을 3페이지까지 2초 간격으로 받는다', async () => {
    vi.useFakeTimers();
    const requests: { url: string; options: unknown }[] = [];
    const requestedPages = () => requests.map(({ options }) => (options as { query: { gp: number } }).query.gp);
    const httpClient = (async (url: string, options: unknown) => {
      requests.push({ url, options });
      return LIST_HTML;
    }) as unknown as HttpClient;

    const pending = wevityHandler.fetchEntries({}, { httpClient });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(requestedPages()).toEqual([1]);
    await vi.advanceTimersByTimeAsync(2_001);
    const drafts = await pending;

    expect(requests).toEqual(
      [1, 2, 3].map((gp) => ({ url: 'https://www.wevity.com/', options: { query: { c: 'find', s: 1, gub: 1, gp }, responseType: 'text' } })),
    );
    expect(drafts).toHaveLength(12);
  });
});
