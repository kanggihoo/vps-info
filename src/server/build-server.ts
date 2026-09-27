/**
 * Fastify 서버를 조립한다. 라우트를 등록하고 화면 빌드 결과가 있으면 함께 서빙한다.
 * `listen`은 하지 않으므로 테스트에서 `server.inject`로 바로 요청을 보낼 수 있다.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { database } from '../db/database-client.ts';
import { registerEntryRoutes } from './entry-routes.ts';
import { registerFeedRoutes } from './feed-routes.ts';

/** 화면 빌드 결과 위치. 운영 이미지에는 Dockerfile이 넣어 두고, 로컬에서는 Vite 개발 서버를 쓰므로 없을 수 있다. */
const WEB_BUILD_DIRECTORY = resolve(import.meta.dirname, '../../web/dist');

/**
 * 서버를 만든다.
 *
 * @param options.logger - 요청 로그 출력 여부. 테스트에서는 끈다.
 */
export async function buildServer(options: { logger: boolean }): Promise<FastifyInstance> {
  const server = Fastify({ logger: options.logger });

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
  return server;
}
