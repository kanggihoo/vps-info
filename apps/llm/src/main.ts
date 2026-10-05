/**
 * Entry 대화 서비스 진입점(ADR-0015). `app` 서버만 부르는 내부 HTTP 서버다.
 *
 * - `GET /health`: 컨테이너 상태 확인
 * - `GET /models`: 엔진별 사용 가능 여부와 모델 목록(`LlmModelsView`)
 * - `POST /turns`: 대화 한 턴(`LlmTurnRequest` → `EntryConversationTurnView`)
 *
 * 이 컨테이너는 DB 네트워크에 붙지 않고 LLM 인증 정보 말고는 비밀값이 없다.
 * 모델은 pi-ai로 HTTP 호출하고 도구를 넘기지 않는다(ADR-0018).
 * 엔드포인트가 둘뿐이라 Fastify 없이 `node:http`로 둔다.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ApiErrorBody, LlmTurnRequest } from '@trendboda/api-types';
import { runConversationTurn } from './conversation-turn.ts';
import { LlmFailure } from './llm-failure.ts';
import { createLlmModels, listEngines } from './llm-models.ts';

const PORT = 8100;
/** 요청 본문 상한. 원문 본문은 프롬프트에 넣을 때 다시 자른다. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** pi-ai CLI(`pi-ai login openai`)가 쓰는 인증 파일. 운영에서는 볼륨에 둔다. */
const models = createLlmModels(process.env.LLM_AUTH_FILE ?? 'auth.json');

/** 실패 이유별 HTTP 상태. `app` 서버가 화면에 그대로 전달한다. */
const FAILURE_STATUS: Record<LlmFailure['reason'], number> = {
  'llm-disabled': 503,
  'llm-unreachable': 503,
  'llm-unavailable': 503,
  'conversation-expired': 410,
  'llm-timeout': 504,
  'llm-failed': 502,
};

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new LlmFailure('llm-failed', '요청 본문이 너무 큽니다');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** 요청 본문이 `LlmTurnRequest` 모양인지 본다. 보내는 쪽은 같은 저장소의 `app` 서버뿐이라 필드 모양만 확인한다. */
function isTurnRequest(body: unknown): body is LlmTurnRequest {
  const candidate = body as Partial<LlmTurnRequest> | null;
  return (
    typeof candidate?.question === 'string' &&
    candidate.question.trim() !== '' &&
    (candidate.sessionId === null || typeof candidate.sessionId === 'string') &&
    (candidate.engine === 'anthropic' || candidate.engine === 'openai' || candidate.engine === 'openrouter') &&
    typeof candidate.model === 'string'
  );
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && request.url === '/models') return sendJson(response, 200, await listEngines(models));
  if (request.method !== 'POST' || request.url !== '/turns') return sendJson(response, 404, { message: '없는 경로입니다' } satisfies ApiErrorBody);

  const body = await readJsonBody(request);
  if (!isTurnRequest(body)) return sendJson(response, 400, { message: '요청 본문이 올바르지 않습니다' } satisfies ApiErrorBody);
  sendJson(response, 200, await runConversationTurn(body, models));
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error: unknown) => {
    const failure = error instanceof LlmFailure ? error : new LlmFailure('llm-failed', String(error).slice(0, 500));
    if (!(error instanceof LlmFailure)) console.error('[llm] 처리하지 못한 오류', error);
    if (!response.headersSent) sendJson(response, FAILURE_STATUS[failure.reason], { message: failure.message, reason: failure.reason } satisfies ApiErrorBody);
  });
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close());

server.listen(PORT, '0.0.0.0', async () => {
  const { engines } = await listEngines(models);
  console.log(`[llm] ${PORT}에서 대기합니다. ${engines.map((engine) => `${engine.title} ${engine.available ? '켜짐' : '꺼짐'}`).join(', ')}`);
});
