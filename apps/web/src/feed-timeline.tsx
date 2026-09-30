/**
 * Feed 하나의 채팅형 타임라인(Q40). 오래된 Entry가 위, 새 Entry가 아래다.
 *
 * 열면 Read Cursor 바로 다음(첫 안 읽음)에서 시작하고, 그 위에 "여기부터 새 글" 구분선을 둔다.
 * 위로 끝까지 올리면 더 오래된 Entry를, 아래로 끝까지 내리면 더 새로운 Entry를 불러온다.
 *
 * Read Cursor는 Entry가 화면 위쪽 밖으로 나가거나, 그 Entry를 펼칠 때 움직인다(CONTEXT.md).
 * 마지막 Entry도 위로 밀어 올릴 수 있도록 목록 끝에 화면 높이만큼 빈 공간을 둔다.
 */
import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EntryView, FeedSummary } from '@trendboda/api-types';
import { Button } from '@/components/ui/button';
import { apiClient } from './api-client.ts';
import { findCardKind } from './card-kind.ts';
import { EntryCard } from './entry-card.tsx';
import type { EntrySelectionProps } from './entry-selection.ts';
import { EmptyMessage, EntryListSkeleton, LoadError } from './load-states.tsx';
import { useReadCursorTracker } from './use-read-cursor-tracker.ts';

/** 커서 위쪽에 맥락으로 보여 줄 이미 읽은 Entry 수. */
const CONTEXT_ENTRY_COUNT = 10;
/** 한 번에 불러오는 Entry 수. */
const PAGE_SIZE = 50;

const nextRunFormatter = new Intl.DateTimeFormat('ko', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

type FeedTimelineProps = EntrySelectionProps & {
  feed: FeedSummary;
  onReadCursorSaved: () => void;
};

/** 다음 렌더 직후에 할 스크롤 동작. */
type PendingScroll = { kind: 'to-divider' } | { kind: 'to-bottom' } | { kind: 'keep-position-after-prepend'; previousScrollHeight: number };

export function FeedTimeline({ feed, onReadCursorSaved, selectedEntryId, makeEntryHref, onSelectEntry }: FeedTimelineProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // 화면을 연 순간의 커서를 기준으로 삼는다. 읽는 동안 Feed 목록이 갱신돼도 구분선 위치는 바뀌지 않는다.
  const [openedCursorEntryId] = useState(feed.readCursorEntryId ?? 0);
  const [entries, setEntries] = useState<EntryView[] | undefined>();
  const [firstUnreadEntryId, setFirstUnreadEntryId] = useState<number | undefined>();
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  /** 처음 불러오기를 다시 시도할 때 올려서 아래 effect를 다시 돌린다. */
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingScrollRef = useRef<PendingScroll | undefined>(undefined);
  const loadingRef = useRef(false);
  const { trackPassedEntries, jumpTo } = useReadCursorTracker(feed.id, scrollAreaRef, openedCursorEntryId, onReadCursorSaved);

  // 처음 열 때: 커서 위쪽 맥락 몇 개 + 커서 뒤의 안 읽음.
  useEffect(() => {
    setLoadFailed(false);
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
      .catch((error: unknown) => {
        console.error(error);
        setLoadFailed(true);
      });
  }, [feed.id, openedCursorEntryId, loadAttempt]);

  // 렌더 직후: 예약된 스크롤을 적용한다.
  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    const pendingScroll = pendingScrollRef.current;
    pendingScrollRef.current = undefined;
    if (scrollArea && pendingScroll) {
      if (pendingScroll.kind === 'to-divider') scrollArea.querySelector('[data-unread-divider]')?.scrollIntoView({ block: 'start' });
      if (pendingScroll.kind === 'to-bottom') scrollArea.scrollTop = scrollArea.scrollHeight;
      if (pendingScroll.kind === 'keep-position-after-prepend')
        scrollArea.scrollTop += scrollArea.scrollHeight - pendingScroll.previousScrollHeight;
    }
  }, [entries]);

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

  if (loadFailed) return <LoadError message="Entry를 불러오지 못했습니다." onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />;
  if (!entries) return <EntryListSkeleton />;
  if (entries.length === 0)
    return (
      <EmptyMessage>
        아직 수집된 Entry가 없습니다. 다음 수집은{' '}
        <span className="font-mono tabular-nums">{nextRunFormatter.format(new Date(feed.nextRunAt))}</span>입니다.
      </EmptyMessage>
    );

  return (
    <div className="relative h-full">
      {/* 위에 이전 Entry를 붙일 때 스크롤 위치는 keep-position-after-prepend가 직접 맞춘다.
          브라우저의 스크롤 앵커링(overflow-anchor)까지 켜 두면 두 번 보정되어 화면이 아래로 튄다. */}
      <div className="h-full overflow-y-auto [overflow-anchor:none]" ref={scrollAreaRef} onScroll={trackPassedEntries}>
        <div className="mx-auto flex max-w-[760px] flex-col gap-2 p-4">
          {hasOlder && <LoadTrigger scrollAreaRef={scrollAreaRef} onVisible={loadOlder} />}
          {entries.map((entry) => (
            <div key={entry.id} data-entry-id={entry.id}>
              {entry.id === firstUnreadEntryId && (
                <div
                  data-unread-divider
                  className="my-2 flex items-center gap-2 text-caption-bold text-brand-ink before:flex-1 before:border-t before:border-brand after:flex-1 after:border-t after:border-brand"
                >
                  여기부터 새 글
                </div>
              )}
              <EntryCard
                entry={entry}
                cardKind={findCardKind(feed.id, feed.group?.id)}
                href={makeEntryHref(entry.id)}
                selected={entry.id === selectedEntryId}
                onSelect={(selectedEntry) => {
                  // 아래 Entry를 펼쳤다면 위 Entry는 이미 훑었다(CONTEXT.md의 Read Cursor).
                  jumpTo(selectedEntry.id);
                  onSelectEntry({ entry: selectedEntry });
                }}
              />
            </div>
          ))}
          {hasNewer ? (
            <LoadTrigger scrollAreaRef={scrollAreaRef} onVisible={loadNewer} />
          ) : (
            // 마지막 Entry도 화면 위쪽 밖으로 밀어 올려 지나갈 수 있게 하는 빈 공간.
            <p className="h-dvh pt-6 text-center text-caption text-muted-foreground">
              마지막 Entry입니다. 다음 수집은 <span className="font-mono tabular-nums">{nextRunFormatter.format(new Date(feed.nextRunAt))}</span>입니다.
            </p>
          )}
        </div>
      </div>
      {feed.unreadCount > 0 && (
        <Button
          className="absolute right-4 bottom-4 h-10 rounded-full px-4 text-button-md shadow-md md:right-6 md:bottom-6"
          onClick={jumpToLatest}
        >
          <ArrowDown strokeWidth={1.5} aria-hidden />
          안 읽음 <span className="font-mono tabular-nums">{feed.unreadCount}</span>개
        </Button>
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
  return <div ref={triggerRef} className="h-px" />;
}
