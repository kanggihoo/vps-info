import { expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { jumpitHandler } from './jumpit-handler.ts';

it('서버/백엔드 신입 공고를 기술스택과 함께 EntryDraft로 바꾼다', async () => {
  let requestedQuery: unknown;
  const httpClient = (async (_url: string, options: { query: unknown }) => {
    requestedQuery = options.query;
    return {
      result: {
        positions: [
          { id: 55159154, title: '백엔드 개발자 (신입)', companyName: '회사', techStacks: ['Java', 'Spring'], locations: ['서울 영등포구'], minCareer: 0, maxCareer: 0, closedAt: '2026-10-29T23:59:59', alwaysOpen: false },
          { id: 2, title: '', companyName: '제목 없음', minCareer: 0 },
        ],
      },
    };
  }) as unknown as HttpClient;

  const drafts = await jumpitHandler.fetchEntries({}, { httpClient });

  expect(requestedQuery).toMatchObject({ jobCategory: 1, career: 0, sort: 'reg_dt' });
  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    url: 'https://jumpit.saramin.co.kr/position/55159154',
    title: '백엔드 개발자 (신입)',
    externalId: '55159154',
    author: '회사',
    extra: { location: '서울 영등포구', career: '신입', deadline: '2026-10-29', tags: ['Java', 'Spring'] },
  });
});
