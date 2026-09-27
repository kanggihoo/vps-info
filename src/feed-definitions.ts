/**
 * Feed 선언. Feed는 여기서 만든다(ADR-0004).
 *
 * 수집기가 시작할 때 DB에 없는 Feed만 넣는다. `intervalMinutes`는 그때 한 번만 쓰이고,
 * 이후 주기는 DB의 `feed.interval_minutes`를 바꿔서 조정한다.
 * `id`는 한 번 정하면 바꾸지 않는다. 바꾸면 기존 Entry와 연결이 끊긴 새 Feed가 된다.
 */
import type { HandlerName, HandlerParams } from './collector/handlers/index.ts';

type FeedDefinitionUsing<Name extends HandlerName> = {
  id: string;
  /** 화면에 보이는 이름. */
  title: string;
  handler: Name;
  /** Handler에 넘기는 파라미터. `handler`에 맞지 않으면 컴파일 오류가 난다. */
  params: HandlerParams<Name>;
  /** 처음 만들 때의 수집 주기(분). */
  intervalMinutes: number;
  /** 새 글이 원래 드문 Feed라서 0건을 실패로 보지 않을지 여부(ADR-0005). */
  allowEmpty?: boolean;
};

/** Feed 하나의 정의. `handler` 값에 따라 `params` 타입이 정해진다. */
export type FeedDefinition = { [Name in HandlerName]: FeedDefinitionUsing<Name> }[HandlerName];

export const feedDefinitions: FeedDefinition[] = [
  { id: 'hn-best', title: 'Hacker News Best', handler: 'hackernews', params: { section: 'best' }, intervalMinutes: 60 },
  { id: 'hn-show', title: 'Show HN', handler: 'hackernews', params: { section: 'show' }, intervalMinutes: 60 },
];
