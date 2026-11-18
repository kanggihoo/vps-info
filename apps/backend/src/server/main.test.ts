/** 서버 진입점의 종료 처리를 검사한다. 포트와 DB는 열지 않고 `buildServer`와 connection pool 경계만 대체한다. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  server: {
    close: vi.fn<() => Promise<void>>(),
    listen: vi.fn<(options: { host: string; port: number }) => Promise<string>>(),
    log: { error: vi.fn() },
  },
  buildServer: vi.fn(),
  connectionPoolEnd: vi.fn<() => Promise<void>>(),
}));

vi.mock('./build-server.ts', () => ({ buildServer: mocks.buildServer }));
vi.mock('../db/database-client.ts', () => ({ connectionPool: { end: mocks.connectionPoolEnd } }));

type SignalHandler = () => void;
const registeredHandlers = new Map<string | symbol, SignalHandler>();

/** `main.ts`를 새로 불러오고, 등록한 종료 신호 handler를 `registeredHandlers`에 모은다. */
async function startMain(): Promise<void> {
  vi.spyOn(process, 'once').mockImplementation(((event: string | symbol, handler: SignalHandler) => {
    registeredHandlers.set(event, handler);
    return process;
  }) as unknown as typeof process.once);
  await import('./main.ts');
}

beforeEach(() => {
  vi.resetModules();
  registeredHandlers.clear();
  mocks.buildServer.mockReset().mockResolvedValue(mocks.server);
  mocks.server.close.mockReset().mockResolvedValue(undefined);
  mocks.server.listen.mockReset().mockResolvedValue('http://0.0.0.0:8000');
  mocks.server.log.error.mockReset();
  mocks.connectionPoolEnd.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  // 실패 경로 테스트가 남긴 종료 코드가 Vitest 프로세스의 종료 코드가 되지 않게 한다.
  process.exitCode = undefined;
});

describe('서버 진입점', () => {
  it('로거를 켠 서버를 0.0.0.0:8000에서 열고 SIGTERM·SIGINT 종료 처리를 등록한다', async () => {
    await startMain();

    expect(mocks.buildServer).toHaveBeenCalledWith({ logger: true });
    expect(mocks.server.listen).toHaveBeenCalledWith({ host: '0.0.0.0', port: 8000 });
    expect([...registeredHandlers.keys()].map(String).sort((left, right) => left.localeCompare(right))).toEqual(['SIGINT', 'SIGTERM']);
  });

  it.each(['SIGTERM', 'SIGINT'])('%s를 받으면 서버가 닫힌 뒤에 connection pool을 닫는다', async (signal) => {
    let finishClose: () => void = () => {};
    mocks.server.close.mockReturnValue(new Promise<void>((resolve) => { finishClose = resolve; }));
    await startMain();

    registeredHandlers.get(signal)?.();
    expect(mocks.server.close).toHaveBeenCalledTimes(1);
    expect(mocks.connectionPoolEnd).not.toHaveBeenCalled();

    finishClose();
    await vi.waitFor(() => expect(mocks.connectionPoolEnd).toHaveBeenCalledTimes(1));
    expect(mocks.server.log.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('서버를 닫지 못하면 오류를 기록하고 종료 코드를 1로 두며 pool은 건드리지 않는다', async () => {
    const closeError = new Error('close failed');
    mocks.server.close.mockRejectedValue(closeError);
    await startMain();

    registeredHandlers.get('SIGTERM')?.();

    await vi.waitFor(() => expect(mocks.server.log.error).toHaveBeenCalledWith({ err: closeError }, '서버 종료에 실패했습니다.'));
    expect(process.exitCode).toBe(1);
    expect(mocks.connectionPoolEnd).not.toHaveBeenCalled();
  });

  it('connection pool을 닫지 못해도 오류를 기록하고 종료 코드를 1로 둔다', async () => {
    const poolError = new Error('pool end failed');
    mocks.connectionPoolEnd.mockRejectedValue(poolError);
    await startMain();

    registeredHandlers.get('SIGINT')?.();

    await vi.waitFor(() => expect(mocks.server.log.error).toHaveBeenCalledWith({ err: poolError }, '서버 종료에 실패했습니다.'));
    expect(process.exitCode).toBe(1);
  });
});
