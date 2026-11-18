// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FeedNavigationOrder } from '@trendboda/api-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from './api-client.ts';
import { useFeedNavigationOrder } from './use-feed-navigation-order.ts';

const serverOrder: FeedNavigationOrder = {
  stream: [{ kind: 'feed', id: 'a' }, { kind: 'feed', id: 'b' }],
  ranked: [{ kind: 'group', id: 'trendshift' }],
};
const reorderedOrder: FeedNavigationOrder = { ...serverOrder, stream: [{ kind: 'feed', id: 'b' }, { kind: 'feed', id: 'a' }] };

/** 테스트가 직접 끝내는 요청. 요청이 진행 중인 동안의 화면 상태를 확인할 때 쓴다. */
function makeDeferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => vi.restoreAllMocks());

describe('useFeedNavigationOrder 조회', () => {
  it('마운트하면 저장된 순서를 받아 오류 없이 보여 준다', async () => {
    vi.spyOn(apiClient, 'getFeedNavigationOrder').mockResolvedValue(serverOrder);
    const { result } = renderHook(() => useFeedNavigationOrder());

    await waitFor(() => expect(result.current.order).toEqual(serverOrder));
    expect(result.current.failed).toBe(false);
    expect(result.current.message).toBe('');
  });

  it('조회에 실패하면 오류 상태와 안내를 남기고, 다시 시도하면 성공할 때 오류를 지운다', async () => {
    const getFeedNavigationOrder = vi
      .spyOn(apiClient, 'getFeedNavigationOrder')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(serverOrder);
    const { result } = renderHook(() => useFeedNavigationOrder());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.message).toBe('Feed 순서를 불러오지 못했습니다.');
    expect(result.current.order).toBeUndefined();

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.order).toEqual(serverOrder));
    expect(result.current.failed).toBe(false);
    expect(result.current.message).toBe('');
    expect(getFeedNavigationOrder).toHaveBeenCalledTimes(2);
  });

  it('다시 시도한 요청이 끝나기 전에는 이전 실패 상태를 유지한다', async () => {
    const retryRequest = makeDeferred<FeedNavigationOrder>();
    vi.spyOn(apiClient, 'getFeedNavigationOrder')
      .mockRejectedValueOnce(new Error('network down'))
      .mockReturnValueOnce(retryRequest.promise);
    const { result } = renderHook(() => useFeedNavigationOrder());
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.retry());

    expect(result.current.failed).toBe(true);
    expect(result.current.message).toBe('Feed 순서를 불러오지 못했습니다.');
    await act(async () => retryRequest.resolve(serverOrder));
    expect(result.current.failed).toBe(false);
  });

  it('다시 시도도 실패하면 오류 상태를 유지한다', async () => {
    vi.spyOn(apiClient, 'getFeedNavigationOrder').mockRejectedValue(new Error('still down'));
    const { result } = renderHook(() => useFeedNavigationOrder());
    await waitFor(() => expect(result.current.failed).toBe(true));

    await act(async () => result.current.retry());

    expect(apiClient.getFeedNavigationOrder).toHaveBeenCalledTimes(2);
    expect(result.current.failed).toBe(true);
    expect(result.current.message).toBe('Feed 순서를 불러오지 못했습니다.');
  });
});

