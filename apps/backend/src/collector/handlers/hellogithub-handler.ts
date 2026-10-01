/** HelloGitHub이 골라 소개하는 오픈소스 저장소를 공개 API로 가져오는 Handler. */
import { defineHandler } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

const API_URL = 'https://api.hellogithub.com/v1/';

/** 한 페이지에 오는 항목 수. */
const PAGE_SIZE = 20;

/** 순위표의 기간. 비우면 서버 기본값(최신 월간호)이다. */
export type HelloGithubRankBy = 'monthly' | 'yearly';

/** API 응답 항목 중 쓰는 필드. 숫자도 문자열로 오는 경우가 있다. */
type HelloGithubItem = {
  item_id: string;
  /** `owner/name`. */
  full_name: string;
  title: string;
  title_en?: string | null;
  summary: string;
  summary_en?: string | null;
  author?: string;
  primary_lang?: string | null;
  /** 조회(클릭) 수. 오를수록 인기가 많지만, 목록 순서가 이 값의 순서는 아니다. */
  clicks_total?: number;
  comment_total?: number;
  updated_at?: string;
};

type HelloGithubPage = { data: HelloGithubItem[]; has_more?: boolean };

/**
 * 목록 주소를 만든다. `rankBy`와 `tid`가 없으면 서버 기본 목록(최신 월간호)이다.
 * `tid`는 언어·주제 태그 ID이고, 전체는 `all`이다(예: Python은 `Z8PipJsHCX`).
 */
export function makeHelloGithubUrl(page: number, rankBy?: HelloGithubRankBy, tid?: string): string {
  const query = new URLSearchParams({ sort_by: 'featured', page: String(page) });
  if (rankBy) query.set('rank_by', rankBy);
  if (tid) query.set('tid', tid);
  return `${API_URL}?${query}`;
}

export const hellogithubHandler = defineHandler<{ rankBy?: HelloGithubRankBy; tid?: string }>({
  async fetchEntries({ rankBy, tid }, { httpClient, rankLimit }) {
    // 순서를 지키려고 페이지를 차례로 받는다. 다음 페이지가 없으면 멈춘다.
    const pageCount = Math.ceil((rankLimit ?? PAGE_SIZE) / PAGE_SIZE);
    const items: HelloGithubItem[] = [];
    for (let page = 1; page <= pageCount; page += 1) {
      const response = await httpClient<HelloGithubPage>(makeHelloGithubUrl(page, rankBy, tid));
      items.push(...response.data);
      if (!response.has_more) break;
    }
    return items.map((item) => ({
      url: `https://github.com/${item.full_name}`,
      title: `${item.full_name} — ${item.title_en || item.title}`,
      externalId: item.item_id,
      author: item.author,
      summary: toSummaryText(item.summary_en || item.summary),
      extra: { language: item.primary_lang, hellogithubUrl: `https://hellogithub.com/repository/${item.full_name}` },
      metrics: { clicks: item.clicks_total, commentCount: item.comment_total },
      raw: item,
    }));
  },
});
