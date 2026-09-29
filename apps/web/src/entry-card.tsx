/**
 * Entry 하나. 제목을 누르면 원문이 새 탭에서 열리고 Opened At이 기록된다.
 * 제목·Bookmark·요약은 모든 카드가 같고, 제목 아래 메타 줄은 카드 종류(글, 저장소, 모델, 논문, 릴리스)에 따라 다르다.
 */
import { Star } from 'lucide-react';
import type { EntryView } from '@trendboda/api-types';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import { apiClient } from './api-client.ts';
import type { CardKind } from './card-kind.ts';
import { EntryMeta, EntryTags } from './entry-meta.tsx';

type EntryCardProps = {
  entry: EntryView;
  /** 메타 줄 모양. 생략하면 글 카드다. */
  cardKind?: CardKind;
  /** Bookmark 목록처럼 여러 Feed가 섞일 때 보여 줄 Feed 이름. */
  feedTitle?: string;
  /** Opened At이나 Bookmark가 바뀌면 바뀐 Entry로 부른다. */
  onEntryChange: (changedEntry: EntryView) => void;
  /** 원문을 열 때마다 부른다. 이미 연 Entry를 다시 열어도 부른다(Stream Feed의 Read Cursor 이동용). */
  onOpen?: (openedEntry: EntryView) => void;
  /** 대표 수치(점수, 늘어난 스타) 옆에 보여 줄 직전 수집 대비 증감(Ranked Feed). */
  metricChange?: number;
};

export function EntryCard({ entry, cardKind = 'article', feedTitle, onEntryChange, onOpen, metricChange }: EntryCardProps) {
  const bookmarked = Boolean(entry.bookmarkedAt);

  const openOriginal = () => {
    onOpen?.(entry);
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
            // 긴 저장소 이름(owner/name)은 한 단어라 칸을 넘치지 않게 필요할 때만 중간에서 끊는다.
            'break-words',
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
        <EntryMeta entry={entry} cardKind={cardKind} metricChange={metricChange} />
      </div>
      {entry.summary && (
        // 릴리스는 요약이 곧 변경 사항이라 조금 더 길게 보여 준다.
        <p className={cn('mt-2 text-body-sm text-muted-foreground', cardKind === 'release' ? 'line-clamp-4' : 'line-clamp-2')}>{entry.summary}</p>
      )}
      {cardKind === 'repository' && <EntryTags entry={entry} />}
    </article>
  );
}
