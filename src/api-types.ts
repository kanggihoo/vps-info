/**
 * API 응답 타입. 서버(`src/server`)와 화면(`web/`)이 함께 import해서 두 쪽의 계약이 어긋나지 않게 한다.
 * 날짜는 JSON으로 오가므로 ISO 8601 문자열이다.
 */

/** `GET /api/feeds`의 항목 하나. */
export type FeedSummary = {
  id: string;
  /** 화면에 보이는 이름. 코드의 Feed 선언에서 온다. */
  title: string;
  /** Read Cursor보다 새로운 Entry 수. */
  unreadCount: number;
  /** Read Cursor. 마지막으로 지나간 Entry의 id. 한 번도 읽지 않았으면 `null`. */
  readCursorEntryId: number | null;
  /** 이 Feed에서 가장 최근에 저장된 Entry의 id. Entry가 없으면 `null`. */
  latestEntryId: number | null;
  /** 연속 실패 수. 0보다 크면 화면에 경고를 띄운다(ADR-0008). */
  consecutiveFailures: number;
  nextRunAt: string;
};

/**
 * 화면에 보내는 Entry. 정보원 원본(`raw`)은 포함하지 않는다(ADR-0006).
 */
export type EntryView = {
  id: number;
  feedId: string;
  url: string;
  title: string;
  publishedAt: string | null;
  author: string | null;
  summary: string | null;
  /** Feed마다 다른 필드(HN의 `score`, `commentCount`, `commentsUrl` 등). */
  extra: Record<string, unknown> | null;
  firstSeenAt: string;
  openedAt: string | null;
  bookmarkedAt: string | null;
};

/** `GET /api/bookmarks`의 항목 하나. 여러 Feed가 섞이므로 Feed 이름을 함께 준다. */
export type BookmarkedEntryView = EntryView & { feedTitle: string };

/** `PUT /api/feeds/:feedId/read-cursor`의 요청 본문. */
export type MoveReadCursorRequest = {
  /** 화면에서 마지막으로 지나간 Entry의 id. 현재 커서보다 작으면 무시된다. */
  entryId: number;
};
