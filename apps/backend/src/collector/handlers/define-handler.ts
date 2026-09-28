/** Handler의 계약(ADR-0006). 모든 Handler는 `defineHandler`로 만든다. */
import type { HttpClient } from '../http-client.ts';

/**
 * Handler가 돌려주는 아직 저장되지 않은 Entry.
 * Dedup Key·First Seen 같은 값은 코어가 저장할 때 채운다.
 */
export type EntryDraft = {
  /** 원문 링크. */
  url: string;
  title: string;
  /** 정보원이 준 고유 식별자. 있으면 Dedup Key가 된다. */
  externalId?: string;
  /** 정보원이 준 게시 시각. 표시용이며 정렬에는 쓰지 않는다. */
  publishedAt?: Date;
  author?: string;
  /** 짧은 평문 요약. HTML이 아니다. */
  summary?: string;
  /** Feed마다 다른 필드 중 화면에 쓰는 것 가운데 변하지 않는 값(토론 링크, 언어 등). */
  extra?: Record<string, unknown>;
  /**
   * 수집할 때마다 바뀌는 수치(점수, 댓글 수 등). Ranked Feed는 Rank Snapshot에 매번 남기고,
   * Entry를 처음 저장할 때는 `extra`에 합쳐 처음 봤을 때의 값으로 둔다(ADR-0009).
   */
  metrics?: Record<string, unknown>;
  /** 정보원 원본. 내부 전용으로 보존한다(ADR-0003). */
  raw: unknown;
};

/** 코어가 Handler에 넘겨주는 것. */
export type HandlerContext = {
  /** 타임아웃·재시도가 설정된 HTTP 클라이언트. Handler는 이것만 쓴다. */
  httpClient: HttpClient;
  /**
   * Ranked Feed가 가져올 순위 수(DB `feed.rank_limit`, ADR-0009). Stream Feed는 비어 있다.
   * 요청 수가 개수에 비례하는 Handler만 쓰면 된다. 코어가 돌려받은 목록을 이 개수로 자른다.
   */
  rankLimit?: number;
};

/**
 * 한 종류의 Feed를 수집하는 방법.
 *
 * @typeParam Params - Feed 선언에서 넘겨주는 파라미터. Feed 선언을 컴파일할 때 검사된다.
 */
export type Handler<Params> = {
  /**
   * 정보원에서 가져온 것을 Entry 목록으로 바꿔 돌려준다. 재시도·저장·0건 판정은 하지 않는다.
   * 정보원이 준 순서를 지킨다. Ranked Feed에서는 이 순서가 Rank다(ADR-0009).
   */
  fetchEntries(params: Params, context: HandlerContext): Promise<EntryDraft[]>;
};

/** Handler를 선언한다. 파라미터 타입을 붙이기 위한 함수이며 실행 시에는 아무 일도 하지 않는다. */
export function defineHandler<Params>(handler: Handler<Params>): Handler<Params> {
  return handler;
}
