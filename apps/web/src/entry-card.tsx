/**
 * Entry 하나. 카드를 누르면 오른쪽에 Entry가 펼쳐진다(ADR-0011). 원문은 펼친 화면의 버튼으로 연다.
 * 제목·Bookmark·요약은 모든 카드가 같고, 제목 아래 메타 줄은 카드 종류(글, 저장소, 모델, 논문, 릴리스)에 따라 다르다.
 * 번역한 Entry는 번역 제목만 보여 준다.
 */
import { Star } from 'lucide-react';
import type { EntryView } from '@trendboda/api-types';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import { apiClient } from './api-client.ts';
import type { CardKind } from './card-kind.ts';
import { useEntryChanges } from './entry-changes.tsx';
import { EntryMeta, EntryTags } from './entry-meta.tsx';

type EntryCardProps = {
  entry: EntryView;
  /** 메타 줄 모양. 생략하면 글 카드다. */
  cardKind?: CardKind;
  /** Bookmark 목록처럼 여러 Feed가 섞일 때 보여 줄 Feed 이름. */
  feedTitle?: string;
  /** 카드를 눌렀을 때 갈 화면 해시(이 Entry를 펼친 화면). */
  href: string;
  /** 지금 오른쪽에 펼쳐진 Entry인지. */
  selected: boolean;
  /** 카드를 눌러 펼칠 때 부른다. 이미 펼친 Entry를 다시 눌러도 부른다(Stream Feed의 Read Cursor 이동용). */
  onSelect?: (selectedEntry: EntryView) => void;
  /** Bookmark가 바뀌면 바뀐 Entry로 부른다. */
  onEntryChange?: (changedEntry: EntryView) => void;
  /** 대표 수치(점수, 늘어난 스타) 옆에 보여 줄 직전 수집 대비 증감(Ranked Feed). */
  metricChange?: number;
};

export function EntryCard({ entry: loadedEntry, cardKind = 'article', feedTitle, href, selected, onSelect, onEntryChange, metricChange }: EntryCardProps) {
  const { withChanges, publishChange } = useEntryChanges();
  const entry = withChanges(loadedEntry);
  const bookmarked = Boolean(entry.bookmarkedAt);

  const toggleBookmark = async () => {
    await apiClient.setBookmarked(entry.id, !bookmarked);
    const changedEntry = { ...entry, bookmarkedAt: bookmarked ? null : new Date().toISOString() };
    publishChange(changedEntry);
    onEntryChange?.(changedEntry);
  };

  return (
    <article
      className={cn(
        'relative rounded-lg border px-4 py-3 text-card-foreground transition-colors duration-150 ease-out motion-reduce:transition-none',
        selected ? 'border-subtle-foreground bg-accent' : 'bg-card hover:bg-accent',
      )}
    >
      <div className="flex items-start gap-2">
        <a
          className={cn(
            'flex-1 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
            // 카드 전체를 누를 수 있게 링크의 누르는 영역을 카드 크기로 넓힌다. Bookmark와 메타 줄 링크는 그 위에 올린다.
            "after:absolute after:inset-0 after:rounded-lg after:content-['']",
            // 긴 저장소 이름(owner/name)은 한 단어라 칸을 넘치지 않게 필요할 때만 중간에서 끊는다.
            'break-words',
            entry.openedAt ? 'text-body-sm-medium text-muted-foreground' : 'text-entry-title text-foreground',
          )}
          href={href}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect?.(entry)}
        >
          {entry.translatedTitle ?? entry.title}
        </a>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            'relative z-10 -mt-1 -mr-2 shrink-0 rounded-full max-md:size-11',
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
