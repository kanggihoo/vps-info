/**
 * 채팅형 화면에서 Read Cursor를 따라 움직이는 훅(Q40·Q44).
 *
 * Entry가 화면에 온전히 보이면 "지나간 것"으로 치고, 지금까지 지나간 Entry 중 가장 큰 id를 기억한다.
 * 서버 저장은 스크롤이 멈추고 1초 뒤에 한 번 하고, 페이지를 떠나거나 다른 Feed로 옮길 때도 한 번 한다.
 * Read Cursor는 최신 쪽으로만 움직이므로 작은 id는 보내지 않는다.
 */
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { apiClient } from './api-client.ts';

/** 스크롤이 멈춘 뒤 서버에 저장하기까지 기다리는 시간. */
const SAVE_DELAY_MILLISECONDS = 1_000;

/**
 * @param scrollAreaRef - Entry들이 들어 있는 스크롤 영역. 이 영역 안에서 보이는지를 판정한다.
 * @param initialCursorEntryId - 화면을 열 때의 Read Cursor
 * @param onSaved - 서버에 저장한 뒤 부른다(Feed 목록의 안 읽음 수 갱신용)
 * @returns `observeEntryElements`: 새로 그린 Entry 요소를 관찰 대상에 넣는다. `jumpTo`: 커서를 바로 옮겨 저장한다.
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
  const observerRef = useRef<IntersectionObserver | null>(null);
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
    observerRef.current = new IntersectionObserver(
      (observations) => {
        for (const observation of observations) {
          if (!observation.isIntersecting) continue;
          const entryId = Number((observation.target as HTMLElement).dataset.entryId);
          passedEntryIdRef.current = Math.max(passedEntryIdRef.current, entryId);
        }
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(saveNow, SAVE_DELAY_MILLISECONDS);
      },
      // threshold 1: Entry 전체가 보여야 지나간 것으로 친다.
      // root를 비워 두면 브라우저 화면 기준이지만, 스크롤 영역 밖으로 잘린 부분은 보이지 않는 것으로 계산된다.
      { threshold: 1 },
    );
    window.addEventListener('pagehide', saveNow);
    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener('pagehide', saveNow);
      saveNow(); // 다른 Feed로 옮길 때 마지막 위치를 저장한다.
    };
  }, [saveNow]);

  /** 스크롤 영역 안의 `data-entry-id` 요소를 모두 관찰한다. 이미 관찰 중인 요소는 다시 넣어도 무시된다. */
  const observeEntryElements = useCallback(() => {
    scrollAreaRef.current
      ?.querySelectorAll<HTMLElement>('[data-entry-id]')
      .forEach((element) => observerRef.current?.observe(element));
  }, [scrollAreaRef]);

  /** "안 읽음 끝으로" 버튼용. 커서를 바로 옮기고 기다리지 않고 저장한다. */
  const jumpTo = useCallback(
    (entryId: number) => {
      passedEntryIdRef.current = Math.max(passedEntryIdRef.current, entryId);
      saveNow();
    },
    [saveNow],
  );

  return { observeEntryElements, jumpTo };
}
