/**
 * 서버 진입점. `/api/*`에 API로 응답하고, 나머지 경로에는 화면 빌드 결과(`web/dist`)를 내려준다.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { connectionPool, database } from '../db/database-client.ts';
import { registerEntryRoutes } from './entry-routes.ts';
import { registerFeedRoutes } from './feed-routes.ts';

/** 화면 빌드 결과 위치. 운영 이미지에는 Dockerfile이 넣어 두고, 로컬에서는 Vite 개발 서버를 쓰므로 없을 수 있다. */
const WEB_BUILD_DIRECTORY = resolve(import.meta.dirname, '../../web/dist');

const server = Fastify({ logger: true });

/** 컨테이너 상태 확인용. DB까지 닿는지 함께 본다. */
server.get('/api/health', async () => {
  await database.execute(sql`select 1`);
  return { status: 'ok' };
});

await server.register(registerFeedRoutes);
await server.register(registerEntryRoutes);

if (existsSync(WEB_BUILD_DIRECTORY)) {
  await server.register(fastifyStatic, { root: WEB_BUILD_DIRECTORY });
  // 화면은 SPA라서 API가 아닌 모르는 경로에는 index.html을 준다.
  server.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({ message: '없는 경로입니다' });
  });
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    await server.close();
    await connectionPool.end();
  });
}

await server.listen({ host: '0.0.0.0', port: 8000 });
