/** 개인용 Feed Navigation Order의 조회·교체. 정의는 코드, 배치는 DB가 소유한다(ADR-0016). */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { FeedNavigationItem, FeedNavigationOrder } from '@trendboda/api-types';
import { database } from '../db/database-client.ts';
import { feed, feedNavigationOrder } from '../db/schema.ts';
import { feedDefinitions, feedGroupDefinitions } from '../feed-definitions.ts';

/** DB에 등록되고 코드에 선언된 Feed에서 화면의 줄 목록을 만든다. */
async function loadDeclaredOrder(): Promise<FeedNavigationOrder> {
  const rows = await database.select({ id: feed.id }).from(feed);
  const registeredIds = new Set(rows.map((row) => row.id));
  const groupIds = new Set(feedGroupDefinitions.map((group) => group.id));
  const order: FeedNavigationOrder = { stream: [], ranked: [] };
  for (const definition of feedDefinitions) {
    if (!registeredIds.has(definition.id)) continue;
    const item: FeedNavigationItem = definition.group && groupIds.has(definition.group.id)
      ? { kind: 'group', id: definition.group.id }
      : { kind: 'feed', id: definition.id };
    const section = order[definition.kind ?? 'stream'];
    if (!section.some((candidate) => candidate.kind === item.kind && candidate.id === item.id)) section.push(item);
  }
  return order;
}

function itemKey(item: FeedNavigationItem): string {
  return `${item.kind}:${item.id}`;
}

/** 저장 순서에서 사라진 줄을 빼고, 새 줄을 선언 순서로 끝에 붙인다. */
function reconcileItems(saved: FeedNavigationItem[], declared: FeedNavigationItem[]): FeedNavigationItem[] {
  const remaining = new Map(declared.map((item) => [itemKey(item), item]));
  const result: FeedNavigationItem[] = [];
  for (const item of saved) {
    const key = itemKey(item);
    const current = remaining.get(key);
    if (current) { result.push(current); remaining.delete(key); }
  }
  return [...result, ...remaining.values()];
}

/** 순서의 조회·수정 API를 등록한다. */
export async function registerFeedNavigationRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/feed-navigation-order', async (): Promise<FeedNavigationOrder> => {
    const declared = await loadDeclaredOrder();
    const [saved] = await database.select({ stream: feedNavigationOrder.streamOrder, ranked: feedNavigationOrder.rankedOrder })
      .from(feedNavigationOrder).where(eq(feedNavigationOrder.id, 1));
    return saved ? { stream: reconcileItems(saved.stream, declared.stream), ranked: reconcileItems(saved.ranked, declared.ranked) } : declared;
  });

  const itemsSchema = {
    type: 'array', maxItems: 10000,
    items: { type: 'object', additionalProperties: false, required: ['kind', 'id'], properties: {
      kind: { type: 'string', enum: ['feed', 'group'] }, id: { type: 'string', minLength: 1, maxLength: 256 },
    } },
  } as const;
  server.put<{ Body: FeedNavigationOrder }>('/api/feed-navigation-order', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['stream', 'ranked'], properties: { stream: itemsSchema, ranked: itemsSchema } } },
  }, async (request, reply): Promise<FeedNavigationOrder> => {
    const declared = await loadDeclaredOrder();
    for (const kind of ['stream', 'ranked'] as const) {
      const expected = new Set(declared[kind].map(itemKey));
      const received = request.body[kind].map(itemKey);
      if (received.length !== expected.size || new Set(received).size !== received.length || received.some((key) => !expected.has(key))) {
        return reply.code(409).send({ message: 'Feed 목록이 바뀌었거나 순서가 유효하지 않습니다. 목록을 다시 불러오세요.' });
      }
    }
    const values = { id: 1, streamOrder: request.body.stream, rankedOrder: request.body.ranked, updatedAt: new Date() };
    await database.insert(feedNavigationOrder).values(values).onConflictDoUpdate({ target: feedNavigationOrder.id, set: values });
    return request.body;
  });
}
