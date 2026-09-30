import { expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { linkareerHandler } from './linkareer-handler.ts';

it('백엔드 신입 공고를 EntryDraft로 바꾼다', async () => {
  let requestedBody: { variables: { filterBy: unknown } } | undefined;
  const httpClient = (async (_url: string, options: { body: typeof requestedBody }) => {
    requestedBody = options.body;
    return {
      data: {
        activities: {
          nodes: [
            { id: '353842', title: '[회사] 백엔드 개발자', organizationName: '회사', jobTypes: ['NEW', 'EXPERIENCED'], recruitType: 'NORMAL', recruitCloseAt: 1791817199999, regions: [{ name: '서울' }, { name: '경기' }], categories: [{ id: '103002' }, { id: '110000' }] },
            { id: '353844', title: '서버 개발자', organizationName: '다른 회사', jobTypes: ['NEW'], recruitType: 'ASAP', recruitCloseAt: 1798556399999, regions: [], categories: [{ id: '103002' }] },
            // 모든 직무를 받는다고 표시한 공고. 백엔드 직무를 달지 않았으므로 버린다.
            { id: '353850', title: '캠페인 안내 스탭 모집', organizationName: '무관', jobTypes: ['NEW'], recruitType: 'ASAP', regions: [], categories: [{ id: '103000' }, { id: '104000' }] },
          ],
        },
      },
    };
  }) as unknown as HttpClient;

  const drafts = await linkareerHandler.fetchEntries({}, { httpClient });

  expect(drafts.map((draft) => draft.externalId)).toEqual(['353842', '353844']);
  expect(requestedBody?.variables.filterBy).toMatchObject({ activityTypeID: '5', categoryIDs: ['103002'], jobTypes: ['NEW'] });
  expect(drafts[0]).toMatchObject({
    url: 'https://linkareer.com/activity/353842',
    externalId: '353842',
    author: '회사',
    extra: { location: '서울, 경기', career: '신입·경력', deadline: '2026-10-12' },
  });
  // 마감일이 없는(채용 시 마감) 공고는 상시로 본다.
  expect(drafts[1]?.extra).toMatchObject({ alwaysOpen: true, deadline: undefined });
});
