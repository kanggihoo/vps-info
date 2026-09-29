/**
 * API 응답 타입. 서버(`apps/backend`)와 화면(`apps/web`)이 함께 import해서 두 쪽의 계약이 어긋나지 않게 한다.
 * 날짜는 JSON으로 오가므로 ISO 8601 문자열이다.
 */

/** Feed 종류(ADR-0009). Stream Feed는 시간순 타임라인, Ranked Feed는 순위표로 본다. */
export type FeedKind = 'stream' | 'ranked';

/** Feed Group의 축 하나(기간, 언어, 구역). `values`의 순서가 화면의 탭·선택지 순서다(ADR-0010). */
export type FeedGroupAxis = {
  key: string;
  /** 화면에 보이는 축 이름(`기간`). */
  title: string;
  values: { value: string; title: string }[];
};

/**
 * `GET /api/feed-groups`의 항목 하나. 한 정보원의 여러 Feed를 화면에서 한 줄로 묶는다(ADR-0010).
 * 첫 번째 축은 탭으로, 나머지 축은 드롭다운으로 고른다.
 */
export type FeedGroupView = {
  id: string;
  /** 왼쪽 목록에 보이는 이름(`Trendshift`). */
  title: string;
  axes: FeedGroupAxis[];
};

/** Feed가 어느 Feed Group의 어느 변형인지. `variant`는 축 key → 값이다(`{ period: 'weekly', language: 'all' }`). */
export type FeedGroupMembership = {
  id: string;
  variant: Record<string, string>;
};

/** `GET /api/feeds`의 항목 하나. */
export type FeedSummary = {
  id: string;
  /** 화면에 보이는 이름. 코드의 Feed 선언에서 온다. Group에 든 Feed도 변형까지 적은 전체 이름이다. */
  title: string;
  kind: FeedKind;
  /** 속한 Feed Group. 없으면 `null`이고 왼쪽 목록에 혼자 한 줄로 보인다. */
  group: FeedGroupMembership | null;
  /** Read Cursor보다 새로운 Entry 수. Ranked Feed는 Read Cursor가 없어서 항상 0이다. */
  unreadCount: number;
  /** 최신 Rank Snapshot의 NEW 수. 열어 봐도 줄지 않고 다음 수집 때 바뀐다. Stream Feed는 0이다. */
  rankSnapshotNewCount: number;
  /** Read Cursor. 마지막으로 지나간 Entry의 id. 한 번도 읽지 않았으면 `null`. */
  readCursorEntryId: number | null;
  /** 이 Feed에서 가장 최근에 저장된 Entry의 id. Entry가 없으면 `null`. */
  latestEntryId: number | null;
  /** 연속 실패 수. 0보다 크면 화면에 경고를 띄운다(ADR-0005). */
  consecutiveFailures: number;
  nextRunAt: string;
};

/**
 * 화면에 보내는 Entry. 정보원 원본(`raw`)은 포함하지 않는다(ADR-0003).
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

/**
 * Rank Snapshot 안에서 Entry가 직전과 비교해 어떤 상태인지(ADR-0009).
 * - `new`: 직전에 없었고 이번에 처음 발견했다
 * - `reentered`: 직전에 없었지만 예전에 발견한 적이 있다
 * - `stayed`: 직전에도 있었다. 순위 변동은 `previousRank`와 비교한다
 */
export type RankMovement = 'new' | 'reentered' | 'stayed';

/** 최신 Rank Snapshot의 한 줄. */
export type RankedEntryView = EntryView & {
  rank: number;
  /** 이번 수집의 수치(HN의 `score`, `commentCount` 등). */
  metrics: Record<string, unknown> | null;
  /** 직전 Snapshot의 순위. 직전에 없었으면 `null`. */
  previousRank: number | null;
  previousMetrics: Record<string, unknown> | null;
  /** 직전 Snapshot이 없으면(첫 Snapshot) NEW가 아닌 Entry는 `null`이다. */
  movement: RankMovement | null;
};

/** 직전 Snapshot에는 있었는데 최신 Snapshot에서 빠진 Entry. */
export type DroppedEntryView = EntryView & { previousRank: number };

/** `GET /api/feeds/:feedId/rank-snapshot`의 응답. */
export type RankSnapshotView = {
  /** 최신 Snapshot을 만든 수집의 시작 시각. 아직 Snapshot이 없으면 `null`. */
  takenAt: string | null;
  /** 비교한 직전 Snapshot의 시각. 없으면 `null`. */
  previousTakenAt: string | null;
  /** 순위순. */
  entries: RankedEntryView[];
  /** 직전 순위순. */
  droppedEntries: DroppedEntryView[];
};

/** `GET /api/bookmarks`의 항목 하나. 여러 Feed가 섞이므로 Feed 이름을 함께 준다. */
export type BookmarkedEntryView = EntryView & { feedTitle: string };

/** `PUT /api/feeds/:feedId/read-cursor`의 요청 본문. */
export type MoveReadCursorRequest = {
  /** 화면에서 마지막으로 지나간 Entry의 id. 현재 커서보다 작으면 무시된다. */
  entryId: number;
};
