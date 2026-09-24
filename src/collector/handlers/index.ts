/**
 * Handler 등록 목록(ADR-0009). 새 Handler는 여기에 한 줄을 추가해야 쓸 수 있다.
 * 디렉터리를 스캔하지 않는 이유는 Feed 선언의 파라미터를 타입으로 검사하기 위해서다.
 */
import { hackernewsHandler } from './hackernews-handler.ts';
import { rssHandler } from './rss-handler.ts';

export const handlers = {
  rss: rssHandler,
  hackernews: hackernewsHandler,
};

/** 등록된 Handler 이름. Feed 선언의 `handler` 값이 된다. */
export type HandlerName = keyof typeof handlers;

/** 이름으로 Handler의 파라미터 타입을 꺼낸다. */
export type HandlerParams<Name extends HandlerName> = Parameters<(typeof handlers)[Name]['fetchEntries']>[0];
