/** 실제 링커리어 GraphQL 응답(fixture)으로 공모전 질의 조건과 EntryDraft 변환을 검사한다. */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { linkareerContestHandler } from './linkareer-contest-handler.ts';

const RESPONSE = JSON.parse(readFileSync(new URL('./fixtures/linkareer-contests.json', import.meta.url), 'utf8')) as {
  data: { activities: { nodes: Record<string, unknown>[] } };
};

it('진행 중인 공모전을 EntryDraft로 바꾼다', async () => {
  let requestedBody: { variables: { filterBy: unknown; orderBy: unknown } } | undefined;
  const nodes = [
    ...RESPONSE.data.activities.nodes,
    // 마감 시각이 없는 공모전은 상시로 본다. 제목이 없는 항목은 버린다.
    { id: '1', title: '상시 공모', organizationName: '', recruitCloseAt: null, awards: null },
    { id: '2', title: '', organizationName: '무관' },
  ];
  const httpClient = (async (_url: string, options: { body: typeof requestedBody }) => {
    requestedBody = options.body;
    return { data: { activities: { nodes } } };
  }) as unknown as HttpClient;

  const drafts = await linkareerContestHandler.fetchEntries({}, { httpClient });

  expect(requestedBody?.variables).toMatchObject({
    filterBy: { activityTypeID: '3', status: 'OPEN' },
    orderBy: { direction: 'DESC', field: 'RECENT' },
  });
  expect(drafts.map((draft) => draft.externalId)).toEqual(['365788', '365787', '364948', '1']);
  expect(drafts[0]).toMatchObject({
    url: 'https://linkareer.com/activity/365788',
    title: '제30회 보령머드축제 공식 포스터 디자인 공모전',
    author: '보령축제관광재단',
    publishedAt: new Date(1795076234000),
    extra: { deadline: '2026-12-18', startDate: '2026-11-18', prize: '450만 원', tags: ['사진/영상/UCC', '디자인/순수미술/공예'] },
  });
  // 시상 규모 0은 비운다. 조기 마감(ASAP)도 마감 시각이 있으면 마감일로 쓴다.
  expect(drafts[1]?.extra).toMatchObject({ prize: undefined });
  expect(drafts[2]?.extra).toMatchObject({ deadline: '2027-02-17', alwaysOpen: undefined, tags: ['기타'] });
  expect(drafts[3]).toMatchObject({ author: undefined, publishedAt: undefined, extra: { deadline: undefined, alwaysOpen: true, startDate: undefined, tags: [] } });
});
