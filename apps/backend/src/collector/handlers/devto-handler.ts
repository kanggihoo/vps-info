/** dev.to 공개 API로 최근 N일 동안 반응이 많은 글을 가져오는 Handler. */
import { defineHandler } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

const ARTICLES_URL = 'https://dev.to/api/articles';

/** 한 번에 가져올 글 수. */
const ARTICLE_COUNT = 30;

/** `/api/articles` 응답 항목 중 쓰는 필드. */
type DevtoArticle = {
  id: number;
  title: string;
  url: string;
  description?: string;
  published_at?: string;
  public_reactions_count?: number;
  comments_count?: number;
  tag_list?: string[];
  user?: { name?: string };
};

export const devtoHandler = defineHandler<{ topDays: number }>({
  async fetchEntries({ topDays }, { httpClient }) {
    const articles = await httpClient<DevtoArticle[]>(ARTICLES_URL, { query: { top: topDays, per_page: ARTICLE_COUNT } });
    return articles.map((article) => ({
      url: article.url,
      title: article.title,
      externalId: String(article.id),
      publishedAt: article.published_at ? new Date(article.published_at) : undefined,
      author: article.user?.name,
      summary: toSummaryText(article.description),
      extra: {
        score: article.public_reactions_count,
        commentCount: article.comments_count,
        commentsUrl: `${article.url}#comments`,
        tags: article.tag_list,
      },
      raw: article,
    }));
  },
});
