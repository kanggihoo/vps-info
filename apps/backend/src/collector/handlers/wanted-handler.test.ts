import { expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { wantedHandler } from './wanted-handler.ts';

const JOB = { id: 387806, position: '백엔드 엔지니어', company: { name: '클래스101' }, annual_from: 0, annual_to: 100, employment_type: 'regular', category_tag: { id: 872 }, address: { location: '서울', district: '강남구' } };

it('직무와 경력, 고용 형태를 EntryDraft로 바꾼다', async () => {
  const requestedQueries: Record<string, unknown>[] = [];
  const httpClient = (async (_url: string, options: { query: Record<string, unknown> }) => {
    requestedQueries.push(options.query);
    return {
      data: [
        JOB,
        { id: 1, position: '[인턴] 주니어 개발자', company: { name: '회사' }, annual_from: 0, annual_to: 1, employment_type: 'intern', category_tag: { id: 10110 }, address: {} },
        { id: 2, position: '계약직 개발자', company: { name: '회사' }, annual_from: 0, annual_to: 3, employment_type: 'contract', category_tag: { id: 99999 } },
        { id: 3, position: '', company: { name: '제목 없음' }, annual_from: 0 },
      ],
      links: { next: null },
    };
  }) as unknown as HttpClient;

  const drafts = await wantedHandler.fetchEntries({ jobIds: [872, 10110] }, { httpClient });

  expect(requestedQueries).toHaveLength(1);
  expect(requestedQueries[0]).toMatchObject({ job_group_id: 518, job_ids: [872, 10110], years: 0, job_sort: 'job.latest_order', limit: 100, offset: 0 });
  expect(drafts).toHaveLength(3);
  expect(drafts[0]).toMatchObject({
    url: 'https://www.wanted.co.kr/wd/387806',
    title: '백엔드 엔지니어',
    externalId: '387806',
    author: '클래스101',
    extra: { location: '서울 강남구', career: '경력 무관', tags: ['서버 개발자'] },
  });
  expect(drafts[1]?.extra).toMatchObject({ career: '신입~1년', tags: ['소프트웨어 엔지니어', '인턴'] });
  // 모르는 직무 ID는 직무 태그 없이 고용 형태만 남는다.
  expect(drafts[2]?.extra).toMatchObject({ tags: ['계약직'] });
});

it('다음 페이지가 있으면 offset을 늘려 끝까지 받고, 겹친 공고는 한 번만 돌려준다', async () => {
  const offsets: unknown[] = [];
  const httpClient = (async (_url: string, options: { query: { offset: number } }) => {
    offsets.push(options.query.offset);
    return options.query.offset === 0
      ? { data: [JOB, { ...JOB, id: 2 }], links: { next: '/api/next' } }
      : { data: [{ ...JOB, id: 2 }, { ...JOB, id: 3 }], links: { next: null } };
  }) as unknown as HttpClient;

  const drafts = await wantedHandler.fetchEntries({ jobIds: [872] }, { httpClient });

  expect(offsets).toEqual([0, 100]);
  expect(drafts.map((draft) => draft.externalId)).toEqual(['387806', '2', '3']);
});
