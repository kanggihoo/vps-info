/**
 * Feed 선언. Feed는 여기서 만든다(ADR-0004).
 *
 * 수집기가 시작할 때 DB에 없는 Feed만 넣는다. `intervalMinutes`와 `rankLimit`은 그때 한 번만 쓰이고,
 * 이후에는 DB의 `feed.interval_minutes`, `feed.rank_limit`을 바꿔서 조정한다(ADR-0009).
 * `id`는 한 번 정하면 바꾸지 않는다. 바꾸면 기존 Entry와 연결이 끊긴 새 Feed가 된다.
 *
 * 한 정보원의 여러 Feed는 Feed Group으로 묶어 화면 왼쪽에 한 줄로 보인다(ADR-0010). 묶음은 화면에만 쓰이고 수집과는 무관하다.
 */
import type { FeedGroupMembership, FeedGroupView } from '@trendboda/api-types';
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
  /**
   * 게시일 하한(`YYYY-MM-DD`, UTC). 이보다 먼저 게시된 항목은 Entry로 저장하지 않는다.
   * 과거 글 전체를 한꺼번에 주는 정보원에만 쓴다. 게시 시각이 없는 항목은 거르지 않는다(CONTEXT.md First Seen).
   */
  publishedSince?: string;
  /** 속한 Feed Group과 축 위의 값. `feedGroupDefinitions`에 있는 Group이어야 한다(ADR-0010). */
  group?: FeedGroupMembership;
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
 * 원티드 개발 직군(518)의 직무를 직무군으로 묶은 것. 직무군마다 Stream Feed 하나가 된다.
 * 직무 ID는 원티드 직군·직무 선택 창의 값이고, 이름은 `wanted-handler.ts`의 `JOB_NAMES`에 있다.
 * 한 공고가 두 직무군에 걸리면 Feed마다 Entry가 따로 생긴다(ADR-0002). `wanted-backend`는 예전 Feed id를 이어 쓴다.
 */
const wantedRoleGroups = [
  { role: 'backend', title: '백엔드', feedId: 'wanted-backend', jobIds: [872, 10110, 660, 895, 899, 10231] },
  { role: 'web', title: '웹·프론트', feedId: 'wanted-web', jobIds: [873, 669] },
  { role: 'ai-data', title: 'AI·데이터', feedId: 'wanted-ai-data', jobIds: [1634, 655, 1025, 1024] },
  { role: 'infra', title: '인프라·운영', feedId: 'wanted-infra', jobIds: [674, 665] },
  { role: 'qa-manager', title: 'QA·매니지먼트', feedId: 'wanted-qa-manager', jobIds: [676, 877] },
  { role: 'app', title: '앱', feedId: 'wanted-app', jobIds: [677, 678, 10111] },
] as const;

/** 원티드 직무군마다 Stream Feed 하나를 만든다. */
function makeWantedFeedDefinitions(): FeedDefinition[] {
  return wantedRoleGroups.map(
    ({ role, title, feedId, jobIds }): FeedDefinition => ({
      id: feedId,
      title: `원티드 신입 · ${title}`,
      handler: 'wanted',
      params: { jobIds: [...jobIds] },
      // 공고는 천천히 올라오고, 매번 열린 공고 전체를 받으므로 주기를 늘려도 놓치지 않는다.
      intervalMinutes: 720,
      group: { id: 'wanted', variant: { role } },
    }),
  );
}

/**
 * Feed Group 선언. 왼쪽 목록에서는 첫 번째 Feed가 있던 자리에 한 줄로 보인다.
 * 첫 번째 축은 가운데 위쪽 탭으로, 나머지 축은 드롭다운으로 고른다.
 */
