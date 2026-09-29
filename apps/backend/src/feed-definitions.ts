/**
 * Feed 선언. Feed는 여기서 만든다(ADR-0004).
 *
 * 수집기가 시작할 때 DB에 없는 Feed만 넣는다. `intervalMinutes`와 `rankLimit`은 그때 한 번만 쓰이고,
 * 이후에는 DB의 `feed.interval_minutes`, `feed.rank_limit`을 바꿔서 조정한다(ADR-0009).
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
} & FeedKindDeclaration;

/** Feed 종류(ADR-0009). 생략하면 Stream Feed다. */
type FeedKindDeclaration =
  | { kind?: 'stream' }
  | {
      kind: 'ranked';
      /** 처음 만들 때 가져올 순위 수. 이후에는 DB 값이 원본이다. */
      rankLimit: number;
    };

/** Feed 하나의 정의. `handler` 값에 따라 `params` 타입이 정해진다. */
export type FeedDefinition = { [Name in HandlerName]: FeedDefinitionUsing<Name> }[HandlerName];

/**
 * Trendshift 순위표의 기간과 처음 수집 주기(분). 기간이 길수록 순위가 천천히 바뀌어 덜 자주 가져온다.
 * 일간은 수집하지 않는다(docs/feeds.md).
 */
const trendshiftPeriods = [
  { period: 'weekly', title: '주간', intervalMinutes: 360 },
  { period: 'monthly', title: '월간', intervalMinutes: 720 },
  { period: 'yearly', title: '연간', intervalMinutes: 1440 },
] as const;

/** 수집하는 Trendshift 언어. `undefined`는 전체 언어다. 하나를 더하면 기간 수만큼 Feed가 는다. */
const trendshiftLanguages = [undefined, 'TypeScript', 'Python'] as const;

/** Trendshift의 기간 × 언어마다 Ranked Feed 하나를 만든다. 정보원이 한 번에 25개를 준다. */
function makeTrendshiftFeedDefinitions(): FeedDefinition[] {
  return trendshiftPeriods.flatMap(({ period, title, intervalMinutes }) =>
    trendshiftLanguages.map(
      (language): FeedDefinition => ({
        id: language ? `trendshift-${period}-${language.toLowerCase()}` : `trendshift-${period}`,
        title: language ? `Trendshift ${title} · ${language}` : `Trendshift ${title}`,
        handler: 'trendshift',
        params: { period, language },
        intervalMinutes,
        kind: 'ranked',
        rankLimit: 25,
      }),
    ),
  );
}

export const feedDefinitions: FeedDefinition[] = [
  {
    id: 'hn-best',
    title: 'Hacker News Best',
    handler: 'hackernews',
    params: { section: 'best' },
    intervalMinutes: 360,
    kind: 'ranked',
    rankLimit: 100,
  },
  { id: 'hn-show', title: 'Show HN', handler: 'hackernews', params: { section: 'show' }, intervalMinutes: 360, kind: 'ranked', rankLimit: 60 },
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
  {
    id: 'devto-top-week',
    title: 'dev.to 주간 인기글',
    handler: 'devto',
    params: { topDays: 7 },
    intervalMinutes: 360,
    kind: 'ranked',
    rankLimit: 60,
  },
  ...makeTrendshiftFeedDefinitions(),
  { id: 'indiehackers-top-week', title: 'Indie Hackers 주간 인기글', handler: 'indiehackers', params: {}, intervalMinutes: 720 },
  { id: 'anthropic-news', title: 'Anthropic News', handler: 'anthropic-news', params: {}, intervalMinutes: 360 },
];
