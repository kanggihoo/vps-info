/**
 * 화면에서 부르는 API 모음. 브라우저의 HTTP 호출은 모두 이 파일을 거친다.
 * 요청 경로는 상대 `/api`라서 운영(같은 서버)과 로컬(Vite 프록시)에서 똑같이 동작한다.
 */
import type { BookmarkedEntryView, EntryView, FeedSummary, MoveReadCursorRequest, RankSnapshotView } from '@signal-archive/api-types';

/**
 * JSON API를 호출한다. 실패 응답이면 예외를 던진다.
 *
 * @param keepalive - 페이지를 떠나는 중에도 요청이 끝까지 가게 한다(Read Cursor 저장, Opened At 기록).
 */
async function requestApi<Response>(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} 실패: ${response.status}`);
  return (response.status === 204 ? undefined : await response.json()) as Response;
}

export const apiClient = {
  listFeeds: () => requestApi<FeedSummary[]>('/feeds'),

  /** 이 id보다 새로운 Entry를 오래된 것부터. */
  listEntriesAfter: (feedId: string, afterEntryId: number, limit: number) =>
    requestApi<EntryView[]>(`/feeds/${encodeURIComponent(feedId)}/entries?after=${afterEntryId}&limit=${limit}`),

  /** 이 id보다 오래된 Entry 중 가장 가까운 것들을 오래된 것부터. */
  listEntriesBefore: (feedId: string, beforeEntryId: number, limit: number) =>
    requestApi<EntryView[]>(`/feeds/${encodeURIComponent(feedId)}/entries?before=${beforeEntryId}&limit=${limit}`),

  /** Ranked Feed의 최신 Rank Snapshot과 직전 대비 변동. */
  getRankSnapshot: (feedId: string) => requestApi<RankSnapshotView>(`/feeds/${encodeURIComponent(feedId)}/rank-snapshot`),

  moveReadCursor: (feedId: string, entryId: number) =>
    requestApi<{ readCursorEntryId: number }>(`/feeds/${encodeURIComponent(feedId)}/read-cursor`, {
      method: 'PUT',
      body: JSON.stringify({ entryId } satisfies MoveReadCursorRequest),
      keepalive: true,
    }),

  markOpened: (entryId: number) => requestApi<void>(`/entries/${entryId}/open`, { method: 'POST', keepalive: true }),

  setBookmarked: (entryId: number, bookmarked: boolean) =>
    requestApi<void>(`/entries/${entryId}/bookmark`, { method: bookmarked ? 'PUT' : 'DELETE' }),

  listBookmarks: () => requestApi<BookmarkedEntryView[]>('/bookmarks'),
};
