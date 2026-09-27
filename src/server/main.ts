/** 서버 진입점. `/api/*`에 API로 응답하고, 나머지 경로에는 화면 빌드 결과(`web/dist`)를 내려준다. */
import { connectionPool } from '../db/database-client.ts';
import { buildServer } from './build-server.ts';

const server = await buildServer({ logger: true });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    await server.close();
    await connectionPool.end();
  });
}

await server.listen({ host: '0.0.0.0', port: 8000 });
