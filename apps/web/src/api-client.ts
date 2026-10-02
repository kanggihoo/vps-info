/**
 * 화면에서 부르는 API 모음. 브라우저의 HTTP 호출은 모두 이 파일을 거친다.
 * 요청 경로는 상대 `/api`라서 운영(같은 서버)과 로컬(Vite 프록시)에서 똑같이 동작한다.
 */
import type {
  AdminAttemptPage,
  AdminOverview,
  DeepLUsageView,
  UpdateAdminFeedRequest,
  ApiErrorBody,
  BookmarkedEntryView,
  EntryConversationTurnRequest,
  EntryConversationTurnView,
  EntryView,
  FeedGroupView,
  FeedNavigationOrder,
  FeedSummary,
  FeedTitledEntryView,
  LlmModelsView,
  MoveReadCursorRequest,
  RankSnapshotView,
  ReaderView,
  TranslationView,
} from '@trendboda/api-types';

/** 실패 응답. 서버가 실패 이유(`reason`)를 주면 화면이 안내 문구를 고를 때 쓴다. */
export class ApiError extends Error {
  readonly status: number;
  readonly reason: ApiErrorBody['reason'];

  constructor(message: string, status: number, reason: ApiErrorBody['reason']) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

/** 실패 응답의 안내 문구와 이유를 읽는다. JSON이 아니면 기본 안내를 쓴다. */
async function readFailureBody(response: Response): Promise<Partial<ApiErrorBody>> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? body as Partial<ApiErrorBody> : {};
  } catch {
    return {};
  }
}

/**
 * JSON API를 호출한다. 실패 응답이면 `ApiError`를 던진다.
 *
 * @param keepalive - 페이지를 떠나는 중에도 요청이 끝까지 가게 한다(Read Cursor 저장, Opened At 기록).
 */
async function requestApi<Response>(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
  });
  if (!response.ok) {
    const failure = await readFailureBody(response);
    throw new ApiError(failure.message ?? `${init.method ?? 'GET'} ${path} 실패: ${response.status}`, response.status, failure.reason);
  }
  return (response.status === 204 ? undefined : await response.json()) as Response;
}

export const apiClient = {
  /** 수집기 응답과 Feed 운영 값을 함께 받는다(ADR-0017). */
  getAdminOverview: () => requestApi<AdminOverview>('/admin/overview'),
  /** Feed 주기·일시정지를 변경한다. */
  updateAdminFeed: (feedId: string, changes: UpdateAdminFeedRequest) => requestApi<void>(`/admin/feeds/${encodeURIComponent(feedId)}`, {
    method: 'PATCH', body: JSON.stringify(changes),
  }),
  /** 수집은 collector에 맡긴다. */
  requestFeedFetch: (feedId: string) => requestApi<{ message: string }>(`/admin/feeds/${encodeURIComponent(feedId)}/fetch`, { method: 'POST' }),
  /** 한 Feed의 수집 이력 페이지. */
  listAdminAttempts: (feedId: string, status?: 'success' | 'failed', before?: number) => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (before !== undefined) query.set('before', String(before));
    return requestApi<AdminAttemptPage>(`/admin/feeds/${encodeURIComponent(feedId)}/attempts?${query}`);
  },
  /** 서버의 DeepL 키로 조회한 계정·키별 사용량. */
  getDeepLUsage: () => requestApi<DeepLUsageView>('/admin/deepl/usage'),
  /** 개인용 공통 Feed 배치(ADR-0016). */
  getFeedNavigationOrder: () => requestApi<FeedNavigationOrder>('/feed-navigation-order'),
  /** 두 구역의 전체 순서를 원자적으로 교체한다. */
  saveFeedNavigationOrder: (order: FeedNavigationOrder) => requestApi<FeedNavigationOrder>('/feed-navigation-order', { method: 'PUT', body: JSON.stringify(order) }),
  listFeeds: () => requestApi<FeedSummary[]>('/feeds'),

  /** Feed Group 선언(ADR-0010). 코드에만 있는 값이라 배포 사이에는 바뀌지 않는다. */
  listFeedGroups: () => requestApi<FeedGroupView[]>('/feed-groups'),

  /** 이 id보다 새로운 Entry를 오래된 것부터. */
  listEntriesAfter: (feedId: string, afterEntryId: number, limit: number) =>
    requestApi<EntryView[]>(`/feeds/${encodeURIComponent(feedId)}/entries?after=${afterEntryId}&limit=${limit}`),

  /** 이 id보다 오래된 Entry 중 가장 가까운 것들을 오래된 것부터. */
  listEntriesBefore: (feedId: string, beforeEntryId: number, limit: number) =>
    requestApi<EntryView[]>(`/feeds/${encodeURIComponent(feedId)}/entries?before=${beforeEntryId}&limit=${limit}`),

  /** Entry 하나와 Feed 이름. 화면 주소로 Entry를 바로 펼칠 때 쓴다. */
  getEntry: (entryId: number) => requestApi<FeedTitledEntryView>(`/entries/${entryId}`),

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

  /** 원문 페이지에서 뽑은 본문(ADR-0011). 저장하지 않으므로 부를 때마다 서버가 원문을 다시 가져온다. */
  readOriginal: (entryId: number, signal?: AbortSignal) => requestApi<ReaderView>(`/entries/${entryId}/reader`, { signal }),

  /** 제목·요약의 한국어 번역. 이미 번역이 있으면 서버가 DeepL을 부르지 않고 저장된 것을 준다. */
  translateEntry: (entryId: number) => requestApi<TranslationView>(`/entries/${entryId}/translation`, { method: 'POST' }),

  /** Entry 대화에 쓸 수 있는 엔진과 모델(ADR-0015). */
  listLlmModels: () => requestApi<LlmModelsView>('/llm/models'),

  /** Entry 대화 한 턴. 답이 다 만들어질 때까지 기다리므로 수십 초 걸릴 수 있다. */
  sendConversationTurn: (entryId: number, turn: EntryConversationTurnRequest) =>
    requestApi<EntryConversationTurnView>(`/entries/${entryId}/conversation`, { method: 'POST', body: JSON.stringify(turn) }),
};
