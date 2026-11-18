// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminAttemptPage, AdminFetchAttempt } from '@trendboda/api-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminHistory } from './admin-history.tsx';
import { apiClient } from './api-client.ts';

function makeAttempt(id: number, status: AdminFetchAttempt['status'], errorMessage: string | null = null): AdminFetchAttempt {
  return {
    id,
    feedId: 'hn-best',
    status,
    startedAt: '2026-11-18T01:00:00.000Z',
    finishedAt: status === 'running' ? null : '2026-11-18T01:00:02.500Z',
    insertedEntryCount: status === 'success' ? 4 : null,
    errorMessage,
  };
}

function makePage(attempts: AdminFetchAttempt[], nextBefore: number | null = null): AdminAttemptPage {
  return { attempts, nextBefore };
}

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

function renderHistory(latestAttempt: AdminFetchAttempt | null = null) {
  return render(<AdminHistory feedId="hn-best" title="Hacker News Best" latestAttempt={latestAttempt} />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminHistory 조회', () => {
  it('받기 전에는 불러오는 중 표시를, 받으면 결과·새 Entry 수·오류를 표로 보여 준다', async () => {
    vi.spyOn(apiClient, 'listAdminAttempts').mockResolvedValue(makePage([makeAttempt(2, 'failed', 'HTTP 500'), makeAttempt(1, 'success')]));
    renderHistory();

    expect(screen.getByLabelText('수집 이력 불러오는 중')).toBeTruthy();
    const table = within(await screen.findByRole('table'));
    const [failedRow, successRow] = table.getAllByRole('row').slice(1);
    expect(within(failedRow).getByText('실패')).toBeTruthy();
    expect(within(failedRow).getByText('HTTP 500')).toBeTruthy();
    expect(within(successRow).getByText('성공')).toBeTruthy();
    expect(within(successRow).getByText('4')).toBeTruthy();
    expect(within(successRow).getByText('2.5초')).toBeTruthy();
    expect(screen.queryByLabelText('수집 이력 불러오는 중')).toBeNull();
  });

  it('이력이 없으면 안내 문구를 보여 준다', async () => {
    vi.spyOn(apiClient, 'listAdminAttempts').mockResolvedValue(makePage([]));
    renderHistory();

    expect(await screen.findByText(/조건에 맞는 수집 이력이 없습니다/)).toBeTruthy();
  });

  it('조회에 실패하면 오류를 보이고, 다시 시도해서 성공하면 오류를 지우고 표를 보여 준다', async () => {
    const listAdminAttempts = vi
      .spyOn(apiClient, 'listAdminAttempts')
      .mockRejectedValueOnce(new Error('서버 오류'))
      .mockResolvedValueOnce(makePage([makeAttempt(1, 'success')]));
    renderHistory();

    expect((await screen.findByRole('alert')).textContent).toContain('서버 오류');

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await screen.findByRole('table');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(listAdminAttempts).toHaveBeenCalledTimes(2);
  });

  it('Error가 아닌 값으로 실패하면 기본 오류 문구를 보여 준다', async () => {
    vi.spyOn(apiClient, 'listAdminAttempts').mockRejectedValue('문자열 오류');
    renderHistory();

    expect((await screen.findByRole('alert')).textContent).toContain('이력을 불러오지 못했습니다.');
  });

  it('다시 시도하는 동안에는 이전 오류 대신 불러오는 중 표시를 보인다', async () => {
    const retryRequest = makeDeferred<AdminAttemptPage>();
    vi.spyOn(apiClient, 'listAdminAttempts')
      .mockRejectedValueOnce(new Error('서버 오류'))
      .mockReturnValueOnce(retryRequest.promise);
    renderHistory();
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('수집 이력 불러오는 중')).toBeTruthy();
    await act(async () => retryRequest.resolve(makePage([makeAttempt(1, 'success')])));
    expect(screen.getByRole('table')).toBeTruthy();
  });
});

