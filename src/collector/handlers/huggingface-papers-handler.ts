/**
 * Hugging Face Papers(사람들이 추천한 arXiv 논문)에서 지난주·지난달 추천수 상위 논문을 가져오는 Handler.
 * 끝난 기간만 보므로 같은 기간을 여러 번 수집해도 결과가 같고, 기간이 바뀐 뒤 첫 수집에서만 새 Entry가 생긴다.
 */
import { defineHandler } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

const DAILY_PAPERS_URL = 'https://huggingface.co/api/daily_papers';

/** 기간마다 가져올 논문 수. API는 추천수 내림차순으로 준다. */
const PAPER_COUNT = 30;

type PaperPeriod = 'week' | 'month';

/** `/api/daily_papers` 응답 항목 중 쓰는 필드. */
type DailyPaper = {
  paper: {
    /** arXiv id. */
    id: string;
    title: string;
    summary?: string;
    upvotes?: number;
    publishedAt?: string;
    authors?: { name: string }[];
  };
  numComments?: number;
};

/**
 * `now` 직전에 끝난 기간을 API 파라미터 값으로 만든다.
 * 주는 ISO 8601 주(월요일 시작, `2026-W39`), 달은 `2026-09` 형식이며 UTC 기준이다.
 */
export function makePreviousPeriodKey(period: PaperPeriod, now: Date): string {
  if (period === 'month') {
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  // ISO 주의 연도와 번호는 그 주의 목요일로 정한다. 지난주 같은 요일에서 그 주의 목요일로 옮긴다.
  const thursday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const weekNumber = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

export const huggingfacePapersHandler = defineHandler<{ period: PaperPeriod }>({
  async fetchEntries({ period }, { httpClient }) {
    const periodKey = makePreviousPeriodKey(period, new Date());
    const papers = await httpClient<DailyPaper[]>(DAILY_PAPERS_URL, { query: { [period]: periodKey, limit: PAPER_COUNT } });
    return papers.map(({ paper, numComments }) => ({
      url: `https://huggingface.co/papers/${paper.id}`,
      title: paper.title,
      externalId: paper.id,
      publishedAt: paper.publishedAt ? new Date(paper.publishedAt) : undefined,
      author: paper.authors?.slice(0, 3).map((author) => author.name).join(', '),
      summary: toSummaryText(paper.summary),
      extra: { score: paper.upvotes, commentCount: numComments, period: periodKey, arxivUrl: `https://arxiv.org/abs/${paper.id}` },
      raw: { paper, numComments },
    }));
  },
});
