/**
 * Product Hunt 공식 GraphQL API(v2)로 이번 주·달·해에 Featured에 오른 제품을 추천수 순으로 가져오는 Handler.
 * 사이트의 "Best of Product Hunt" 리더보드와 같은 순서다(`featured: true`, `order: VOTES`).
 * 앱의 API Key·Secret으로 토큰(client credentials)을 받아 쓰고, 둘은 환경변수로 받는다.
 * 이 API는 비상업 용도만 허용한다. 화면에 Product Hunt 출처를 남긴다.
 */
import { defineHandler } from './define-handler.ts';

const TOKEN_URL = 'https://api.producthunt.com/v2/oauth/token';
const GRAPHQL_URL = 'https://api.producthunt.com/v2/api/graphql';

/** `rankLimit`이 없을 때 가져올 제품 수. 운영에서는 DB `feed.rank_limit`으로 정한다(ADR-0009). */
const DEFAULT_POST_COUNT = 30;

/** API는 `first`를 20으로 제한해서 한 페이지에 최대 20개만 준다. 모자라면 커서로 다음 페이지를 받는다. */
const MAX_PAGES = 5;

/** 복잡도 한도(15분에 6250점)를 아끼려고 화면에 쓰는 필드만 요청한다. */
const POSTS_QUERY = `query ($postedAfter: DateTime!, $after: String) {
  posts(featured: true, order: VOTES, postedAfter: $postedAfter, first: 20, after: $after) {
    pageInfo { endCursor hasNextPage }
    edges { node { id name tagline slug url website createdAt votesCount commentsCount } }
  }
}`;

/** 질의 응답 항목 중 쓰는 필드. */
type ProductHuntPost = {
  id: string;
  name: string;
  tagline?: string;
  /** Product Hunt의 제품 페이지. */
  url: string;
  createdAt?: string;
  votesCount?: number;
  commentsCount?: number;
};

/** 질의 응답의 한 페이지. */
type PostsPage = {
  pageInfo: { endCursor: string; hasNextPage: boolean };
  edges: { node: ProductHuntPost }[];
};

export type ProductHuntPeriod = 'weekly' | 'monthly' | 'yearly';

/**
 * 기간이 시작되는 시각. Product Hunt의 하루는 미국 태평양 시간 0시에 시작하고 제품은 0시 1분쯤 올라온다.
 * 여름·겨울 모두 UTC 07:00 이후라서 UTC 07:00을 경계로 쓴다. 주는 월요일에 시작한다.
 */
export function periodStart(period: ProductHuntPeriod, now: Date): Date {
  const pacific = new Date(now.getTime() - 7 * 60 * 60 * 1000);
  const [year, month] = [pacific.getUTCFullYear(), pacific.getUTCMonth()];
  const day = period === 'weekly' ? pacific.getUTCDate() - ((pacific.getUTCDay() + 6) % 7) : 1;
  return new Date(Date.UTC(year, period === 'yearly' ? 0 : month, day, 7));
}

export const producthuntHandler = defineHandler<{ period: ProductHuntPeriod }>({
  async fetchEntries({ period }, { httpClient, rankLimit }) {
    const { PRODUCT_HUNT_CLIENT_ID: clientId, PRODUCT_HUNT_CLIENT_SECRET: clientSecret } = process.env;
    if (!clientId || !clientSecret) throw new Error('PRODUCT_HUNT_CLIENT_ID, PRODUCT_HUNT_CLIENT_SECRET 환경변수가 없습니다');

    // 토큰은 수집 주기(수 시간)마다 한 번 받는다. 캐시하지 않는다.
    const { access_token: token } = await httpClient<{ access_token: string }>(TOKEN_URL, {
      method: 'POST',
      body: { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' },
    });
    const limit = rankLimit ?? DEFAULT_POST_COUNT;
    const postedAfter = periodStart(period, new Date()).toISOString();
    const posts: ProductHuntPost[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES && posts.length < limit; page++) {
      const { data } = await httpClient<{ data: { posts: PostsPage } }>(GRAPHQL_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { query: POSTS_QUERY, variables: { postedAfter, after } },
      });
      posts.push(...data.posts.edges.map(({ node }) => node));
      if (!data.posts.pageInfo.hasNextPage) break;
      after = data.posts.pageInfo.endCursor;
    }
    return posts.slice(0, limit).map((node) => ({
      url: node.url.split('?')[0],  // API가 붙이는 utm 추적 파라미터를 뗀다
      title: node.name,
      externalId: node.id,
      publishedAt: node.createdAt ? new Date(node.createdAt) : undefined,
      summary: node.tagline,
      metrics: { score: node.votesCount, commentCount: node.commentsCount },
      raw: node,
    }));
  },
});
