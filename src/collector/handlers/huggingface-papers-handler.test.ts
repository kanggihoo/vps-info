import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { huggingfacePapersHandler, makePreviousPeriodKey } from './huggingface-papers-handler.ts';

describe('makePreviousPeriodKey', () => {
  it('지난 ISO 주를 만든다', () => {
    expect(makePreviousPeriodKey('week', new Date('2026-09-28T01:00:00Z'))).toBe('2026-W39'); // 월요일 → 지난주
    expect(makePreviousPeriodKey('week', new Date('2026-09-27T23:00:00Z'))).toBe('2026-W38'); // 일요일은 아직 W39 안이다
    expect(makePreviousPeriodKey('week', new Date('2026-01-05T00:00:00Z'))).toBe('2026-W01'); // 2026-W01은 2025-12-29에 시작한다
    expect(makePreviousPeriodKey('week', new Date('2027-01-04T00:00:00Z'))).toBe('2026-W53');
  });

  it('지난달을 만든다', () => {
    expect(makePreviousPeriodKey('month', new Date('2026-09-28T00:00:00Z'))).toBe('2026-08');
    expect(makePreviousPeriodKey('month', new Date('2026-01-10T00:00:00Z'))).toBe('2025-12');
  });
});

describe('huggingfacePapersHandler', () => {
  it('지난 기간의 논문을 추천수와 함께 EntryDraft로 바꾼다', async () => {
    let requestedQuery: unknown;
    const httpClient = (async (_url: string, options: { query: unknown }) => {
      requestedQuery = options.query;
      return [{ paper: { id: '2609.1', title: '논문', summary: '요약\n  줄바꿈', upvotes: 42, authors: [{ name: 'A' }, { name: 'B' }] }, numComments: 3 }];
    }) as unknown as HttpClient;

    const drafts = await huggingfacePapersHandler.fetchEntries({ period: 'month' }, { httpClient });

    expect(requestedQuery).toMatchObject({ month: makePreviousPeriodKey('month', new Date()), limit: 30 });
    expect(drafts[0]).toMatchObject({
      url: 'https://huggingface.co/papers/2609.1',
      externalId: '2609.1',
      author: 'A, B',
      summary: '요약 줄바꿈',
      extra: { score: 42, commentCount: 3, arxivUrl: 'https://arxiv.org/abs/2609.1' },
    });
  });
});