describe('useFeedNavigationOrder 저장', () => {
  it('저장하는 동안에는 새 순서를 보여 주고, 끝나면 서버가 돌려준 순서로 바꾼다', async () => {
    vi.spyOn(apiClient, 'getFeedNavigationOrder').mockResolvedValue(serverOrder);
    const saveRequest = makeDeferred<FeedNavigationOrder>();
    const saveFeedNavigationOrder = vi.spyOn(apiClient, 'saveFeedNavigationOrder').mockReturnValue(saveRequest.promise);
    const { result } = renderHook(() => useFeedNavigationOrder());
    await waitFor(() => expect(result.current.order).toEqual(serverOrder));

    act(() => { void result.current.save(reorderedOrder); });

    expect(result.current.saving).toBe(true);
    expect(result.current.order).toEqual(reorderedOrder);
    expect(result.current.message).toBe('순서를 저장하는 중입니다.');
    await act(async () => saveRequest.resolve(reorderedOrder));
    expect(result.current.saving).toBe(false);
    expect(result.current.message).toBe('순서를 저장했습니다.');
    expect(saveFeedNavigationOrder).toHaveBeenCalledWith(reorderedOrder);
  });

  it('저장에 실패하면 직전 저장값으로 되돌리고, 다시 시도하면 같은 순서를 다시 저장한다', async () => {
    vi.spyOn(apiClient, 'getFeedNavigationOrder').mockResolvedValue(serverOrder);
    const saveFeedNavigationOrder = vi
      .spyOn(apiClient, 'saveFeedNavigationOrder')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(reorderedOrder);
    const { result } = renderHook(() => useFeedNavigationOrder());
    await waitFor(() => expect(result.current.order).toEqual(serverOrder));

    await act(async () => result.current.save(reorderedOrder));

    expect(result.current.order).toEqual(serverOrder);
    expect(result.current.failed).toBe(true);
    expect(result.current.message).toBe('순서를 저장하지 못해 이전 순서로 되돌렸습니다.');

    await act(async () => result.current.retry());

    expect(saveFeedNavigationOrder).toHaveBeenLastCalledWith(reorderedOrder);
    expect(result.current.order).toEqual(reorderedOrder);
    expect(result.current.failed).toBe(false);
  });

  it('목록이 바뀌어 409로 거절되면 같은 순서를 다시 저장하지 않고 목록을 다시 불러온다', async () => {
    const latestOrder: FeedNavigationOrder = { stream: [{ kind: 'feed', id: 'c' }], ranked: [] };
    const getFeedNavigationOrder = vi
      .spyOn(apiClient, 'getFeedNavigationOrder')
      .mockResolvedValueOnce(serverOrder)
      .mockResolvedValueOnce(latestOrder);
    const saveFeedNavigationOrder = vi.spyOn(apiClient, 'saveFeedNavigationOrder').mockRejectedValue(new ApiError('conflict', 409, undefined));
    const { result } = renderHook(() => useFeedNavigationOrder());
    await waitFor(() => expect(result.current.order).toEqual(serverOrder));

    await act(async () => result.current.save(reorderedOrder));

    expect(result.current.message).toBe('Feed 목록이 바뀌었습니다. 목록을 다시 불러오세요.');
    expect(result.current.failed).toBe(true);

    await act(async () => result.current.retry());

    expect(saveFeedNavigationOrder).toHaveBeenCalledTimes(1);
    expect(getFeedNavigationOrder).toHaveBeenCalledTimes(2);
    expect(result.current.order).toEqual(latestOrder);
    expect(result.current.failed).toBe(false);
  });

  it('저장하는 중에는 다시 불러오지 않고, 새 저장 요청도 무시한다', async () => {
    const getFeedNavigationOrder = vi.spyOn(apiClient, 'getFeedNavigationOrder').mockResolvedValue(serverOrder);
    const saveRequest = makeDeferred<FeedNavigationOrder>();
    const saveFeedNavigationOrder = vi.spyOn(apiClient, 'saveFeedNavigationOrder').mockReturnValue(saveRequest.promise);
    const { result } = renderHook(() => useFeedNavigationOrder());
    await waitFor(() => expect(result.current.order).toEqual(serverOrder));
    act(() => { void result.current.save(reorderedOrder); });

    await act(async () => result.current.retry());
    await act(async () => result.current.save(serverOrder));

    expect(getFeedNavigationOrder).toHaveBeenCalledTimes(1);
    expect(saveFeedNavigationOrder).toHaveBeenCalledTimes(1);
    await act(async () => saveRequest.resolve(reorderedOrder));
    expect(result.current.order).toEqual(reorderedOrder);
  });
});
