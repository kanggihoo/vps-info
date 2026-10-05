/**
 * API 응답 타입. 서버(`apps/backend`)와 화면(`apps/web`)이 함께 import해서 두 쪽의 계약이 어긋나지 않게 한다.
 * 날짜는 JSON으로 오가므로 ISO 8601 문자열이다.
 */

/** Feed 종류(ADR-0009). Stream Feed는 시간순 타임라인, Ranked Feed는 순위표로 본다. */
export type FeedKind = 'stream' | 'ranked';

/** Feed Navigation Order의 한 줄. Feed Group은 통째로 배치한다(ADR-0016). */
export type FeedNavigationItem = { kind: 'feed' | 'group'; id: string };

/** 조회·수정 API가 공유하는 개인용 공통 순서(ADR-0016). 배열 순서가 화면 순서다. */
export type FeedNavigationOrder = { stream: FeedNavigationItem[]; ranked: FeedNavigationItem[] };

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
  /** 제목의 한국어 번역. 번역 버튼을 누른 적이 없으면 `null`(ADR-0011). */
  translatedTitle: string | null;
  /** 요약의 한국어 번역. 번역하지 않았거나 원문 요약이 없으면 `null`. */
  translatedSummary: string | null;
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

/** Feed 이름을 함께 준 Entry. 여러 Feed가 섞이거나(Bookmark 목록) Entry 하나만 조회할 때 쓴다. */
export type FeedTitledEntryView = EntryView & { feedTitle: string };

/** `GET /api/bookmarks`의 항목 하나. */
export type BookmarkedEntryView = FeedTitledEntryView;

/** `GET /api/entries/:entryId/reader`의 성공 응답. 원문 페이지에서 뽑은 본문이며 저장하지 않는다(ADR-0011). */
export type ReaderView = {
  /** 원문 페이지의 제목. 페이지에서 찾지 못하면 `null`. */
  title: string | null;
  /** 본문 Markdown. HTML이 섞여 있을 수 있어 화면이 허용 목록으로 걸러 그린다. */
  markdown: string;
  siteName: string | null;
  byline: string | null;
  /**
   * 정보원이 공고에 준 마감일(`YYYY-MM-DD`). 채용 공고에서 마감이 있을 때만 준다.
   * 서버가 Entry의 `extra.deadline`에도 저장하므로 다음부터는 목록 카드에 보인다(ADR-0013).
   */
  deadline?: string;
};

/**
 * 원문 읽기 실패 이유(502 응답의 `reason`).
 * - `upstream-status`: 원문 페이지가 200이 아닌 상태로 응답했다
 * - `timeout`: 15초 안에 받지 못했다
 * - `too-large`: 5MB를 넘었다
 * - `not-html`: HTML이 아니다(PDF 등)
 * - `unreachable`: 연결하지 못했다(주소 오류, 내부망 주소 등)
 * - `empty`: 받았지만 뽑은 본문이 비었다
 */
export type ReaderFailureReason = 'upstream-status' | 'timeout' | 'too-large' | 'not-html' | 'unreachable' | 'empty';

/** `POST /api/entries/:entryId/translation`의 성공 응답. */
export type TranslationView = {
  translatedTitle: string;
  translatedSummary: string | null;
};

/**
 * 번역 실패 이유(503·502 응답의 `reason`).
 * - `translation-disabled`: 서버에 DeepL 키가 없다
 * - `translation-auth`: DeepL이 키를 거부했다
 * - `translation-quota`: 이번 달 DeepL 한도를 다 썼다
 * - `translation-busy`: DeepL에 요청이 몰렸다. 잠시 뒤 다시 시도한다
 * - `translation-failed`: 그 밖의 실패
 */
export type TranslationFailureReason = 'translation-disabled' | 'translation-auth' | 'translation-quota' | 'translation-busy' | 'translation-failed';

/** Entry 대화를 만드는 엔진(ADR-0018). 값은 pi-ai provider id다. Claude·OpenAI는 구독으로, OpenRouter는 API 키로 인증한다. */
export type LlmEngine = 'anthropic' | 'openai' | 'openrouter';

/** 엔진 하나와 고를 수 있는 모델. */
export type LlmEngineView = {
  engine: LlmEngine;
  /** 화면에 보이는 이름(`Claude`). */
  title: string;
  /** 서버에 이 엔진의 인증 정보가 있는지. 없으면 화면에서 고를 수 없다. */
  available: boolean;
  /** `value`는 pi-ai 모델 id, `title`은 화면에 보이는 이름이다. */
  models: { value: string; title: string }[];
};

/** `GET /api/llm/models`의 응답. */
export type LlmModelsView = {
  engines: LlmEngineView[];
};

