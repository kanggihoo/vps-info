/** HelloGitHub이 골라 소개하는 오픈소스 저장소를 공개 API로 가져오는 Handler. */
import { defineHandler } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

/** 추천(featured) 순 첫 페이지. 한 페이지에 20개가 온다. */
const FEATURED_URL = 'https://api.hellogithub.com/v1/?sort_by=featured&page=1';

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
  updated_at?: string;
};

export const hellogithubHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const { data: items } = await httpClient<{ data: HelloGithubItem[] }>(FEATURED_URL);
    return items.map((item) => ({
      url: `https://github.com/${item.full_name}`,
      title: `${item.full_name} — ${item.title_en || item.title}`,
      externalId: item.item_id,
      author: item.author,
      summary: toSummaryText(item.summary_en || item.summary),
      extra: { language: item.primary_lang, hellogithubUrl: `https://hellogithub.com/repository/${item.full_name}` },
      raw: item,
    }));
  },
});
