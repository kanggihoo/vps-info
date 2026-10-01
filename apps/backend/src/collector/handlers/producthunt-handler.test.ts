import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { periodStart, producthuntHandler } from './producthunt-handler.ts';

beforeEach(() => {
  vi.stubEnv('PRODUCT_HUNT_CLIENT_ID', 'id');
  vi.stubEnv('PRODUCT_HUNT_CLIENT_SECRET', 'secret');
});
afterEach(() => vi.unstubAllEnvs());

it('토큰을 받아 추천수 순 제품을 EntryDraft로 바꾼다', async () => {
  const calls: { url: string; options: any }[] = [];
  const httpClient = (async (url: string, options: any) => {
    calls.push({ url, options });
    if (url.endsWith('/oauth/token')) return { access_token: 'tok' };
    return {
      data: {
        posts: {
          pageInfo: { endCursor: 'c1', hasNextPage: false },
          edges: [
            { node: { id: '1', name: 'Foo', tagline: '멋진 도구', url: 'https://www.producthunt.com/posts/foo?utm_source=x', createdAt: '2026-09-30T08:00:00Z', votesCount: 500, commentsCount: 20 } },
          ],
        },
      },
    };
  }) as unknown as HttpClient;

  const drafts = await producthuntHandler.fetchEntries({ period: 'weekly' }, { httpClient, rankLimit: 10 });

  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    url: 'https://www.producthunt.com/posts/foo',
    title: 'Foo',
    externalId: '1',
    summary: '멋진 도구',
    metrics: { score: 500, commentCount: 20 },
  });
  expect(calls[1].options.headers.Authorization).toBe('Bearer tok');
  expect(drafts[0].raw).toMatchObject({ id: '1' });
});

it('환경변수가 없으면 실패한다', async () => {
  vi.stubEnv('PRODUCT_HUNT_CLIENT_SECRET', '');
  await expect(producthuntHandler.fetchEntries({ period: 'weekly' }, { httpClient: (async () => ({})) as unknown as HttpClient })).rejects.toThrow('환경변수');
});

it('기간 시작 시각은 태평양 시간 0시 기준 이번 주(월)·달·해의 첫날이다', () => {
  const now = new Date('2026-10-01T13:00:00Z'); // 목요일
  expect(periodStart('weekly', now).toISOString()).toBe('2026-09-28T07:00:00.000Z');
  expect(periodStart('monthly', now).toISOString()).toBe('2026-10-01T07:00:00.000Z');
  expect(periodStart('yearly', now).toISOString()).toBe('2026-01-01T07:00:00.000Z');
  // 10월 1일 UTC 03시는 아직 태평양 시간 9월 30일이다.
  expect(periodStart('monthly', new Date('2026-10-01T03:00:00Z')).toISOString()).toBe('2026-09-01T07:00:00.000Z');
});

it('한 페이지로 모자라면 커서로 다음 페이지를 받아 rankLimit까지 자른다', async () => {
  const node = (id: string) => ({ node: { id, name: id, url: `https://www.producthunt.com/products/${id}` } });
  const variables: any[] = [];
  const httpClient = (async (url: string, options: any) => {
    if (url.endsWith('/oauth/token')) return { access_token: 'tok' };
    variables.push(options.body.variables);
    const first = variables.length === 1;
    return {
      data: { posts: { pageInfo: { endCursor: first ? 'c1' : 'c2', hasNextPage: true }, edges: first ? [node('a'), node('b')] : [node('c'), node('d')] } },
    };
  }) as unknown as HttpClient;

  const drafts = await producthuntHandler.fetchEntries({ period: 'monthly' }, { httpClient, rankLimit: 3 });

  expect(drafts.map((draft) => draft.title)).toEqual(['a', 'b', 'c']);
  expect(variables.map((v) => v.after)).toEqual([undefined, 'c1']);
});
