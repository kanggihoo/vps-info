/**
 * 실제 DACON 목록 API 응답(fixture)으로 요청과 EntryDraft 변환을 검사한다.
 * fixture는 2026-11-20에 `app.dacon.io/api/v1/competition/list?offset=0`으로 받은 15개 중 상금이 있는 대회 1개, 상금 대신 "본선 진출"·"-"인 대회 2개를 골랐다.
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { daconHandler } from './dacon-handler.ts';

const RESPONSE = JSON.parse(readFileSync(new URL('./fixtures/dacon-competitions.json', import.meta.url), 'utf8')) as { data: Record<string, unknown>[] };

/** 응답 항목을 돌려주고 요청을 기록하는 가짜 HTTP 클라이언트. */
function makeHttpClient(data: Record<string, unknown>[]) {
  const requests: { url: string; options: unknown }[] = [];
  const httpClient = (async (url: string, options: unknown) => {
    requests.push({ url, options });
    return { data };
  }) as unknown as HttpClient;
  return { httpClient, requests };
}

it('대회 목록 첫 페이지를 한 번 요청한다', async () => {
  const { httpClient, requests } = makeHttpClient(RESPONSE.data);

  await daconHandler.fetchEntries({}, { httpClient });

  expect(requests).toEqual([{ url: 'https://app.dacon.io/api/v1/competition/list', options: { query: { offset: 0 } } }]);
});

it('대회를 EntryDraft로 바꾼다', async () => {
  const { httpClient } = makeHttpClient(RESPONSE.data);

  const drafts = await daconHandler.fetchEntries({}, { httpClient });

  expect(drafts.map((draft) => draft.externalId)).toEqual(['236771', '236743', '236746']);
  expect(drafts[0]).toMatchObject({
    url: 'https://dacon.io/competitions/official/236771/overview/description',
    title: '항만 문제해결을 위한 AI 기술 공모전',
    author: undefined,
    extra: { deadline: '2026-11-02', startDate: '2026-10-12', prize: '950만 원', tags: ['알고리즘', '코드 제출 평가', '개체 매칭', '해운물류'] },
  });
  // 상금이 "0"이면 비운다(화면 문구는 "본선 진출"·"-"). 키워드 사이의 빈 칸은 버린다.
  expect(drafts[1]?.extra).toMatchObject({ deadline: '2026-09-02', prize: undefined, tags: ['LG Aimers', '채용', '알고리즘', '코드제출', '정형', '스포츠', '야구'] });
  expect(drafts[2]?.extra).toMatchObject({ prize: undefined });
});

it('주최가 있으면 author로 쓰고, 날짜 형식이 다르거나 비면 비우고, id나 이름이 없는 항목은 버린다', async () => {
  const { httpClient } = makeHttpClient([
    { cpt_id: 1, name: '주최 있음', sponsor: '데이콘', keyword: null, prize: null, period_start: '', period_end: '내일' },
    { cpt_id: 2, name: '' },
    { cpt_id: 0, name: 'id 없음' },
  ]);

  const drafts = await daconHandler.fetchEntries({}, { httpClient });

  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({ externalId: '1', author: '데이콘', extra: { deadline: undefined, startDate: undefined, prize: undefined, tags: [] } });
});
