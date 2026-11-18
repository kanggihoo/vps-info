/** llm 서비스 진입점의 시작 순서와 시작 로그를 검사한다. 포트는 열지 않고 `node:http`와 엔진 조회 경계만 대체한다. */
import type { LlmModelsView } from '@trendboda/api-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  server: {
    listen: vi.fn<(port: number, host: string, onListening: () => void) => void>(),
    close: vi.fn(),
  },
  createServer: vi.fn(),
  createLlmModels: vi.fn(),
  listEngines: vi.fn<() => Promise<LlmModelsView>>(),
}));

vi.mock('node:http', () => ({ createServer: mocks.createServer }));
vi.mock('./llm-models.ts', () => ({ createLlmModels: mocks.createLlmModels, listEngines: mocks.listEngines }));
vi.mock('./conversation-turn.ts', () => ({ runConversationTurn: vi.fn() }));

const engines: LlmModelsView = {
  engines: [
    { engine: 'anthropic', title: 'Claude', available: true, models: [{ value: 'claude-sonnet-5-5', title: 'Sonnet 5.5' }] },
    { engine: 'openai', title: 'GPT', available: false, models: [{ value: 'gpt-secret-model', title: 'Hidden' }] },
  ],
};

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(process, 'once').mockImplementation(() => process);
  mocks.createServer.mockReset().mockReturnValue(mocks.server);
  mocks.createLlmModels.mockReset().mockReturnValue({});
  mocks.listEngines.mockReset().mockResolvedValue(engines);
  mocks.server.close.mockReset();
  mocks.server.listen.mockReset().mockImplementation((_port, _host, onListening) => onListening());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('llm 서비스 진입점', () => {
  it('엔진 조회를 마친 뒤 0.0.0.0:8100에서 대기하고, 시작 로그를 한 줄 JSON으로 남긴다 (logging.md)', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('./main.ts');

    expect(mocks.server.listen).toHaveBeenCalledWith(8100, '0.0.0.0', expect.any(Function));
    expect(mocks.listEngines.mock.invocationCallOrder[0]).toBeLessThan(mocks.server.listen.mock.invocationCallOrder[0]);
    expect(consoleLog).toHaveBeenCalledTimes(1);
    const line = String(consoleLog.mock.calls[0][0]);
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      level: 'info',
      time: expect.any(Number),
      msg: '8100에서 대기합니다.',
      engines: [
        { title: 'Claude', available: true },
        { title: 'GPT', available: false },
      ],
    });
  });

  it('시작 로그에는 엔진의 title·available만 쓰고 모델 목록은 남기지 않는다', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('./main.ts');

    const line = String(consoleLog.mock.calls[0][0]);
    expect(line).not.toContain('gpt-secret-model');
    expect(line).not.toContain('claude-sonnet-5-5');
  });

  it('엔진 조회가 실패하면 포트를 열지 않고 시작 실패로 알린다', async () => {
    mocks.listEngines.mockRejectedValue(new Error('engine lookup failed'));

    await expect(import('./main.ts')).rejects.toThrow('engine lookup failed');
    expect(mocks.server.listen).not.toHaveBeenCalled();
  });

  it('SIGTERM·SIGINT를 받으면 서버를 닫도록 등록한다', async () => {
    const handlers = new Map<string | symbol, () => void>();
    vi.spyOn(process, 'once').mockImplementation(((event: string | symbol, handler: () => void) => {
      handlers.set(event, handler);
      return process;
    }) as unknown as typeof process.once);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('./main.ts');

    expect([...handlers.keys()].map(String).sort((left, right) => left.localeCompare(right))).toEqual(['SIGINT', 'SIGTERM']);
    handlers.get('SIGTERM')?.();
    expect(mocks.server.close).toHaveBeenCalledTimes(1);
  });
});