/** `POST /api/entries/:entryId/conversation`의 요청 본문. 대화 기록은 `llm` 서비스가 메모리에 들고 있다(ADR-0018). */
export type EntryConversationTurnRequest = {
  question: string;
  /** 이어 갈 대화. 첫 질문이면 `null`이고, 그때 Entry와 원문 본문이 함께 들어간다. */
  sessionId: string | null;
  /** 첫 질문에서만 쓴다. 이어 가는 대화는 처음 고른 엔진·모델을 그대로 쓴다. */
  engine: LlmEngine;
  model: string;
  /** 화면이 원문 읽기로 받아 둔 본문 Markdown. 첫 질문에서만 쓰며, 없으면 제목·요약만으로 답한다. */
  original: string | null;
};

/** `POST /api/entries/:entryId/conversation`의 성공 응답. */
export type EntryConversationTurnView = {
  sessionId: string;
  /** 답 Markdown. 화면은 HTML과 이미지를 그리지 않는다(ADR-0015). */
  answer: string;
};

/**
 * `app` 서버가 `llm` 서비스의 `POST /turns`에 보내는 본문. 화면은 쓰지 않는다.
 * Entry의 제목·주소·요약은 화면이 아니라 서버가 DB에서 채운다.
 */
export type LlmTurnRequest = Omit<EntryConversationTurnRequest, 'original'> & {
  /** 첫 질문에서만 있다. */
  entry: { title: string; url: string; summary: string | null; original: string | null } | null;
};

/**
 * Entry 대화 실패 이유(502·503·504 응답의 `reason`).
 * - `llm-disabled`: 서버에 `llm` 서비스 주소가 없다
 * - `llm-unreachable`: `llm` 서비스에 연결하지 못했다
 * - `llm-unavailable`: 고른 엔진의 인증 정보가 없다
 * - `conversation-expired`: `llm` 서비스가 재시작되어 대화 세션이 사라졌다
 * - `llm-timeout`: 답을 제때 받지 못했다
 * - `llm-failed`: 그 밖의 실패(사용 한도 초과 포함)
 */
export type ConversationFailureReason = 'llm-disabled' | 'llm-unreachable' | 'llm-unavailable' | 'conversation-expired' | 'llm-timeout' | 'llm-failed';

/** API 오류 응답 본문. `reason`은 화면이 안내 문구를 고를 때 쓴다. */
export type ApiErrorBody = {
  message: string;
  reason?: ReaderFailureReason | TranslationFailureReason | ConversationFailureReason;
};

/** `PUT /api/feeds/:feedId/read-cursor`의 요청 본문. */
export type MoveReadCursorRequest = {
  /** 화면에서 마지막으로 지나간 Entry의 id. 현재 커서보다 작으면 무시된다. */
  entryId: number;
};

/** 관리자 화면에 보내는 수집 시도. raw나 Entry 본문은 포함하지 않는다(ADR-0017). */
export type AdminFetchAttempt = {
  id: number;
  feedId: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  insertedEntryCount: number | null;
  errorMessage: string | null;
};

/** 운영 값과 최근 수집 상태. wanted는 조회·수동 요청만 지원한다. */
export type AdminFeed = {
  id: string;
  title: string;
  kind: FeedKind;
  wanted: boolean;
  intervalMinutes: number;
  nextRunAt: string;
  paused: boolean;
  manualRequestedAt: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  latestAttempt: AdminFetchAttempt | null;
};

/** 수집기 응답과 현재 실행 상태. stale은 프로세스 종료를 확정하지 않는다. */
export type CollectorStatus = {
  status: 'unknown' | 'alive' | 'stale' | 'stopped';
  lastSeenAt: string | null;
  runningFeedId: string | null;
};

/** 관리자 화면의 10초 갱신 데이터. 외부 연동 조회는 별도로 수행한다. */
export type AdminOverview = { feeds: AdminFeed[]; collector: CollectorStatus };

/** 한 Feed의 이력 페이지. nextBefore가 있으면 그 id 이전을 요청한다. */
export type AdminAttemptPage = { attempts: AdminFetchAttempt[]; nextBefore: number | null };

/** Feed의 운영 값을 변경한다. 원티드에는 사용할 수 없다. */
export type UpdateAdminFeedRequest = { intervalMinutes?: number; paused?: boolean };

/** DeepL 공식 사용량. account와 API key 값을 구분하며 한도 미설정은 null이다. */
export type DeepLUsageView = {
  characterCount: number;
  characterLimit: number | null;
  apiKeyCharacterCount: number | null;
  apiKeyCharacterLimit: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  checkedAt: string;
};
