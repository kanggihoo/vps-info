/** 여러 Feed의 Bookmark를 최근에 Bookmark한 순서로 모아 보여 준다. */
import { useEffect, useState } from 'react';
import type { BookmarkedEntryView } from '../../src/api-types.ts';
import { apiClient } from './api-client.ts';
import { EntryCard } from './entry-card.tsx';

export function BookmarkList() {
  const [bookmarks, setBookmarks] = useState<BookmarkedEntryView[] | undefined>();

  useEffect(() => {
    apiClient.listBookmarks().then(setBookmarks).catch(console.error);
  }, []);

  if (!bookmarks) return null;
  if (bookmarks.length === 0) return <p className="empty-message">Bookmark한 Entry가 없습니다.</p>;
  return (
    <div className="scroll-area">
      <div className="entry-column">
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
