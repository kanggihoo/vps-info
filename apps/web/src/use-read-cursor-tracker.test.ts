// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client.ts';
import { useReadCursorTracker } from './use-read-cursor-tracker.ts';

const FEED_ID = 'hn-new';

function renderTracker(initialCursorEntryId: number, onSaved: () => void) {
  const scrollAreaRef = { current: document.createElement('div') };
  return renderHook(
    ({ onSaved: currentOnSaved }) => useReadCursorTracker(FEED_ID, scrollAreaRef, initialCursorEntryId, currentOnSaved),
    { initialProps: { onSaved } },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useReadCursorTracker', () => {
  it('jumpTo는 기다리지 않고 Read Cursor를 서버에 저장한 뒤 onSaved를 부른다', async () => {
    const moveReadCursor = vi.spyOn(apiClient, 'moveReadCursor').mockResolvedValue({ readCursorEntryId: 7 });
    const onSaved = vi.fn();
    const { result } = renderTracker(3, onSaved);

    act(() => result.current.jumpTo(7));

    expect(moveReadCursor).toHaveBeenCalledExactlyOnceWith(FEED_ID, 7);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('렌더 뒤에 바뀐 onSaved를 저장이 끝났을 때 부른다(이전 callback은 부르지 않는다)', async () => {
    vi.spyOn(apiClient, 'moveReadCursor').mockResolvedValue({ readCursorEntryId: 9 });
    const staleOnSaved = vi.fn();
    const latestOnSaved = vi.fn();
    const { result, rerender } = renderTracker(3, staleOnSaved);

    rerender({ onSaved: latestOnSaved });
    act(() => result.current.jumpTo(9));

    await waitFor(() => expect(latestOnSaved).toHaveBeenCalledTimes(1));
    expect(staleOnSaved).not.toHaveBeenCalled();
  });

  it('이미 저장한 id보다 크지 않으면 서버로 보내지 않는다(Read Cursor는 최신 쪽으로만 움직인다)', () => {
    const moveReadCursor = vi.spyOn(apiClient, 'moveReadCursor').mockResolvedValue({ readCursorEntryId: 5 });
    const { result } = renderTracker(5, vi.fn());

    act(() => result.current.jumpTo(5));
    act(() => result.current.jumpTo(2));

    expect(moveReadCursor).not.toHaveBeenCalled();
  });

  it('저장이 실패하면 오류를 기록하고 onSaved는 부르지 않는다', async () => {
    const failure = new Error('network down');
    vi.spyOn(apiClient, 'moveReadCursor').mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSaved = vi.fn();
    const { result } = renderTracker(0, onSaved);

    act(() => result.current.jumpTo(4));

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(failure));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('페이지를 떠나면(pagehide) 지나간 위치를 한 번 저장한다', () => {
    const moveReadCursor = vi.spyOn(apiClient, 'moveReadCursor').mockResolvedValue({ readCursorEntryId: 6 });
    vi.useFakeTimers();
    // jumpTo는 바로 저장하므로, 저장 전 상태는 스크롤로 지나간 Entry를 기록해서 만든다.
    const scrollArea = document.createElement('div');
    scrollArea.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    const entryElement = document.createElement('div');
    entryElement.dataset.entryId = '6';
    entryElement.getBoundingClientRect = () => ({ bottom: -10 }) as DOMRect;
    scrollArea.append(entryElement);
    const { result } = renderHook(() => useReadCursorTracker(FEED_ID, { current: scrollArea }, 0, vi.fn()));

    act(() => result.current.trackPassedEntries());
    act(() => { vi.advanceTimersToNextFrame(); });
    expect(moveReadCursor).not.toHaveBeenCalled();

    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(moveReadCursor).toHaveBeenCalledExactlyOnceWith(FEED_ID, 6);
  });

  it('스크롤로 위쪽 밖으로 완전히 나간 Entry 중 가장 큰 id를 1초 뒤에 한 번 저장한다', () => {
    vi.useFakeTimers();
    const moveReadCursor = vi.spyOn(apiClient, 'moveReadCursor').mockResolvedValue({ readCursorEntryId: 11 });
    const scrollArea = document.createElement('div');
    scrollArea.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    // 10, 11은 위쪽 끝(100)보다 위로 지나갔고, 12는 아직 걸쳐 있다.
    for (const [entryId, bottom] of [[10, 50], [11, 99], [12, 140]] as const) {
      const entryElement = document.createElement('div');
      entryElement.dataset.entryId = String(entryId);
      entryElement.getBoundingClientRect = () => ({ bottom }) as DOMRect;
      scrollArea.append(entryElement);
    }
    const { result } = renderHook(() => useReadCursorTracker(FEED_ID, { current: scrollArea }, 0, vi.fn()));

    act(() => result.current.trackPassedEntries());
    act(() => { vi.advanceTimersToNextFrame(); });
    act(() => { vi.advanceTimersByTime(999); });
    expect(moveReadCursor).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(moveReadCursor).toHaveBeenCalledExactlyOnceWith(FEED_ID, 11);
  });

  it('화면을 벗어나는(unmount) 순간 마지막 위치를 저장한다', () => {
    const moveReadCursor = vi.spyOn(apiClient, 'moveReadCursor').mockResolvedValue({ readCursorEntryId: 8 });
    vi.useFakeTimers();
    const scrollArea = document.createElement('div');
    scrollArea.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    const entryElement = document.createElement('div');
    entryElement.dataset.entryId = '8';
    entryElement.getBoundingClientRect = () => ({ bottom: 10 }) as DOMRect;
    scrollArea.append(entryElement);
    const { result, unmount } = renderHook(() => useReadCursorTracker(FEED_ID, { current: scrollArea }, 0, vi.fn()));

    act(() => result.current.trackPassedEntries());
    act(() => { vi.advanceTimersToNextFrame(); });
    expect(moveReadCursor).not.toHaveBeenCalled();

    unmount();

    expect(moveReadCursor).toHaveBeenCalledExactlyOnceWith(FEED_ID, 8);
  });
});
