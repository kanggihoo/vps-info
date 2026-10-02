/** 실제 DB와 API를 거쳐 기기 간 순서 유지, Group 경계, 잘못된 저장의 원자성을 확인한다. */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { FeedNavigationOrder } from '@trendboda/api-types';
import { connectionPool, database } from '../db/database-client.ts';
import { feed, feedNavigationOrder } from '../db/schema.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { buildServer } from './build-server.ts';

let server: FastifyInstance;
beforeAll(async () => { server = await buildServer({ logger: false }); });
beforeEach(async () => {
  await resetDatabase();
  await database.insert(feed).values([
    { id: 'geeknews', intervalMinutes: 60 },
    { id: 'producthunt', intervalMinutes: 60 },
    { id: 'hn-best', intervalMinutes: 360, rankLimit: 100 },
    { id: 'hn-show', intervalMinutes: 360, rankLimit: 100 },
  ]);
});
afterAll(async () => { await server.close(); await connectionPool.end(); });
const read = async () => (await server.inject('/api/feed-navigation-order')).json<FeedNavigationOrder>();
const save = (order: FeedNavigationOrder) => server.inject({ method: 'PUT', url: '/api/feed-navigation-order', payload: order });

it('같은 Group은 한 줄이며 저장값이 없으면 코드 순서로 반환한다', async () => {
  expect(await read()).toEqual({
    stream: [{ kind: 'feed', id: 'geeknews' }, { kind: 'feed', id: 'producthunt' }],
    ranked: [{ kind: 'group', id: 'hacker-news' }],
  });
});

it('저장 후 새 서버에서도 같은 순서를 읽고, 새 항목은 해당 구역 끝에 추가한다', async () => {
  const order = await read();
  order.stream.reverse();
  expect((await save(order)).statusCode).toBe(200);
  const secondServer = await buildServer({ logger: false });
  try {
    expect((await secondServer.inject('/api/feed-navigation-order')).json()).toEqual(order);
  } finally { await secondServer.close(); }
  await database.insert(feed).values({ id: 'wanted-backend', intervalMinutes: 60 });
  expect((await read()).stream).toEqual([...order.stream, { kind: 'group', id: 'wanted' }]);
});

it('중복·누락·구역 이동·Group 내부 Feed 저장을 거부하고 기존 순서를 보존한다', async () => {
  const original = await read();
  expect((await save(original)).statusCode).toBe(200);
  for (const invalid of [
    { ...original, stream: [original.stream[0], original.stream[0]] },
    { ...original, stream: [] },
    { stream: [...original.stream, ...original.ranked], ranked: [] },
    { ...original, ranked: [{ kind: 'feed' as const, id: 'hn-best' }] },
  ]) {
    expect((await save(invalid)).statusCode).toBe(409);
    expect(await read()).toEqual(original);
  }
});

it('오래된 저장값에서 사라진 항목과 중복을 제거한다', async () => {
  const original = await read();
  await database.insert(feedNavigationOrder).values({
    streamOrder: [{ kind: 'feed', id: 'removed-feed' }, original.stream[1], original.stream[1]],
    rankedOrder: original.ranked,
  });
  expect((await read()).stream).toEqual([original.stream[1], original.stream[0]]);
});

it('잘못된 본문은 저장하지 않는다', async () => {
  expect((await server.inject({ method: 'PUT', url: '/api/feed-navigation-order', payload: { stream: [{ kind: 'other', id: 'x' }], ranked: [] } })).statusCode).toBe(400);
  expect(await read()).toEqual({ stream: [{ kind: 'feed', id: 'geeknews' }, { kind: 'feed', id: 'producthunt' }], ranked: [{ kind: 'group', id: 'hacker-news' }] });
});
