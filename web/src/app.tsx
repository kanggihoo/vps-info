/**
 * 화면 전체 틀: 왼쪽 Feed 목록과 오른쪽 본문(Feed 타임라인 또는 Bookmark 목록).
 * 어떤 화면을 보는지는 URL 해시(`#/feeds/<id>`, `#/bookmarks`)에 두어 새로고침해도 유지한다.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FeedSummary } from '../../src/api-types.ts';
import { apiClient } from './api-client.ts';
import { BookmarkList } from './bookmark-list.tsx';
import { FeedSidebar } from './feed-sidebar.tsx';
import { FeedTimeline } from './feed-timeline.tsx';
import { readScreenFromHash, type Screen } from './screen-route.ts';

/** 새 Entry가 들어왔는지 Feed 목록을 다시 받아오는 간격. */
const FEED_LIST_REFRESH_INTERVAL_MILLISECONDS = 60_000;

export function App() {
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [screen, setScreen] = useState<Screen>(() => readScreenFromHash(window.location.hash));

  const refreshFeeds = useCallback(() => {
    apiClient.listFeeds().then(setFeeds).catch(console.error);
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

  return (
    <div className="app-layout">
      <FeedSidebar feeds={feeds} screen={effectiveScreen} />
      <main className="app-main">
        {effectiveScreen.kind === 'bookmarks' && <BookmarkList />}
        {selectedFeed && <FeedTimeline key={selectedFeed.id} feed={selectedFeed} onReadCursorSaved={refreshFeeds} />}
        {effectiveScreen.kind === 'feed' && !selectedFeed && feeds.length > 0 && <p className="empty-message">없는 Feed입니다.</p>}
      </main>
    </div>
  );
}
