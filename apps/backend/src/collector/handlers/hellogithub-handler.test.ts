import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { hellogithubHandler, makeHelloGithubUrl } from './hellogithub-handler.ts';

const item = { item_id: 'a1', full_name: 'owner/repo', title: '중국어 제목', title_en: 'English title', summary: '중국어 요약', summary_en: 'English summary', author: 'owner', primary_lang: 'Rust', clicks_total: 759, comment_total: 3 };

/** 요청한 URL을 기록하고 페이지별 응답을 차례로 돌려주는 가짜 HTTP 클라이언트. */
function createFakeHttpClient(pages: { data: unknown[]; has_more?: boolean }[]) {
  const requestedUrls: string[] = [];
  const httpClient = (async (url: string) => {
    requestedUrls.push(url);
    return pages[requestedUrls.length - 1];
  }) as unknown as HttpClient;
  return { httpClient, requestedUrls };
}

describe('makeHelloGithubUrl', () => {
  it('rankBy와 tid가 없으면 서버 기본 목록 주소다', () => {
    expect(makeHelloGithubUrl(1)).toBe('https://api.hellogithub.com/v1/?sort_by=featured&page=1');
  });

  it('rankBy와 tid를 붙인다', () => {
    expect(makeHelloGithubUrl(2, 'yearly', 'Z8PipJsHCX')).toBe('https://api.hellogithub.com/v1/?sort_by=featured&page=2&rank_by=yearly&tid=Z8PipJsHCX');
  });
});

describe('hellogithubHandler', () => {
  it('항목을 EntryDraft로 바꾸고 영어판 제목·요약을 먼저 쓴다', async () => {
    const { httpClient } = createFakeHttpClient([{ data: [item] }]);
    const drafts = await hellogithubHandler.fetchEntries({}, { httpClient });

    expect(drafts[0]).toMatchObject({
      url: 'https://github.com/owner/repo',
      title: 'owner/repo — English title',
      externalId: 'a1',
      summary: 'English summary',
      extra: { language: 'Rust', hellogithubUrl: 'https://hellogithub.com/repository/owner/repo' },
      metrics: { clicks: 759, commentCount: 3 },
    });
  });

  it('rankLimit이 없으면 첫 페이지만 받는다', async () => {
    const { httpClient, requestedUrls } = createFakeHttpClient([{ data: [item], has_more: true }]);
    await hellogithubHandler.fetchEntries({}, { httpClient });
    expect(requestedUrls).toEqual(['https://api.hellogithub.com/v1/?sort_by=featured&page=1']);
  });

  it('rankLimit만큼 페이지를 차례로 받고, 다음 페이지가 없으면 멈춘다', async () => {
    const { httpClient, requestedUrls } = createFakeHttpClient([
      { data: [item], has_more: true },
      { data: [{ ...item, item_id: 'a2' }], has_more: false },
      { data: [{ ...item, item_id: 'a3' }] },
    ]);
    const drafts = await hellogithubHandler.fetchEntries({ rankBy: 'yearly', tid: 'all' }, { httpClient, rankLimit: 60 });

    expect(drafts.map((draft) => draft.externalId)).toEqual(['a1', 'a2']);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1]).toContain('page=2&rank_by=yearly&tid=all');
  });
});
