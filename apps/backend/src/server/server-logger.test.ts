import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { SERVER_LOGGER_OPTIONS } from './server-logger.ts';

describe('SERVER_LOGGER_OPTIONS', () => {
  it('요청 로그의 level을 숫자가 아니라 이름으로 쓴다', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(...String(chunk).trim().split('\n'));
        callback();
      },
    });
    const server = Fastify({ logger: { ...SERVER_LOGGER_OPTIONS, stream } });
    server.get('/ping', async () => ({ ok: true }));

    await server.inject({ method: 'GET', url: '/ping' });
    await server.close();

    const levels = lines.map((line) => JSON.parse(line).level);
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every((level) => level === 'info')).toBe(true);
  });
});
