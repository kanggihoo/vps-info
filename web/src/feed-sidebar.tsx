/** 왼쪽 Feed 목록. Feed마다 안 읽음 수와 연속 실패 경고를 보여 준다. */
import type { FeedSummary } from '../../src/api-types.ts';
import type { Screen } from './app.tsx';

type FeedSidebarProps = {
  feeds: FeedSummary[];
  screen: Screen;
};

export function FeedSidebar({ feeds, screen }: FeedSidebarProps) {
  return (
    <nav className="feed-sidebar">
      <h1 className="app-title">Signal Archive</h1>
      <ul className="feed-list">
        {feeds.map((feed) => (
          <li key={feed.id}>
            <a
              href={`#/feeds/${encodeURIComponent(feed.id)}`}
              className={screen.kind === 'feed' && screen.feedId === feed.id ? 'feed-link selected' : 'feed-link'}
            >
              <span className="feed-title">{feed.title}</span>
              {feed.consecutiveFailures > 0 && (
                <span
                  className="failure-badge"
                  title={`연속 ${feed.consecutiveFailures}회 실패 · 다음 시도 ${new Date(feed.nextRunAt).toLocaleString('ko')}`}
                >
                  ⚠ {feed.consecutiveFailures}
                </span>
              )}
              {feed.unreadCount > 0 && <span className="unread-badge">{feed.unreadCount}</span>}
            </a>
          </li>
        ))}
      </ul>
      <a href="#/bookmarks" className={screen.kind === 'bookmarks' ? 'feed-link selected' : 'feed-link'}>
        <span className="feed-title">★ Bookmark</span>
      </a>
    </nav>
  );
}
