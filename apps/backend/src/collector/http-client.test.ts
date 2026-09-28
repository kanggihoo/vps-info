import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { httpClient } from './http-client.ts';

/** 경로가 곧 응답 상태 코드인 로컬 서버. 요청 횟수를 센다. */
let server: Server;
let baseUrl: string;
let requestCount = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    requestCount += 1;
    response.statusCode = Number(request.url?.slice(1));
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  requestCount = 0;
});

describe('httpClient 재시도 정책 (ADR-0006)', () => {
  it('404는 다시 보내도 결과가 같으므로 재시도하지 않는다', async () => {
    await expect(httpClient(`${baseUrl}/404`)).rejects.toThrow();
    expect(requestCount).toBe(1);
  });

  it('503은 두 번 더 보낸다(총 3회)', async () => {
    await expect(httpClient(`${baseUrl}/503`)).rejects.toThrow();
    expect(requestCount).toBe(3);
  }, 10_000);

  it('POST도 재시도한다', async () => {
    await expect(httpClient(`${baseUrl}/429`, { method: 'POST', body: {} })).rejects.toThrow();
    expect(requestCount).toBe(3);
  }, 10_000);
});
