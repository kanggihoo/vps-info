/** Entry 하나. 제목을 누르면 원문이 새 탭에서 열리고 Opened At이 기록된다. */
import { ArrowUp, MessageSquare, Star } from 'lucide-react';
import type { EntryView } from '@signal-archive/api-types';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import { apiClient } from './api-client.ts';

const dateFormatter = new Intl.DateTimeFormat('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

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
  const bookmarked = Boolean(entry.bookmarkedAt);

  const openOriginal = () => {
    if (entry.openedAt) return;
    onEntryChange({ ...entry, openedAt: new Date().toISOString() });
    apiClient.markOpened(entry.id).catch(console.error);
  };

  const toggleBookmark = async () => {
    await apiClient.setBookmarked(entry.id, !bookmarked);
    onEntryChange({ ...entry, bookmarkedAt: bookmarked ? null : new Date().toISOString() });
  };

  return (
    <article className="rounded-lg border bg-card px-4 py-3 text-card-foreground">
      <div className="flex items-start gap-2">
        <a
          className={cn(
            'flex-1 rounded-xs underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring',
            entry.openedAt ? 'text-body-sm-medium text-muted-foreground' : 'text-entry-title text-foreground',
          )}
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openOriginal}
        >
          {entry.title}
        </a>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            '-mt-1 -mr-2 shrink-0 rounded-full max-md:size-11',
            bookmarked ? 'text-brand-ink hover:text-brand-ink' : 'text-subtle-foreground',
          )}
          onClick={toggleBookmark}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? 'Bookmark 해제' : 'Bookmark'}
        >
          <Star className={cn('size-4.5', bookmarked && 'fill-current')} strokeWidth={1.5} />
        </Button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        {feedTitle && <span className="text-foreground">{feedTitle}</span>}
        <span>{new URL(entry.url).hostname}</span>
        {entry.author && <span>{entry.author}</span>}
        <span className="font-mono tabular-nums">{dateFormatter.format(new Date(entry.publishedAt ?? entry.firstSeenAt))}</span>
        {score !== undefined && (
          <span className="flex items-center gap-0.5 font-mono tabular-nums">
            <ArrowUp className="size-3.5" strokeWidth={1.5} aria-label="점수" />
            {score}
          </span>
        )}
        {commentCount !== undefined && <CommentCount count={commentCount} url={commentsUrl} />}
      </div>
      {entry.summary && <p className="mt-2 line-clamp-2 text-body-sm text-muted-foreground">{entry.summary}</p>}
    </article>
  );
}

/** 댓글 수. 댓글 페이지 주소가 있으면 링크로 만든다. */
function CommentCount({ count, url }: { count: number; url: string | undefined }) {
  const content = (
    <>
      <MessageSquare className="size-3.5" strokeWidth={1.5} aria-label="댓글" />
      <span className="font-mono tabular-nums">{count}</span>
    </>
  );
  if (!url)
    return <span className="flex items-center gap-1">{content}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 rounded-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </a>
  );
}
