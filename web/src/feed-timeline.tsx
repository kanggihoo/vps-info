/**
 * Feed 하나의 채팅형 타임라인(Q40). 오래된 Entry가 위, 새 Entry가 아래다.
 *
 * 열면 Read Cursor 바로 다음(첫 안 읽음)에서 시작하고, 그 위에 "여기부터 새 글" 구분선을 둔다.
 * 위로 끝까지 올리면 더 오래된 Entry를, 아래로 끝까지 내리면 더 새로운 Entry를 불러온다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EntryView, FeedSummary } from '../../src/api-types.ts';
import { apiClient } from './api-client.ts';
import { EntryCard } from './entry-card.tsx';
import { useReadCursorTracker } from './use-read-cursor-tracker.ts';

/** 커서 위쪽에 맥락으로 보여 줄 이미 읽은 Entry 수. */
const CONTEXT_ENTRY_COUNT = 10;
/** 한 번에 불러오는 Entry 수. */
const PAGE_SIZE = 50;

type FeedTimelineProps = {
  feed: FeedSummary;
  onReadCursorSaved: () => void;
};

/** 다음 렌더 직후에 할 스크롤 동작. */
type PendingScroll = { kind: 'to-divider' } | { kind: 'to-bottom' } | { kind: 'keep-position-after-prepend'; previousScrollHeight: number };

export function FeedTimeline({ feed, onReadCursorSaved }: FeedTimelineProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // 화면을 연 순간의 커서를 기준으로 삼는다. 읽는 동안 Feed 목록이 갱신돼도 구분선 위치는 바뀌지 않는다.
  const [openedCursorEntryId] = useState(feed.readCursorEntryId ?? 0);
  const [entries, setEntries] = useState<EntryView[] | undefined>();
  const [firstUnreadEntryId, setFirstUnreadEntryId] = useState<number | undefined>();
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const pendingScrollRef = useRef<PendingScroll | undefined>(undefined);
  const loadingRef = useRef(false);
  const { observeEntryElements, jumpTo } = useReadCursorTracker(feed.id, scrollAreaRef, openedCursorEntryId, onReadCursorSaved);

  // 처음 열 때: 커서 위쪽 맥락 몇 개 + 커서 뒤의 안 읽음.
  useEffect(() => {
    const olderRequest =
      openedCursorEntryId > 0 ? apiClient.listEntriesBefore(feed.id, openedCursorEntryId + 1, CONTEXT_ENTRY_COUNT) : Promise.resolve([]);
    Promise.all([olderRequest, apiClient.listEntriesAfter(feed.id, openedCursorEntryId, PAGE_SIZE)])
      .then(([older, newer]) => {
        setEntries([...older, ...newer]);
        setFirstUnreadEntryId(newer[0]?.id);
        setHasOlder(older.length === CONTEXT_ENTRY_COUNT);
        setHasNewer(newer.length === PAGE_SIZE);
        pendingScrollRef.current = newer.length > 0 ? { kind: 'to-divider' } : { kind: 'to-bottom' };
      })
      .catch(console.error);
  }, [feed.id, openedCursorEntryId]);

  // 렌더 직후: 예약된 스크롤을 적용하고, 새로 그린 Entry를 커서 추적 대상에 넣는다.
  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    const pendingScroll = pendingScrollRef.current;
    pendingScrollRef.current = undefined;
    if (scrollArea && pendingScroll) {
      if (pendingScroll.kind === 'to-divider') scrollArea.querySelector('.unread-divider')?.scrollIntoView({ block: 'start' });
      if (pendingScroll.kind === 'to-bottom') scrollArea.scrollTop = scrollArea.scrollHeight;
      if (pendingScroll.kind === 'keep-position-after-prepend')
        scrollArea.scrollTop += scrollArea.scrollHeight - pendingScroll.previousScrollHeight;
    }
    observeEntryElements();
  }, [entries, observeEntryElements]);

  const loadOlder = useCallback(async () => {
    if (loadingRef.current || !entries?.length) return;
    loadingRef.current = true;
    try {
      const older = await apiClient.listEntriesBefore(feed.id, entries[0].id, PAGE_SIZE);
      pendingScrollRef.current = { kind: 'keep-position-after-prepend', previousScrollHeight: scrollAreaRef.current?.scrollHeight ?? 0 };
      setEntries((current) => [...older, ...(current ?? [])]);
      setHasOlder(older.length === PAGE_SIZE);
    } finally {
      loadingRef.current = false;
    }
  }, [entries, feed.id]);

  const loadNewer = useCallback(async () => {
    if (loadingRef.current || !entries?.length) return;
    loadingRef.current = true;
    try {
      const newer = await apiClient.listEntriesAfter(feed.id, entries[entries.length - 1].id, PAGE_SIZE);
      setEntries((current) => [...(current ?? []), ...newer]);
      setHasNewer(newer.length === PAGE_SIZE);
    } finally {
      loadingRef.current = false;
    }
  }, [entries, feed.id]);

  /** "↓ 안 읽음" 버튼: 커서를 마지막 Entry로 옮기고 맨 아래를 보여 준다. */
  const jumpToLatest = async () => {
    if (!feed.latestEntryId) return;
    jumpTo(feed.latestEntryId);
    const latest = await apiClient.listEntriesBefore(feed.id, feed.latestEntryId + 1, PAGE_SIZE);
    pendingScrollRef.current = { kind: 'to-bottom' };
    setEntries(latest);
    setFirstUnreadEntryId(undefined);
    setHasOlder(latest.length === PAGE_SIZE);
    setHasNewer(false);
  };

  if (!entries) return null;
  if (entries.length === 0) return <p className="empty-message">아직 수집된 Entry가 없습니다.</p>;

  return (
    <div className="timeline">
      <div className="scroll-area" ref={scrollAreaRef}>
        <div className="entry-column">
          {hasOlder && <LoadTrigger scrollAreaRef={scrollAreaRef} onVisible={loadOlder} />}
          {entries.map((entry) => (
            <div key={entry.id} data-entry-id={entry.id}>
              {entry.id === firstUnreadEntryId && <div className="unread-divider">여기부터 새 글</div>}
              <EntryCard
                entry={entry}
                onEntryChange={(changedEntry) =>
                  setEntries((current) => current?.map((item) => (item.id === changedEntry.id ? changedEntry : item)))
                }
              />
            </div>
          ))}
          {hasNewer && <LoadTrigger scrollAreaRef={scrollAreaRef} onVisible={loadNewer} />}
        </div>
      </div>
      {feed.unreadCount > 0 && (
        <button type="button" className="jump-to-latest-button" onClick={jumpToLatest}>
          ↓ 안 읽음 {feed.unreadCount}개
        </button>
      )}
    </div>
  );
}

/** 스크롤 영역 끝에 두는 보이지 않는 표식. 화면에 들어오면 다음 페이지를 불러온다. */
function LoadTrigger({ scrollAreaRef, onVisible }: { scrollAreaRef: React.RefObject<HTMLDivElement | null>; onVisible: () => void }) {
  const triggerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([observation]) => observation.isIntersecting && onVisible(), {
      root: scrollAreaRef.current,
      rootMargin: '200px',
    });
    if (triggerRef.current) observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [onVisible, scrollAreaRef]);
  return <div ref={triggerRef} className="load-trigger" />;
}
