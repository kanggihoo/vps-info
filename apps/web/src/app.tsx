/**
 * 화면 전체 틀: 왼쪽 Feed 목록과 오른쪽 본문(Stream Feed 타임라인, Ranked Feed 순위표, Bookmark 목록).
 * Feed Group에 든 Feed면 본문 위에 변형을 고르는 탭·드롭다운을 둔다(ADR-0010).
 * 어떤 화면을 보는지는 URL 해시(`#/feeds/<id>`, `#/bookmarks`)에 두어 새로고침해도 유지한다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FeedGroupView, FeedSummary } from '@trendboda/api-types';
import { apiClient } from './api-client.ts';
import { BookmarkList } from './bookmark-list.tsx';
import { buildSidebarSections, pickRowFeed, saveLastFeedId } from './feed-group.ts';
import { FeedGroupBar } from './feed-group-bar.tsx';
import { FeedSidebar } from './feed-sidebar.tsx';
import { FeedTimeline } from './feed-timeline.tsx';
import { EmptyMessage, LoadError } from './load-states.tsx';
import { RankTable } from './rank-table.tsx';
import { readScreenFromHash, type Screen } from './screen-route.ts';

/** 새 Entry가 들어왔는지 Feed 목록을 다시 받아오는 간격. */
const FEED_LIST_REFRESH_INTERVAL_MILLISECONDS = 60_000;

export function App() {
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [feedGroups, setFeedGroups] = useState<FeedGroupView[]>([]);
  const [feedListFailed, setFeedListFailed] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => readScreenFromHash(window.location.hash));

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

  useEffect(() => {
    refreshFeeds();
    // Group 선언은 배포 사이에 바뀌지 않아 한 번만 받는다. 실패하면 Group 없이 Feed를 한 줄씩 보여 준다.
    apiClient.listFeedGroups().then(setFeedGroups).catch(console.error);
    const timer = window.setInterval(refreshFeeds, FEED_LIST_REFRESH_INTERVAL_MILLISECONDS);
    const onHashChange = () => setScreen(readScreenFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [refreshFeeds]);

  const sidebarSections = useMemo(() => buildSidebarSections(feeds, feedGroups), [feeds, feedGroups]);
  // 처음 열었을 때 해시가 없으면 왼쪽 목록의 첫 줄을 보여 준다.
  const firstRow = sidebarSections[0]?.rows[0];
  const effectiveScreen: Screen = screen.kind === 'none' && firstRow ? { kind: 'feed', feedId: pickRowFeed(firstRow).id } : screen;
  const selectedFeed = effectiveScreen.kind === 'feed' ? feeds.find((feed) => feed.id === effectiveScreen.feedId) : undefined;
  const selectedGroupRow = sidebarSections
    .flatMap((section) => section.rows)
    .find((row) => row.kind === 'group' && row.group.id === selectedFeed?.group?.id);
  // 이미 받은 목록이 있으면 갱신 실패는 조용히 넘기고 다음 주기에 다시 받는다.
  const showFeedListError = feedListFailed && feeds.length === 0;

  // Group 줄을 다시 누르면 마지막으로 본 변형이 열리도록 기억한다.
  const selectedGroupId = selectedFeed?.group?.id;
  const selectedFeedId = selectedFeed?.id;
  useEffect(() => {
    if (selectedGroupId && selectedFeedId) saveLastFeedId(selectedGroupId, selectedFeedId);
  }, [selectedGroupId, selectedFeedId]);

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] md:grid-cols-[240px_1fr] md:grid-rows-1">
      <FeedSidebar sections={sidebarSections} screen={effectiveScreen} />
      <main className="flex min-h-0 flex-col overflow-hidden">
        {selectedFeed && selectedGroupRow?.kind === 'group' && (
          <FeedGroupBar group={selectedGroupRow.group} feeds={selectedGroupRow.feeds} selectedFeed={selectedFeed} />
        )}
        <div className="relative min-h-0 flex-1">
          {showFeedListError && <LoadError message="Feed 목록을 불러오지 못했습니다." onRetry={refreshFeeds} />}
          {effectiveScreen.kind === 'bookmarks' && <BookmarkList />}
          {selectedFeed?.kind === 'stream' && <FeedTimeline key={selectedFeed.id} feed={selectedFeed} onReadCursorSaved={refreshFeeds} />}
          {selectedFeed?.kind === 'ranked' && <RankTable key={selectedFeed.id} feed={selectedFeed} />}
          {effectiveScreen.kind === 'feed' && !selectedFeed && feeds.length > 0 && (
            <EmptyMessage>없는 Feed입니다. 왼쪽 목록에서 Feed를 고르세요.</EmptyMessage>
          )}
        </div>
      </main>
    </div>
  );
}
