// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminFeed, AdminOverview, DeepLUsageView, LlmModelsView } from '@trendboda/api-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPanel } from './admin-panel.tsx';
import { apiClient } from './api-client.ts';

function makeAdminFeed(id: string, title: string, overrides: Partial<AdminFeed> = {}): AdminFeed {
  return {
    id,
    title,
    kind: 'stream',
    wanted: false,
    intervalMinutes: 60,
    nextRunAt: '2026-11-18T03:00:00.000Z',
    paused: false,
    manualRequestedAt: null,
    consecutiveFailures: 0,
    lastSuccessAt: '2026-11-18T02:00:00.000Z',
    latestAttempt: null,
    ...overrides,
  };
}

function makeOverview(feeds: AdminFeed[], runningFeedId: string | null = null): AdminOverview {
  return { feeds, collector: { status: 'alive', lastSeenAt: '2026-11-18T02:59:00.000Z', runningFeedId } };
}

const llmModels: LlmModelsView = { engines: [{ engine: 'anthropic', title: 'Claude', available: true, models: [{ value: 'claude-sonnet', title: 'Sonnet' }] }] };
const deepLUsage: DeepLUsageView = {
  characterCount: 1500,
  characterLimit: 500000,
  apiKeyCharacterCount: null,
  apiKeyCharacterLimit: null,
  periodStart: null,
  periodEnd: null,
  checkedAt: '2026-11-18T02:59:00.000Z',
};

/** 테스트가 직접 끝내는 요청. 응답이 도착하는 순서를 조절할 때 쓴다. */
function makeDeferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockIntegrations() {
  vi.spyOn(apiClient, 'listLlmModels').mockResolvedValue(llmModels);
  vi.spyOn(apiClient, 'getDeepLUsage').mockResolvedValue(deepLUsage);
}

const scrollTo = vi.fn();

beforeEach(() => {
  // jsdom에는 Element.scrollTo가 없다. 이력 영역으로 스크롤하는 동작이 호출되는지만 본다.
  scrollTo.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: scrollTo, configurable: true, writable: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AdminPanel 관리 상태', () => {
  it('받기 전에는 불러오는 중 표시를, 받으면 수집기 상태와 Feed 표를 보여 준다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(
      makeOverview([makeAdminFeed('hn-best', 'Hacker News Best'), makeAdminFeed('wanted-backend', '원티드 백엔드', { wanted: true })], 'hn-best'),
    );
    mockIntegrations();
    render(<AdminPanel />);

    expect(screen.getByLabelText('Feed 운영 상태 불러오는 중')).toBeTruthy();
    const operations = within(await screen.findByRole('region', { name: 'Feed 운영' }));
    expect(operations.getByText('Hacker News Best')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '원티드' })).getByText('원티드 백엔드')).toBeTruthy();
    const collector = within(screen.getByRole('region', { name: '수집기 상태' }));
    expect(collector.getByText('응답 중')).toBeTruthy();
    expect(collector.getByText('실행 중: Hacker News Best')).toBeTruthy();
    expect(screen.queryByLabelText('Feed 운영 상태 불러오는 중')).toBeNull();
  });

  it('조회에 실패하면 오류를 보이고, 다시 시도해서 성공하면 오류를 지우고 표를 보여 준다', async () => {
    const getAdminOverview = vi
      .spyOn(apiClient, 'getAdminOverview')
      .mockRejectedValueOnce(new Error('관리 API 오류'))
      .mockResolvedValueOnce(makeOverview([makeAdminFeed('hn-best', 'Hacker News Best')]));
    mockIntegrations();
    render(<AdminPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('관리 API 오류');

    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));

    await screen.findByRole('region', { name: 'Feed 운영' });
    expect(screen.queryByText('관리 API 오류')).toBeNull();
    expect(getAdminOverview).toHaveBeenCalledTimes(2);
  });

  it('Error가 아닌 값으로 실패하면 기본 오류 문구를 보여 준다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockRejectedValue('문자열 오류');
    mockIntegrations();
    render(<AdminPanel />);

    expect((await screen.findByRole('alert')).textContent).toContain('관리 상태를 불러오지 못했습니다.');
  });

  it('새로고침을 연달아 눌러도 먼저 보낸 요청의 늦은 응답이 최신 응답을 덮어쓰지 않는다', async () => {
    const firstRequest = makeDeferred<AdminOverview>();
    const secondRequest = makeDeferred<AdminOverview>();
    vi.spyOn(apiClient, 'getAdminOverview')
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    mockIntegrations();
    render(<AdminPanel />);

    await userEvent.click(screen.getByRole('button', { name: '수집 상태 새로고침' }));
    await act(async () => secondRequest.resolve(makeOverview([makeAdminFeed('new-feed', '새 응답 Feed')])));
    await act(async () => firstRequest.resolve(makeOverview([makeAdminFeed('old-feed', '오래된 응답 Feed')])));

    expect(screen.getByText('새 응답 Feed')).toBeTruthy();
    expect(screen.queryByText('오래된 응답 Feed')).toBeNull();
  });

  it('먼저 보낸 요청이 늦게 실패해도 최신 응답 위에 오류를 띄우지 않는다', async () => {
    const firstRequest = makeDeferred<AdminOverview>();
    const secondRequest = makeDeferred<AdminOverview>();
    vi.spyOn(apiClient, 'getAdminOverview')
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    mockIntegrations();
    render(<AdminPanel />);

    await userEvent.click(screen.getByRole('button', { name: '수집 상태 새로고침' }));
    await act(async () => secondRequest.resolve(makeOverview([makeAdminFeed('new-feed', '새 응답 Feed')])));
    await act(async () => firstRequest.reject(new Error('늦게 온 오류')));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('새 응답 Feed')).toBeTruthy();
  });

  it('화면이 떠 있는 동안 10초마다 다시 읽고, 탭이 숨겨져 있으면 읽지 않으며, 화면을 떠나면 멈춘다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const getAdminOverview = vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(makeOverview([makeAdminFeed('hn-best', 'Hacker News Best')]));
    mockIntegrations();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { unmount } = render(<AdminPanel />);
    await screen.findByRole('region', { name: 'Feed 운영' });
    expect(getAdminOverview).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(getAdminOverview).toHaveBeenCalledTimes(2);

    visibility.mockReturnValue('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(getAdminOverview).toHaveBeenCalledTimes(2);

    visibility.mockReturnValue('visible');
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(getAdminOverview).toHaveBeenCalledTimes(2);
  });
});

