/** 여러 Feed의 Bookmark를 최근에 Bookmark한 순서로 모아 보여 준다. 카드 모양은 Entry가 온 Feed를 따른다. */
import { useCallback, useEffect, useState } from 'react';
import type { BookmarkedEntryView, FeedSummary } from '@trendboda/api-types';
import { apiClient } from './api-client.ts';
import { findCardKind } from './card-kind.ts';
import { EntryCard } from './entry-card.tsx';
import type { EntrySelectionProps } from './entry-selection.ts';
import { EmptyMessage, EntryListSkeleton, LoadError } from './load-states.tsx';

/** @param feeds - 카드 모양을 정하려고 Entry가 온 Feed의 Feed Group을 찾는 데 쓴다. */
export function BookmarkList({ feeds, selectedEntryId, makeEntryHref, onSelectEntry }: EntrySelectionProps & { feeds: FeedSummary[] }) {
  const [bookmarks, setBookmarks] = useState<BookmarkedEntryView[] | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);

  const loadBookmarks = useCallback(() => {
    setLoadFailed(false);
    apiClient
      .listBookmarks()
      .then(setBookmarks)
      .catch((error: unknown) => {
        console.error(error);
        setLoadFailed(true);
      });
  }, []);

  useEffect(loadBookmarks, [loadBookmarks]);

  if (loadFailed) return <LoadError message="Bookmark를 불러오지 못했습니다." onRetry={loadBookmarks} />;
  if (!bookmarks) return <EntryListSkeleton />;
  if (bookmarks.length === 0) return <EmptyMessage>Entry의 별을 누르면 여기에 모입니다.</EmptyMessage>;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[760px] flex-col gap-2 p-4">
        {bookmarks.map((bookmark) => (
          <EntryCard
            key={bookmark.id}
            entry={bookmark}
            cardKind={findCardKind(bookmark.feedId, feeds.find((feed) => feed.id === bookmark.feedId)?.group?.id)}
            feedTitle={bookmark.feedTitle}
            href={makeEntryHref(bookmark.id)}
            selected={bookmark.id === selectedEntryId}
            onSelect={(selectedEntry) => onSelectEntry({ entry: selectedEntry })}
            onEntryChange={(changedEntry) =>
              setBookmarks((current) =>
                // Bookmark를 해제하면 목록에서 뺀다.
                changedEntry.bookmarkedAt
                  ? current?.map((item) => (item.id === changedEntry.id ? { ...item, ...changedEntry } : item))
                  : current?.filter((item) => item.id !== changedEntry.id),
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
