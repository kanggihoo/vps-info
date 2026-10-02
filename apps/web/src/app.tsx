/**
 * 화면 전체 틀: 왼쪽 Feed 목록, 가운데 Entry 목록(Stream Feed 타임라인, Ranked Feed 순위표, Bookmark 목록), 오른쪽 펼친 Entry(ADR-0011).
 * Feed Group에 든 Feed면 가운데 목록 위에 변형을 고르는 탭·드롭다운을 둔다(ADR-0010).
 * 어떤 화면과 Entry를 보는지는 URL 해시(`#/feeds/<id>/entries/<entryId>`, `#/bookmarks`)에 두어 새로고침해도 유지한다.
 * 넓은 화면(`lg`)은 3열이고, 좁은 화면에서는 펼친 Entry가 가운데 목록을 덮는다. 목록은 그 아래에 그대로 있어 스크롤 위치를 잃지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedGroupView, FeedSummary } from '@trendboda/api-types';
import { apiClient } from './api-client.ts';
import { BookmarkList } from './bookmark-list.tsx';
import { EntryPanel, EntryPanelPlaceholder } from './entry-panel.tsx';
import type { EntrySelection, EntrySelectionProps } from './entry-selection.ts';
import { buildSidebarSections, pickRowFeed, saveLastFeedId } from './feed-group.ts';
import { FeedGroupBar } from './feed-group-bar.tsx';
import { FeedSidebar } from './feed-sidebar.tsx';
import { FeedTimeline } from './feed-timeline.tsx';
import { EmptyMessage, LoadError } from './load-states.tsx';
import { RankTable } from './rank-table.tsx';
import { makeScreenHash, readScreenFromHash, type Screen } from './screen-route.ts';
import { useFeedNavigationOrder } from './use-feed-navigation-order.ts';
import { useMediaQuery } from './use-media-query.ts';
import { activateReadingTool, focusReadingTarget, shouldIgnoreReadingKey } from './reading-keyboard.ts';
import { describeLlmChoice, useLlmChoice } from './use-llm-choice.ts';
import { AdminPanel } from './admin-panel.tsx';

/** 새 Entry가 들어왔는지 Feed 목록을 다시 받아오는 간격. */
const FEED_LIST_REFRESH_INTERVAL_MILLISECONDS = 60_000;

