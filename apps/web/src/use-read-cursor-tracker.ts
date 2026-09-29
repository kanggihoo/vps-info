/**
 * 채팅형 화면에서 Read Cursor를 따라 움직이는 훅(Q40·Q44, CONTEXT.md의 Read Cursor).
 *
 * Entry가 스크롤되어 스크롤 영역 위쪽 밖으로 완전히 나가면 "지나간 것"으로 치고, 지금까지 지나간 Entry 중 가장 큰 id를 기억한다.
 * 화면에 보이기만 한 Entry는 지나간 것이 아니다. 그래서 첫 화면에 뜬 Entry가 한꺼번에 읽음이 되지 않는다.
 * 서버 저장은 스크롤이 멈추고 1초 뒤에 한 번 하고, 페이지를 떠나거나 다른 Feed로 옮길 때도 한 번 한다.
 * Read Cursor는 최신 쪽으로만 움직이므로 작은 id는 보내지 않는다.
 */
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { apiClient } from './api-client.ts';

/** 스크롤이 멈춘 뒤 서버에 저장하기까지 기다리는 시간. */
const SAVE_DELAY_MILLISECONDS = 1_000;

/**
 * @param scrollAreaRef - Entry들이 들어 있는 스크롤 영역. 이 영역의 위쪽 끝을 지나갔는지로 판정한다.
 * @param initialCursorEntryId - 화면을 열 때의 Read Cursor
 * @param onSaved - 서버에 저장한 뒤 부른다(Feed 목록의 안 읽음 수 갱신용)
 * @returns `trackPassedEntries`: 스크롤 영역의 `onScroll`에 단다. `jumpTo`: 커서를 바로 옮겨 저장한다.
 */
export function useReadCursorTracker(
  feedId: string,
  scrollAreaRef: RefObject<HTMLElement | null>,
  initialCursorEntryId: number,
  onSaved: () => void,
) {
  const passedEntryIdRef = useRef(initialCursorEntryId);
  const savedEntryIdRef = useRef(initialCursorEntryId);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const measureFrameRef = useRef<number | undefined>(undefined);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const saveNow = useCallback(() => {
    window.clearTimeout(saveTimerRef.current);
    const entryId = passedEntryIdRef.current;
    if (entryId <= savedEntryIdRef.current) return;
    savedEntryIdRef.current = entryId;
    apiClient
      .moveReadCursor(feedId, entryId)
      .then(() => onSavedRef.current())
      .catch(console.error);
  }, [feedId]);

  useEffect(() => {
    window.addEventListener('pagehide', saveNow);
    return () => {
      window.cancelAnimationFrame(measureFrameRef.current ?? 0);
      window.removeEventListener('pagehide', saveNow);
      saveNow(); // 다른 Feed로 옮길 때 마지막 위치를 저장한다.
    };
  }, [saveNow]);

  /** 스크롤 영역 위쪽 끝보다 아래쪽 끝이 위에 있는 Entry를 지나간 것으로 친다. 한 프레임에 한 번만 잰다. */
  const trackPassedEntries = useCallback(() => {
    if (measureFrameRef.current !== undefined) return;
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = undefined;
      const scrollArea = scrollAreaRef.current;
      if (!scrollArea) return;
      const scrollAreaTop = scrollArea.getBoundingClientRect().top;
      // Entry는 오래된 것부터 위에서 아래로 놓여 있다. 처음으로 아직 안 지나간 Entry에서 멈춘다.
      for (const element of scrollArea.querySelectorAll<HTMLElement>('[data-entry-id]')) {
        if (element.getBoundingClientRect().bottom > scrollAreaTop) break;
        passedEntryIdRef.current = Math.max(passedEntryIdRef.current, Number(element.dataset.entryId));
      }
      if (passedEntryIdRef.current <= savedEntryIdRef.current) return;
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(saveNow, SAVE_DELAY_MILLISECONDS);
    });
  }, [saveNow, scrollAreaRef]);

  /** "안 읽음" 버튼과 원문 열기용. 커서를 바로 옮기고 기다리지 않고 저장한다. */
  const jumpTo = useCallback(
    (entryId: number) => {
      passedEntryIdRef.current = Math.max(passedEntryIdRef.current, entryId);
      saveNow();
    },
    [saveNow],
  );

  return { trackPassedEntries, jumpTo };
}
