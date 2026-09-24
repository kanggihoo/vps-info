/** Entry 하나. 제목을 누르면 원문이 새 탭에서 열리고 Opened At이 기록된다. */
import type { EntryView } from '../../src/api-types.ts';
import { apiClient } from './api-client.ts';

const dateFormatter = new Intl.DateTimeFormat('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

type EntryCardProps = {
  entry: EntryView;
  /** Bookmark 목록처럼 여러 Feed가 섞일 때 보여 줄 Feed 이름. */
  feedTitle?: string;
  /** Opened At이나 Bookmark가 바뀌면 바뀐 Entry로 부른다. */
  onEntryChange: (changedEntry: EntryView) => void;
};

/** `extra`에서 숫자 필드를 꺼낸다. Feed마다 필드가 달라서 타입을 확인하고 쓴다. */
function readNumber(extra: EntryView['extra'], key: string): number | undefined {
  const value = extra?.[key];
  return typeof value === 'number' ? value : undefined;
}

export function EntryCard({ entry, feedTitle, onEntryChange }: EntryCardProps) {
  const score = readNumber(entry.extra, 'score');
  const commentCount = readNumber(entry.extra, 'commentCount');
  const commentsUrl = typeof entry.extra?.commentsUrl === 'string' ? entry.extra.commentsUrl : undefined;

  const openOriginal = () => {
    if (entry.openedAt) return;
    onEntryChange({ ...entry, openedAt: new Date().toISOString() });
    apiClient.markOpened(entry.id).catch(console.error);
  };

  const toggleBookmark = async () => {
    const bookmarked = !entry.bookmarkedAt;
    await apiClient.setBookmarked(entry.id, bookmarked);
    onEntryChange({ ...entry, bookmarkedAt: bookmarked ? new Date().toISOString() : null });
  };

  return (
    <article className={entry.openedAt ? 'entry-card opened' : 'entry-card'}>
      <div className="entry-heading">
        <a className="entry-title" href={entry.url} target="_blank" rel="noopener noreferrer" onClick={openOriginal}>
          {entry.title}
        </a>
        <button
          type="button"
          className={entry.bookmarkedAt ? 'bookmark-button active' : 'bookmark-button'}
          onClick={toggleBookmark}
          aria-label={entry.bookmarkedAt ? 'Bookmark 해제' : 'Bookmark'}
        >
          {entry.bookmarkedAt ? '★' : '☆'}
        </button>
      </div>
      <div className="entry-meta">
        {feedTitle && <span className="entry-feed">{feedTitle}</span>}
        <span>{new URL(entry.url).hostname}</span>
        {entry.author && <span>{entry.author}</span>}
        <span>{dateFormatter.format(new Date(entry.publishedAt ?? entry.firstSeenAt))}</span>
        {score !== undefined && <span>▲ {score}</span>}
        {commentCount !== undefined &&
          (commentsUrl ? (
            <a href={commentsUrl} target="_blank" rel="noopener noreferrer">
              댓글 {commentCount}
            </a>
          ) : (
            <span>댓글 {commentCount}</span>
          ))}
      </div>
      {entry.summary && <p className="entry-summary">{entry.summary}</p>}
    </article>
  );
}
