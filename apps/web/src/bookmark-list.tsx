/** 여러 Feed의 Bookmark를 최근에 Bookmark한 순서로 모아 보여 준다. */
import { useCallback, useEffect, useState } from 'react';
import type { BookmarkedEntryView } from '@trendboda/api-types';
import { apiClient } from './api-client.ts';
import { EntryCard } from './entry-card.tsx';
import { EmptyMessage, EntryListSkeleton, LoadError } from './load-states.tsx';

export function BookmarkList() {
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
            feedTitle={bookmark.feedTitle}
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
