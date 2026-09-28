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
  { id: 'geeknews', title: 'GeekNews', handler: 'rss', params: { url: 'https://news.hada.io/rss/news' }, intervalMinutes: 60 },
  { id: 'producthunt', title: 'Product Hunt', handler: 'rss', params: { url: 'https://www.producthunt.com/feed' }, intervalMinutes: 180 },
  { id: 'techcrunch', title: 'TechCrunch', handler: 'rss', params: { url: 'https://techcrunch.com/feed/' }, intervalMinutes: 60 },
  { id: 'openai-news', title: 'OpenAI News', handler: 'rss', params: { url: 'https://openai.com/news/rss.xml' }, intervalMinutes: 360 },
  {
    id: 'claude-code-releases',
    title: 'Claude Code 릴리스',
    handler: 'rss',
    params: { url: 'https://github.com/anthropics/claude-code/releases.atom' },
    intervalMinutes: 360,
  },
  { id: 'openrouter-models', title: 'OpenRouter 새 모델', handler: 'openrouter-models', params: {}, intervalMinutes: 360 },
  { id: 'hf-papers-weekly', title: 'Hugging Face 주간 인기 논문', handler: 'huggingface-papers', params: { period: 'week' }, intervalMinutes: 720 },
  { id: 'hellogithub', title: 'HelloGitHub', handler: 'hellogithub', params: {}, intervalMinutes: 1440 },
  { id: 'devto-top-week', title: 'dev.to 주간 인기글', handler: 'devto', params: { topDays: 7 }, intervalMinutes: 360 },
  { id: 'github-trending-daily', title: 'GitHub Trending', handler: 'github-trending', params: { since: 'daily' }, intervalMinutes: 360 },
  { id: 'trendshift', title: 'Trendshift', handler: 'trendshift', params: {}, intervalMinutes: 360 },
  { id: 'indiehackers-top-week', title: 'Indie Hackers 주간 인기글', handler: 'indiehackers', params: {}, intervalMinutes: 720 },
  { id: 'anthropic-news', title: 'Anthropic News', handler: 'anthropic-news', params: {}, intervalMinutes: 360 },
];
