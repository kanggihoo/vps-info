/**
 * 화면 전체 틀: 왼쪽 Feed 목록과 오른쪽 본문(Feed 타임라인 또는 Bookmark 목록).
 * 어떤 화면을 보는지는 URL 해시(`#/feeds/<id>`, `#/bookmarks`)에 두어 새로고침해도 유지한다.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FeedSummary } from '@signal-archive/api-types';
import { apiClient } from './api-client.ts';
import { BookmarkList } from './bookmark-list.tsx';
import { FeedSidebar } from './feed-sidebar.tsx';
import { FeedTimeline } from './feed-timeline.tsx';
import { EmptyMessage, LoadError } from './load-states.tsx';
import { readScreenFromHash, type Screen } from './screen-route.ts';

/** 새 Entry가 들어왔는지 Feed 목록을 다시 받아오는 간격. */
const FEED_LIST_REFRESH_INTERVAL_MILLISECONDS = 60_000;

export function App() {
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
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
    const timer = window.setInterval(refreshFeeds, FEED_LIST_REFRESH_INTERVAL_MILLISECONDS);
    const onHashChange = () => setScreen(readScreenFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [refreshFeeds]);

  // 처음 열었을 때 해시가 없으면 첫 번째 Feed를 보여 준다.
  const effectiveScreen: Screen = screen.kind === 'none' && feeds[0] ? { kind: 'feed', feedId: feeds[0].id } : screen;
  const selectedFeed = effectiveScreen.kind === 'feed' ? feeds.find((feed) => feed.id === effectiveScreen.feedId) : undefined;
  // 이미 받은 목록이 있으면 갱신 실패는 조용히 넘기고 다음 주기에 다시 받는다.
  const showFeedListError = feedListFailed && feeds.length === 0;

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] md:grid-cols-[240px_1fr] md:grid-rows-1">
      <FeedSidebar feeds={feeds} screen={effectiveScreen} />
      <main className="relative min-h-0 overflow-hidden">
        {showFeedListError && <LoadError message="Feed 목록을 불러오지 못했습니다." onRetry={refreshFeeds} />}
        {effectiveScreen.kind === 'bookmarks' && <BookmarkList />}
        {selectedFeed && <FeedTimeline key={selectedFeed.id} feed={selectedFeed} onReadCursorSaved={refreshFeeds} />}
        {effectiveScreen.kind === 'feed' && !selectedFeed && feeds.length > 0 && (
          <EmptyMessage>없는 Feed입니다. 왼쪽 목록에서 Feed를 고르세요.</EmptyMessage>
        )}
      </main>
    </div>
  );
}
