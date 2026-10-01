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
import { type LlmRequester, makeLlmRequester, registerConversationRoutes } from './conversation-routes.ts';
import { createDeepLTranslator, type TextTranslator } from './deepl-translator.ts';
import { registerEntryRoutes } from './entry-routes.ts';
import { registerFeedRoutes } from './feed-routes.ts';
import { fetchOriginalPage, type OriginalPageFetcher } from './original-page.ts';

/** 화면 빌드 결과(`apps/web/dist`) 위치. 운영 이미지에는 Dockerfile이 같은 경로에 넣어 두고, 로컬에서는 Vite 개발 서버를 쓰므로 없을 수 있다. */
const WEB_BUILD_DIRECTORY = resolve(import.meta.dirname, '../../../web/dist');

/** 서버를 만들 때의 설정. 원문 가져오기와 번역은 바깥 세계와 닿는 곳이라 테스트에서 가짜로 바꿔 넣는다. */
export type BuildServerOptions = {
  /** 요청 로그 출력 여부. 테스트에서는 끈다. */
  logger: boolean;
  /** 생략하면 실제 원문 페이지를 가져온다. */
  fetchOriginalPage?: OriginalPageFetcher;
  /** 생략하면 `DEEPL_API_KEY`로 DeepL 번역 함수를 만든다. `null`이면 번역을 끈다. */
  translateTexts?: TextTranslator | null;
  /** 생략하면 `LLM_URL`의 `llm` 서비스로 보낸다(ADR-0015). `null`이면 Entry 대화를 끈다. */
  requestLlm?: LlmRequester | null;
};

/** `DEEPL_API_KEY`가 있으면 DeepL 번역 함수를, 없으면 `undefined`를 돌려준다. 키가 없는 환경(로컬 개발)에서는 번역만 빠진다. */
function makeDefaultTranslator(): TextTranslator | undefined {
  const apiKey = process.env.DEEPL_API_KEY?.trim();
  return apiKey ? createDeepLTranslator(apiKey) : undefined;
}

/** 서버를 만든다. */
export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const server = Fastify({ logger: options.logger });

  /** 컨테이너 상태 확인용. DB까지 닿는지 함께 본다. */
  server.get('/api/health', async () => {
    await database.execute(sql`select 1`);
    return { status: 'ok' };
  });

  await server.register(registerFeedRoutes);
  await server.register(registerEntryRoutes, {
    fetchOriginalPage: options.fetchOriginalPage ?? fetchOriginalPage,
    translateTexts: options.translateTexts === undefined ? makeDefaultTranslator() : (options.translateTexts ?? undefined),
  });

  await server.register(registerConversationRoutes, {
    requestLlm: options.requestLlm === undefined ? makeLlmRequester(process.env.LLM_URL?.trim()) : (options.requestLlm ?? undefined),
  });

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