describe('AdminPanel Feed 조치와 이력', () => {
  it('Feed 조치가 끝나면 관리 상태를 다시 읽어 표에 반영한다', async () => {
    const getAdminOverview = vi
      .spyOn(apiClient, 'getAdminOverview')
      .mockResolvedValueOnce(makeOverview([makeAdminFeed('hn-best', 'Hacker News Best')]))
      .mockResolvedValueOnce(makeOverview([makeAdminFeed('hn-best', 'Hacker News Best', { manualRequestedAt: '2026-11-18T03:00:00.000Z' })]));
    const requestFeedFetch = vi.spyOn(apiClient, 'requestFeedFetch').mockResolvedValue(undefined as never);
    mockIntegrations();
    render(<AdminPanel />);
    const operations = within(await screen.findByRole('region', { name: 'Feed 운영' }));

    await userEvent.click(operations.getByRole('button', { name: '지금 수집 요청' }));

    await waitFor(() => expect(operations.getByRole('button', { name: '요청됨' })).toBeTruthy());
    expect(requestFeedFetch).toHaveBeenCalledWith('hn-best');
    expect(getAdminOverview).toHaveBeenCalledTimes(2);
    expect(operations.getByText('수집을 요청했습니다. 수집기가 순서대로 처리합니다.')).toBeTruthy();
  });

  it('Feed 이름을 누르면 그 Feed의 수집 이력을 보여 주고 이력 영역으로 스크롤한다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(makeOverview([makeAdminFeed('hn-best', 'Hacker News Best')]));
    const listAdminAttempts = vi.spyOn(apiClient, 'listAdminAttempts').mockResolvedValue({ attempts: [], nextBefore: null });
    mockIntegrations();
    render(<AdminPanel />);
    expect(screen.queryByRole('region', { name: 'Hacker News Best 수집 이력' })).toBeNull();

    await userEvent.click(await screen.findByRole('button', { name: 'Hacker News Best 수집 이력 보기' }));

    await screen.findByRole('region', { name: 'Hacker News Best 수집 이력' });
    expect(listAdminAttempts).toHaveBeenCalledWith('hn-best', undefined, undefined);
    expect(scrollTo).toHaveBeenCalled();
  });
});

