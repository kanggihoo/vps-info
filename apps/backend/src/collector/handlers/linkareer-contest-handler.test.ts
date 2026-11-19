/**
 * 실제 링커리어 GraphQL 응답(fixture)으로 공모전 질의 조건과 EntryDraft 변환을 검사한다.
 * fixture는 2026-11-19에 이 Handler의 질의 그대로 받은 응답에서 NORMAL 2개, ASAP 1개, ALWAYS 1개를 골랐다.
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { linkareerContestHandler } from './linkareer-contest-handler.ts';

const RESPONSE = JSON.parse(readFileSync(new URL('./fixtures/linkareer-contests.json', import.meta.url), 'utf8')) as {
  data: { activities: { nodes: Record<string, unknown>[] } };
};

/** 변환에 쓰는 필드. 질의에서 하나라도 빠지면 운영에서 그 값이 조용히 비므로 질의 문자열을 직접 확인한다. */
const REQUIRED_FIELDS = ['id', 'title', 'organizationName', 'recruitType', 'recruitStartAt', 'recruitCloseAt', 'createdAt', 'awards', 'categories { name }'];

type RequestBody = { query: string; variables: { filterBy: unknown; orderBy: unknown; pagination: unknown } };

/** 응답 노드를 돌려주고 요청 본문을 기록하는 가짜 HTTP 클라이언트. */
function makeHttpClient(nodes: Record<string, unknown>[]) {
  const requests: { url: string; body: RequestBody }[] = [];
  const httpClient = (async (url: string, options: { body: RequestBody }) => {
    requests.push({ url, body: options.body });
    return { data: { activities: { nodes } } };
  }) as unknown as HttpClient;
  return { httpClient, requests };
}

it('진행 중인 공모전 최신 100개를 필요한 필드와 함께 질의한다', async () => {
  const { httpClient, requests } = makeHttpClient(RESPONSE.data.activities.nodes);

  await linkareerContestHandler.fetchEntries({}, { httpClient });

  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toBe('https://api.linkareer.com/graphql');
  expect(requests[0]?.body.variables).toEqual({
    filterBy: { activityTypeID: '3', status: 'OPEN' },
    orderBy: { direction: 'DESC', field: 'RECENT' },
    pagination: { page: 1, pageSize: 100 },
  });
  const selection = requests[0]?.body.query.replace(/\s+/g, ' ') ?? '';
  for (const field of REQUIRED_FIELDS) expect(selection).toContain(` ${field} `);
});

it('공모전을 EntryDraft로 바꾼다', async () => {
  const { httpClient } = makeHttpClient(RESPONSE.data.activities.nodes);

  const drafts = await linkareerContestHandler.fetchEntries({}, { httpClient });

  expect(drafts.map((draft) => draft.externalId)).toEqual(['365788', '365787', '364948', '352396']);
  expect(drafts[0]).toMatchObject({
    url: 'https://linkareer.com/activity/365788',
    title: '제30회 보령머드축제 공식 포스터 디자인 공모전',
    author: '보령축제관광재단',
    publishedAt: new Date(1795076234000),
    extra: { deadline: '2026-12-18', alwaysOpen: undefined, startDate: '2026-11-18', prize: '450만 원', tags: ['사진/영상/UCC', '디자인/순수미술/공예'] },
  });
  // 시상 규모 0은 비운다.
  expect(drafts[1]?.extra).toMatchObject({ deadline: '2026-12-04', prize: undefined });
  // ASAP·ALWAYS도 마감 시각을 주지만 링커리어 화면은 "모집 시 마감"·"상시모집"으로 적고 날짜를 보이지 않는다(2026-11-19 상세 페이지 확인).
  expect(drafts[2]?.extra).toMatchObject({ deadline: undefined, alwaysOpen: true, tags: ['기타'] });
  expect(drafts[3]?.extra).toMatchObject({ deadline: undefined, alwaysOpen: true });
});

it('마감일은 한국 날짜로, 빈 값은 비워 두고, id나 제목이 없는 항목은 버린다', async () => {
  const { httpClient } = makeHttpClient([
    // 한국 시각 2026-12-01 08:30 마감(UTC로는 전날 23:30). UTC 날짜로 자르면 11-30이 된다.
    { id: '1', title: '아침 마감', organizationName: '', recruitType: 'NORMAL', recruitStartAt: null, recruitCloseAt: Date.parse('2026-11-30T23:30:00Z'), createdAt: null, awards: null },
    { id: '2', title: '', organizationName: '무관', recruitType: 'NORMAL' },
    { id: '', title: 'id 없음', organizationName: '무관', recruitType: 'NORMAL' },
  ]);

  const drafts = await linkareerContestHandler.fetchEntries({}, { httpClient });

  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    externalId: '1',
    author: undefined,
    publishedAt: undefined,
    extra: { deadline: '2026-12-01', alwaysOpen: undefined, startDate: undefined, prize: undefined, tags: [] },
  });
});