export function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef(new Map<string, string>());
  const pendingPanelRef = useRef<string | undefined>(undefined);
  const [hiddenEntryId, setHiddenEntryId] = useState<number>();
  const wideDetail = useMediaQuery('(min-width: 1024px)');
  const navigation = useFeedNavigationOrder();
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [feedGroups, setFeedGroups] = useState<FeedGroupView[]>([]);
  const [groupsReady, setGroupsReady] = useState(false);
  const [groupListFailed, setGroupListFailed] = useState(false);
  const [feedListFailed, setFeedListFailed] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => readScreenFromHash(window.location.hash));
  /** 목록에서 마지막으로 고른 Entry. 펼친 화면이 목록이 가진 값을 다시 조회하지 않고 쓴다. */
  const [lastSelection, setLastSelection] = useState<EntrySelection | undefined>();
  const { llmModels, llmChoice, chooseLlm } = useLlmChoice();

  const refreshFeeds = useCallback(() => {
    apiClient
      .listFeeds()
      .then((loadedFeeds) => {
        setFeeds(loadedFeeds);
        setFeedListFailed(false);
      })
      .catch((error: unknown) => {
        console.error(error);
        setFeedListFailed(true);
      });
  }, []);

  const refreshGroups = useCallback(() => {
    apiClient.listFeedGroups().then((loaded) => {
      setFeedGroups(loaded);
      setGroupsReady(true);
      setGroupListFailed(false);
    }).catch(() => setGroupListFailed(true));
  }, []);

  useEffect(() => {
    refreshFeeds();
    // Group 목록까지 받은 뒤 정렬을 허용해, 묶인 Feed가 개별 줄로 저장되지 않게 한다.
    refreshGroups();
    const timer = window.setInterval(refreshFeeds, FEED_LIST_REFRESH_INTERVAL_MILLISECONDS);
    const onHashChange = () => setScreen(readScreenFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [refreshFeeds, refreshGroups]);

  const sidebarSections = useMemo(() => groupsReady ? buildSidebarSections(feeds, feedGroups, navigation.order) : [], [feeds, feedGroups, navigation.order, groupsReady]);
  // 처음 열었을 때 해시가 없으면 왼쪽 목록의 첫 줄을 보여 준다.
  const firstRow = navigation.order ? sidebarSections[0]?.rows[0] : undefined;
  const effectiveScreen: Screen = screen.kind === 'none' && firstRow ? { kind: 'feed', feedId: pickRowFeed(firstRow).id } : screen;
  const selectedFeed = effectiveScreen.kind === 'feed' ? feeds.find((feed) => feed.id === effectiveScreen.feedId) : undefined;
  const selectedGroupRow = sidebarSections
    .flatMap((section) => section.rows)
    .find((row) => row.kind === 'group' && row.group.id === selectedFeed?.group?.id);
  const selectedEntryId = effectiveScreen.kind === 'none' || effectiveScreen.kind === 'admin' ? undefined : effectiveScreen.entryId;
  const selection = lastSelection?.entry.id === selectedEntryId ? lastSelection : undefined;
  const entrySelectionProps: EntrySelectionProps | undefined =
    effectiveScreen.kind === 'none' || effectiveScreen.kind === 'admin'
      ? undefined
      : {
          selectedEntryId,
          makeEntryHref: (entryId) => makeScreenHash({ ...effectiveScreen, entryId }),
          onSelectEntry: (next) => selectEntry(next),
        };
  const closeEntry = () => {
    pendingPanelRef.current = undefined;
    if (effectiveScreen.kind !== 'none' && effectiveScreen.kind !== 'admin') window.location.hash = makeScreenHash({ ...effectiveScreen, entryId: undefined });
  };
  const detailHidden = !wideDetail && selectedEntryId !== undefined && hiddenEntryId === selectedEntryId;
  const focusPanel = (name: string) => {
    const panel = rootRef.current?.querySelector<HTMLElement>(`[data-reading-panel="${name}"]`);
    if (!panel || panel.hidden || panel.inert) return false;
    const items = [...panel.querySelectorAll<HTMLElement>('[data-navigation-item]')].filter((item) => item.getClientRects().length > 0);
    const remembered = lastFocusedRef.current.get(name);
    const target = name === 'detail' ? panel : items.find((item) => item.dataset.navigationItem === remembered)
      ?? items.find((item) => item.hasAttribute('aria-current')) ?? items[0] ?? panel;
    focusReadingTarget(target);
    return true;
  };
  // 표시를 바꾼 뒤 포커스한다. 원문 요청은 같은 EntryPanel 안에서 계속 진행한다.
  useEffect(() => {
    if (pendingPanelRef.current) {
      const panel = pendingPanelRef.current;
      if (focusPanel(panel)) pendingPanelRef.current = undefined;
    }
  });
  useEffect(() => {
    if (wideDetail) setHiddenEntryId(undefined);
  }, [wideDetail]);
  useEffect(() => { setHiddenEntryId(undefined); }, [selectedEntryId, selectedFeed?.id]);
  const moveToPanel = (name: string) => {
    if (name === 'detail') {
      if (selectedEntryId === undefined) return;
      if (detailHidden) {
        pendingPanelRef.current = 'detail';
        setHiddenEntryId(undefined);
      } else focusPanel('detail');
    } else if (name === 'entries' && !wideDetail && selectedEntryId !== undefined && !detailHidden) {
      pendingPanelRef.current = 'entries';
      setHiddenEntryId(selectedEntryId);
    } else focusPanel(name);
  };
  const handleReadingKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (shouldIgnoreReadingKey(event.nativeEvent)) return;
    const target = event.target as HTMLElement;
    const panel = target.closest<HTMLElement>('[data-reading-panel]');
    if (!panel) return;
    const panelKeys: Record<string, string> = { Digit1: 'feeds', Digit2: 'entries', Digit3: 'detail' };
    const destination = panelKeys[event.code];
    if (destination) {
      event.preventDefault();
      if (!event.repeat) moveToPanel(destination);
      return;
    }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && target.matches('[data-navigation-item]')) {
      const items = [...panel.querySelectorAll<HTMLElement>('[data-navigation-item]')].filter((item) => item.getClientRects().length > 0);
      const index = items.indexOf(target);
      const next = items[Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { event.preventDefault(); focusReadingTarget(next); }
      return;
    }
    if (!event.repeat && selectedEntryId !== undefined && !detailHidden && ['KeyB', 'KeyR', 'KeyC', 'KeyT', 'KeyO', 'KeyD'].includes(event.code)) {
      const detail = rootRef.current?.querySelector<HTMLElement>('[data-reading-panel="detail"]');
      if (detail && activateReadingTool(detail, event.code)) event.preventDefault();
    }
  };
  const selectEntry = (next: EntrySelection) => {
    setLastSelection(next);
    setHiddenEntryId(undefined);
    pendingPanelRef.current = 'detail';
  };
  // 이미 받은 목록이 있으면 갱신 실패는 조용히 넘기고 다음 주기에 다시 받는다.
  const showFeedListError = feedListFailed && feeds.length === 0;

  // Group 줄을 다시 누르면 마지막으로 본 변형이 열리도록 기억한다.
  const selectedGroupId = selectedFeed?.group?.id;
  const selectedFeedId = selectedFeed?.id;
  useEffect(() => {
    if (selectedGroupId && selectedFeedId) saveLastFeedId(selectedGroupId, selectedFeedId);
  }, [selectedGroupId, selectedFeedId]);

  return (
    <div ref={rootRef} onKeyDown={handleReadingKey} onFocusCapture={(event) => {
      const target = event.target as HTMLElement;
      const item = target.closest<HTMLElement>('[data-navigation-item]');
      const panel = target.closest<HTMLElement>('[data-reading-panel]');
      if (item?.dataset.navigationItem && panel?.dataset.readingPanel) lastFocusedRef.current.set(panel.dataset.readingPanel, item.dataset.navigationItem);
    }} className="grid h-dvh grid-rows-[auto_1fr] md:grid-cols-[240px_1fr] md:grid-rows-1">
      <FeedSidebar orderReady={Boolean(navigation.order) && groupsReady} saving={navigation.saving} failed={navigation.failed || groupListFailed} statusMessage={groupListFailed ? 'Feed Group 목록을 불러오지 못했습니다.' : navigation.message} onRetryOrder={() => { refreshFeeds(); refreshGroups(); navigation.retry(); }} onSaveOrder={(order) => {
        if (screen.kind === 'none' && effectiveScreen.kind !== 'none') {
          setScreen(effectiveScreen);
          window.location.hash = makeScreenHash(effectiveScreen);
        }
        void navigation.save(order);
      }} sections={sidebarSections} screen={effectiveScreen} llmModels={llmModels} llmChoice={llmChoice} onChooseLlm={chooseLlm} />
      {effectiveScreen.kind === 'admin' ? <AdminPanel /> : <main className="relative min-h-0 overflow-hidden lg:grid lg:grid-cols-[minmax(340px,440px)_1fr] lg:grid-rows-[minmax(0,1fr)]">
        <section className="flex h-full min-h-0 flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:border-r" aria-label="Entry 목록" data-reading-panel="entries" tabIndex={-1} inert={!wideDetail && selectedEntryId !== undefined && !detailHidden}>
          {selectedFeed && selectedGroupRow?.kind === 'group' && (
            <FeedGroupBar group={selectedGroupRow.group} feeds={selectedGroupRow.feeds} selectedFeed={selectedFeed} />
          )}
          <div className="relative min-h-0 flex-1">
            {showFeedListError && <LoadError message="Feed 목록을 불러오지 못했습니다." onRetry={refreshFeeds} />}
            {entrySelectionProps && effectiveScreen.kind === 'bookmarks' && <BookmarkList feeds={feeds} {...entrySelectionProps} />}
            {entrySelectionProps && selectedFeed?.kind === 'stream' && (
              <FeedTimeline key={selectedFeed.id} feed={selectedFeed} onReadCursorSaved={refreshFeeds} {...entrySelectionProps} />
            )}
            {entrySelectionProps && selectedFeed?.kind === 'ranked' && <RankTable key={selectedFeed.id} feed={selectedFeed} {...entrySelectionProps} />}
            {effectiveScreen.kind === 'feed' && !selectedFeed && feeds.length > 0 && (
              <EmptyMessage>없는 Feed입니다. 왼쪽 목록에서 Feed를 고르세요.</EmptyMessage>
            )}
          </div>
        </section>
        {selectedEntryId !== undefined ? (
          <section className="absolute inset-0 z-20 min-h-0 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:static lg:z-auto" aria-label="펼친 Entry" data-reading-panel="detail" tabIndex={-1} hidden={detailHidden} inert={detailHidden}>
            <EntryPanel
              key={selectedEntryId}
              entryId={selectedEntryId}
              selection={selection}
              feeds={feeds}
              onClose={closeEntry}
              llmChoice={llmChoice}
              llmChoiceTitle={describeLlmChoice(llmModels, llmChoice)}
            />
          </section>
        ) : (
          <section className="hidden min-w-0 lg:block" aria-label="펼친 Entry">
            <EntryPanelPlaceholder />
          </section>
        )}
      </main>}
    </div>
  );
}