export const feedGroupDefinitions: FeedGroupView[] = [
  {
    id: 'hacker-news',
    title: 'Hacker News',
    axes: [
      {
        key: 'section',
        title: '구역',
        values: [
          { value: 'best', title: 'Best' },
          { value: 'show', title: 'Show' },
        ],
      },
    ],
  },
  {
    id: 'producthunt-top',
    title: 'Product Hunt 인기',
    axes: [
      {
        key: 'period',
        title: '기간',
        values: [
          { value: 'weekly', title: '주간' },
          { value: 'monthly', title: '월간' },
          { value: 'yearly', title: '연간' },
        ],
      },
    ],
  },
  {
    id: 'trendshift',
    title: 'Trendshift',
    axes: [
      {
        key: 'period',
        title: '기간',
        values: [
          { value: 'weekly', title: '주간' },
          { value: 'monthly', title: '월간' },
          { value: 'yearly', title: '연간' },
        ],
      },
      {
        key: 'language',
        title: '언어',
        values: [
          { value: 'all', title: '전체 언어' },
          { value: 'typescript', title: 'TypeScript' },
          { value: 'python', title: 'Python' },
        ],
      },
    ],
  },
  {
    id: 'wanted',
    title: '원티드 신입',
    axes: [
      {
        key: 'role',
        title: '직무군',
        values: wantedRoleGroups.map(({ role, title }) => ({ value: role, title })),
      },
    ],
  },
];

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
        group: { id: 'trendshift', variant: { period, language: language?.toLowerCase() ?? 'all' } },
      }),
    ),
  );
}

/** Product Hunt 리더보드의 기간과 처음 수집 주기(분). 일간은 수집하지 않는다. */
const productHuntPeriods = [
  { period: 'weekly', title: '주간', intervalMinutes: 360 },
  { period: 'monthly', title: '월간', intervalMinutes: 720 },
  { period: 'yearly', title: '연간', intervalMinutes: 1440 },
] as const;

/** Product Hunt의 기간마다 Ranked Feed 하나를 만든다. 이번 주·달·해에 Featured에 오른 제품의 추천수 순위다. */
function makeProductHuntFeedDefinitions(): FeedDefinition[] {
  return productHuntPeriods.map(
    ({ period, title, intervalMinutes }): FeedDefinition => ({
      id: `producthunt-${period}`,
      title: `Product Hunt ${title}`,
      handler: 'producthunt',
      params: { period },
      intervalMinutes,
      kind: 'ranked',
      rankLimit: 30,
      group: { id: 'producthunt-top', variant: { period } },
    }),
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
    group: { id: 'hacker-news', variant: { section: 'best' } },
  },
  {
    id: 'hn-show',
    title: 'Show HN',
    handler: 'hackernews',
    params: { section: 'show' },
    intervalMinutes: 360,
    kind: 'ranked',
    rankLimit: 60,
    group: { id: 'hacker-news', variant: { section: 'show' } },
  },
  { id: 'geeknews', title: 'GeekNews', handler: 'rss', params: { url: 'https://news.hada.io/rss/news' }, intervalMinutes: 60 },
  ...makeProductHuntFeedDefinitions(),
  { id: 'producthunt', title: 'Product Hunt', handler: 'rss', params: { url: 'https://www.producthunt.com/feed' }, intervalMinutes: 180 },
  { id: 'techcrunch', title: 'TechCrunch', handler: 'rss', params: { url: 'https://techcrunch.com/feed/' }, intervalMinutes: 60 },
  {
    id: 'openai-news',
    title: 'OpenAI News',
    handler: 'rss',
    params: { url: 'https://openai.com/news/rss.xml' },
    intervalMinutes: 360,
    // RSS에 2015년부터의 글 전체가 들어 있다.
    publishedSince: '2026-01-01',
  },
  {
    id: 'claude-code-releases',
    title: 'Claude Code 릴리스',
    handler: 'rss',
    params: { url: 'https://github.com/anthropics/claude-code/releases.atom' },
    intervalMinutes: 360,
  },
  {
    id: 'openrouter-models',
    title: 'OpenRouter 새 모델',
    handler: 'openrouter-models',
    params: {},
    intervalMinutes: 360,
    // API가 매번 등록된 모델 전체를 준다. 게시 시각은 모델이 OpenRouter에 추가된 날이다.
    publishedSince: '2026-01-01',
  },
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
  ...makeWantedFeedDefinitions(),
  { id: 'jumpit-backend', title: '점핏 백엔드 신입', handler: 'jumpit', params: {}, intervalMinutes: 360 },
  { id: 'saramin-backend', title: '사람인 백엔드 신입', handler: 'saramin', params: {}, intervalMinutes: 360 },
  { id: 'linkareer-backend', title: '링커리어 백엔드 신입', handler: 'linkareer', params: {}, intervalMinutes: 360 },
];