describe('AdminHistory 필터와 페이지', () => {
  it('결과 필터를 바꾸면 그 상태로 다시 조회한다', async () => {
    const listAdminAttempts = vi.spyOn(apiClient, 'listAdminAttempts').mockResolvedValue(makePage([makeAttempt(1, 'success')]));
    renderHistory();
    await screen.findByRole('table');

    await userEvent.selectOptions(screen.getByLabelText('수집 결과 필터'), 'failed');

    await screen.findByRole('table');
    expect(listAdminAttempts).toHaveBeenLastCalledWith('hn-best', 'failed', undefined);
  });

  it('이전 기록을 누르면 nextBefore 이전부터 조회하고, 최신 기록을 누르면 처음부터 다시 조회한다', async () => {
    const listAdminAttempts = vi
      .spyOn(apiClient, 'listAdminAttempts')
      .mockResolvedValueOnce(makePage([makeAttempt(60, 'success')], 11))
      .mockResolvedValueOnce(makePage([makeAttempt(10, 'success')]))
      .mockResolvedValueOnce(makePage([makeAttempt(60, 'success')], 11));
    renderHistory();
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: '이전 기록' }));
    await screen.findByText('2.5초');
    expect(listAdminAttempts).toHaveBeenLastCalledWith('hn-best', undefined, 11);
    expect(screen.queryByRole('button', { name: '이전 기록' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '최신 기록' }));
    await screen.findByRole('button', { name: '이전 기록' });
    expect(listAdminAttempts).toHaveBeenLastCalledWith('hn-best', undefined, undefined);
    expect(listAdminAttempts).toHaveBeenCalledTimes(3);
  });
});

describe('AdminHistory 늦게 오는 응답', () => {
  it('필터를 바꾸기 전에 보낸 느린 요청의 응답은 나중에 와도 화면에 반영하지 않는다', async () => {
    const slowAllRequest = makeDeferred<AdminAttemptPage>();
    vi.spyOn(apiClient, 'listAdminAttempts')
      .mockReturnValueOnce(slowAllRequest.promise)
      .mockResolvedValueOnce(makePage([makeAttempt(2, 'failed', '실패한 수집')]));
    renderHistory();

    await userEvent.selectOptions(screen.getByLabelText('수집 결과 필터'), 'failed');
    await screen.findByText('실패한 수집');
    await act(async () => slowAllRequest.resolve(makePage([makeAttempt(1, 'success')])));

    expect(screen.getByText('실패한 수집')).toBeTruthy();
    expect(within(screen.getByRole('table')).queryByText('성공')).toBeNull();
  });

  it('필터를 바꾸기 전에 보낸 요청이 실패해도 새 요청의 결과에 오류를 덮어쓰지 않는다', async () => {
    const slowAllRequest = makeDeferred<AdminAttemptPage>();
    vi.spyOn(apiClient, 'listAdminAttempts')
      .mockReturnValueOnce(slowAllRequest.promise)
      .mockResolvedValueOnce(makePage([makeAttempt(2, 'failed', '실패한 수집')]));
    renderHistory();

    await userEvent.selectOptions(screen.getByLabelText('수집 결과 필터'), 'failed');
    await screen.findByText('실패한 수집');
    await act(async () => slowAllRequest.reject(new Error('늦게 온 오류')));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('실패한 수집')).toBeTruthy();
  });

  it('화면을 떠난 뒤에 오는 응답은 무시한다', async () => {
    const slowRequest = makeDeferred<AdminAttemptPage>();
    vi.spyOn(apiClient, 'listAdminAttempts').mockReturnValue(slowRequest.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHistory();

    unmount();
    await act(async () => slowRequest.resolve(makePage([makeAttempt(1, 'success')])));

    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('AdminHistory 최신 수집 상태 연동', () => {
  it('Feed의 최신 수집 상태가 바뀌면 현재 조건으로 이력을 다시 읽는다', async () => {
    const listAdminAttempts = vi
      .spyOn(apiClient, 'listAdminAttempts')
      .mockResolvedValueOnce(makePage([makeAttempt(1, 'running')]))
      .mockResolvedValueOnce(makePage([makeAttempt(1, 'success')]));
    const { rerender } = renderHistory(makeAttempt(1, 'running'));
    await screen.findByText('진행 중');

    rerender(<AdminHistory feedId="hn-best" title="Hacker News Best" latestAttempt={makeAttempt(1, 'success')} />);

    await waitFor(() => expect(within(screen.getByRole('table')).getByText('성공')).toBeTruthy());
    expect(within(screen.getByRole('table')).queryByText('진행 중')).toBeNull();
    expect(listAdminAttempts).toHaveBeenCalledTimes(2);
  });

  it('최신 수집 상태가 그대로면 다시 읽지 않는다', async () => {
    const listAdminAttempts = vi.spyOn(apiClient, 'listAdminAttempts').mockResolvedValue(makePage([makeAttempt(1, 'success')]));
    const { rerender } = renderHistory(makeAttempt(1, 'success'));
    await screen.findByRole('table');

    rerender(<AdminHistory feedId="hn-best" title="Hacker News Best" latestAttempt={makeAttempt(1, 'success')} />);

    expect(screen.getByRole('table')).toBeTruthy();
    expect(listAdminAttempts).toHaveBeenCalledTimes(1);
  });
});