describe('AdminPanel 외부 연동 상태', () => {
  it('LLM과 DeepL 상태를 불러와 보여 준다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(makeOverview([]));
    mockIntegrations();
    render(<AdminPanel />);

    const llm = within(screen.getByRole('region', { name: 'LLM 연결 상태' }));
    expect(await llm.findByText('서비스 연결됨')).toBeTruthy();
    expect(llm.getByText('Claude: 인증 정보 있음')).toBeTruthy();
    const deepL = within(screen.getByRole('region', { name: 'DeepL 사용량' }));
    expect(deepL.getByText('1,500 / 500,000 문자')).toBeTruthy();
    expect(deepL.getByText('0.3% 사용')).toBeTruthy();
  });

  it('한쪽만 실패하면 실패한 쪽에만 오류를 보이고 다른 쪽은 그대로 보여 준다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(makeOverview([]));
    vi.spyOn(apiClient, 'listLlmModels').mockRejectedValue(new Error('LLM 서비스 응답 없음'));
    vi.spyOn(apiClient, 'getDeepLUsage').mockResolvedValue(deepLUsage);
    render(<AdminPanel />);

    const llm = within(screen.getByRole('region', { name: 'LLM 연결 상태' }));
    expect((await llm.findByRole('alert')).textContent).toBe('LLM 서비스 응답 없음');
    expect(within(screen.getByRole('region', { name: 'DeepL 사용량' })).getByText('1,500 / 500,000 문자')).toBeTruthy();
  });

  it('Error가 아닌 값으로 실패하면 연동별 기본 오류 문구를 보여 준다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(makeOverview([]));
    vi.spyOn(apiClient, 'listLlmModels').mockRejectedValue('문자열');
    vi.spyOn(apiClient, 'getDeepLUsage').mockRejectedValue('문자열');
    render(<AdminPanel />);

    expect((await within(screen.getByRole('region', { name: 'LLM 연결 상태' })).findByRole('alert')).textContent).toBe('LLM에 연결하지 못했습니다.');
    expect((await within(screen.getByRole('region', { name: 'DeepL 사용량' })).findByRole('alert')).textContent).toBe('DeepL 사용량을 조회하지 못했습니다.');
  });

  it('새로고침을 누르면 두 연동을 다시 조회하는 동안 버튼을 막고, 성공하면 오류를 지운다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(makeOverview([]));
    const refreshedModels = makeDeferred<LlmModelsView>();
    const listLlmModels = vi
      .spyOn(apiClient, 'listLlmModels')
      .mockRejectedValueOnce(new Error('LLM 서비스 응답 없음'))
      .mockReturnValueOnce(refreshedModels.promise);
    const getDeepLUsage = vi.spyOn(apiClient, 'getDeepLUsage').mockResolvedValue(deepLUsage);
    render(<AdminPanel />);
    const llm = within(screen.getByRole('region', { name: 'LLM 연결 상태' }));
    await llm.findByRole('alert');

    await userEvent.click(llm.getByRole('button', { name: '새로고침' }));

    expect(llm.queryByRole('alert')).toBeNull();
    expect((llm.getByRole('button', { name: '새로고침' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(screen.getByRole('region', { name: 'DeepL 사용량' })).getByRole('button', { name: '새로고침' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => refreshedModels.resolve(llmModels));
    expect(llm.getByText('서비스 연결됨')).toBeTruthy();
    expect((llm.getByRole('button', { name: '새로고침' }) as HTMLButtonElement).disabled).toBe(false);
    expect(listLlmModels).toHaveBeenCalledTimes(2);
    expect(getDeepLUsage).toHaveBeenCalledTimes(2);
  });

  it('DeepL 새로고침 버튼도 두 연동을 함께 다시 조회한다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(makeOverview([]));
    const listLlmModels = vi.spyOn(apiClient, 'listLlmModels').mockResolvedValue(llmModels);
    const getDeepLUsage = vi.spyOn(apiClient, 'getDeepLUsage').mockResolvedValue(deepLUsage);
    render(<AdminPanel />);
    const deepL = within(screen.getByRole('region', { name: 'DeepL 사용량' }));
    await deepL.findByText('1,500 / 500,000 문자');

    await userEvent.click(deepL.getByRole('button', { name: '새로고침' }));

    await waitFor(() => expect(getDeepLUsage).toHaveBeenCalledTimes(2));
    expect(listLlmModels).toHaveBeenCalledTimes(2);
    expect((await deepL.findByText('1,500 / 500,000 문자'))).toBeTruthy();
  });

  it('화면을 떠난 뒤에 도착한 연동 응답은 무시한다', async () => {
    vi.spyOn(apiClient, 'getAdminOverview').mockResolvedValue(makeOverview([]));
    const slowModels = makeDeferred<LlmModelsView>();
    vi.spyOn(apiClient, 'listLlmModels').mockReturnValue(slowModels.promise);
    vi.spyOn(apiClient, 'getDeepLUsage').mockResolvedValue(deepLUsage);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<AdminPanel />);

    unmount();
    await act(async () => slowModels.resolve(llmModels));

    expect(consoleError).not.toHaveBeenCalled();
  });
});
