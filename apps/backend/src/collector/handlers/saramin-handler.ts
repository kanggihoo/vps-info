/**
 * 사람인의 "백엔드" 신입 공고를 검색 결과 HTML에서 뽑는 Handler.
 * 공식 RSS·API가 없어 검색 결과 페이지(robots.txt가 막지 않는 경로)를 파싱한다. 최신 등록순이며 새 공고만 Entry가 된다.
 */
import * as cheerio from 'cheerio';
import { defineHandler } from './define-handler.ts';
import { toKoreanDateString } from './job-posting.ts';

/** `exp_cd=1`은 신입, `recruitSort=reg_dt`는 최신 등록순이다. 한 페이지만 가져온다. */
const SEARCH_URL = 'https://www.saramin.co.kr/zf_user/search/recruit';
const SEARCH_QUERY = { searchType: 'search', searchword: '백엔드', exp_cd: 1, recruitSort: 'reg_dt', recruitPageCount: 30, recruitPage: 1 };

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 마감 표기("~ 10/30(금)", "오늘마감", "상시채용" 등)를 날짜와 상시 여부로 바꾼다.
 * 표기에 연도가 없어서, 한 달 넘게 지난 날짜면 다음 해로 본다.
 *
 * @param now - 기준 시각. 테스트에서 고정한다.
 */
export function parseDeadline(text: string, now: Date): { deadline?: string; alwaysOpen?: boolean } {
  const normalized = text.replace(/\s+/g, '');
  if (/상시|채용시/.test(normalized)) return { alwaysOpen: true };
  if (normalized.includes('오늘마감')) return { deadline: toKoreanDateString(now) };
  if (normalized.includes('내일마감')) return { deadline: toKoreanDateString(new Date(now.getTime() + MILLISECONDS_PER_DAY)) };
  const matched = normalized.match(/(\d{1,2})\/(\d{1,2})/);
  if (!matched) return {};
  const [, month, day] = matched;
  const today = toKoreanDateString(now);
  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
  const monthAgo = toKoreanDateString(new Date(now.getTime() - 30 * MILLISECONDS_PER_DAY));
  return { deadline: candidate < monthAgo ? `${year + 1}-${candidate.slice(5)}` : candidate };
}

/** 등록일 표기 "등록일 26/09/30"을 한국 시각 0시의 Date로 바꾼다. */
function parsePostedAt(text: string): Date | undefined {
  const matched = text.match(/(\d{2})\/(\d{2})\/(\d{2})/);
  return matched ? new Date(`20${matched[1]}-${matched[2]}-${matched[3]}T00:00:00+09:00`) : undefined;
}

/** 이 직무가 붙은 공고만 남긴다. 키워드 검색은 제목·본문에 "백엔드"만 있어도 프론트엔드 공고까지 돌려준다. */
const BACKEND_SECTOR = '백엔드/서버개발';

/** 검색 결과 HTML을 EntryDraft 목록으로 바꾼다. 페이지 구조가 바뀌면 여기만 고친다. */
export function parseSearchResultPage(html: string, now: Date) {
  const $ = cheerio.load(html);
  return $('.item_recruit')
    .map((_, element) => {
      const item = $(element);
      const id = item.attr('value');
      const title = item.find('.job_tit a').attr('title')?.trim();
      if (!id || !title) return [];
      const sector = item.find('.job_sector');
      const tags = sector.find('a').map((__, anchor) => $(anchor).text().trim()).get();
      if (!tags.includes(BACKEND_SECTOR)) return [];
      const conditions = item.find('.job_condition > span').map((__, span) => $(span).text().replace(/\s+/g, ' ').trim()).get();
      const postedText = sector.find('.job_day').text();
      return {
        url: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${id}`,
        title,
        externalId: id,
        publishedAt: parsePostedAt(postedText),
        author: item.find('.corp_name a').text().trim() || undefined,
        extra: {
          location: conditions[0] || undefined,
          career: conditions[1] || undefined,
          ...parseDeadline(item.find('.job_date .date').text(), now),
          tags,
        },
        raw: { id, title, conditions, deadlineText: item.find('.job_date .date').text().trim(), postedText: postedText.trim() },
      };
    })
    .get();
}

export const saraminHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const html = await httpClient(SEARCH_URL, { query: SEARCH_QUERY, responseType: 'text' });
    return parseSearchResultPage(html, new Date());
  },
});
