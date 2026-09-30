/**
 * Handler 등록 목록(ADR-0006). 새 Handler는 여기에 한 줄을 추가해야 쓸 수 있다.
 * 디렉터리를 스캔하지 않는 이유는 Feed 선언의 파라미터를 타입으로 검사하기 위해서다.
 */
import { anthropicNewsHandler } from './anthropic-news-handler.ts';
import { devtoHandler } from './devto-handler.ts';
import { hackernewsHandler } from './hackernews-handler.ts';
import { hellogithubHandler } from './hellogithub-handler.ts';
import { huggingfacePapersHandler } from './huggingface-papers-handler.ts';
import { indiehackersHandler } from './indiehackers-handler.ts';
import { jumpitHandler } from './jumpit-handler.ts';
import { linkareerHandler } from './linkareer-handler.ts';
import { openrouterModelsHandler } from './openrouter-models-handler.ts';
import { rssHandler } from './rss-handler.ts';
import { saraminHandler } from './saramin-handler.ts';
import { trendshiftHandler } from './trendshift-handler.ts';
import { wantedHandler } from './wanted-handler.ts';

export const handlers = {
  rss: rssHandler,
  hackernews: hackernewsHandler,
  'openrouter-models': openrouterModelsHandler,
  'huggingface-papers': huggingfacePapersHandler,
  hellogithub: hellogithubHandler,
  devto: devtoHandler,
  trendshift: trendshiftHandler,
  indiehackers: indiehackersHandler,
  'anthropic-news': anthropicNewsHandler,
  wanted: wantedHandler,
  jumpit: jumpitHandler,
  saramin: saraminHandler,
  linkareer: linkareerHandler,
};

/** 등록된 Handler 이름. Feed 선언의 `handler` 값이 된다. */
export type HandlerName = keyof typeof handlers;

/** 이름으로 Handler의 파라미터 타입을 꺼낸다. */
export type HandlerParams<Name extends HandlerName> = Parameters<(typeof handlers)[Name]['fetchEntries']>[0];
