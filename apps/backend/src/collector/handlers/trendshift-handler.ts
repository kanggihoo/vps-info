/**
 * Trendshift(GitHub 저장소 트렌드)의 기간·언어별 순위표를 가져오는 Handler.
 * 공식 API가 없어서 페이지에 들어 있는 데이터를 읽는다. 화면 구조(클래스 이름)는 읽지 않는다.
 *
 * - 먼저 Next.js RSC 데이터(`self.__next_f.push`)의 `initialData`를 읽는다. 점수·스타·포크가 여기에만 있다.
 * - 그것을 읽지 못하면 schema.org `ItemList`(JSON-LD)로 순위와 저장소만 읽는다. 이때는 `metrics`가 없고 경고를 남긴다.
 */
import * as cheerio from 'cheerio';
import { defineHandler, type EntryDraft } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

const BASE_URL = 'https://trendshift.io';

/** 수집하는 기간. 일간(첫 화면)은 GitHub Trending과 겹치고 순위가 너무 자주 바뀌어 쓰지 않는다. */
export type TrendshiftPeriod = 'weekly' | 'monthly' | 'yearly';

/** RSC `initialData`의 순위 한 줄 중 쓰는 필드. */
type TrendshiftRankRow = {
  rank: number;
  /** Trendshift가 매긴 점수. 순위는 이 값으로 정해진다. */
  score: number;
  /** `owner/name`. */
  full_name: string;
  repository_id: number;
  repository_stars: number;
  repository_forks: number;
  /** 그 기간에 늘어난 스타 수. */
  repository_stars_gained: number;
  repository_language?: string | null;
  repository_description?: string | null;
  tags?: { display_name: string }[];
};

/** JSON-LD `ItemList`의 항목 중 쓰는 필드. */
type TrendshiftListItem = {
  position: number;
  /** Trendshift의 저장소 페이지. */
  url: string;
  item: {
    /** `owner/name`. */
    name: string;
    description?: string;
    codeRepository: string;
    programmingLanguage?: string;
    author?: { name?: string };
    keywords?: string[];
  };
};

/**
 * Trendshift 순위표 페이지 HTML을 EntryDraft 목록으로 바꾼다. 순위순이다.
 * RSC 데이터를 먼저 읽고, 실패하면 JSON-LD로 읽는다. 둘 다 실패하면 예외를 던져 Fetch Attempt를 실패로 남긴다.
 *
 * @param onFallback - JSON-LD로 대신 읽었을 때 부른다. 성공으로 기록되므로 RSC가 깨진 것을 알리려고 쓴다.
 */
export function parseTrendshiftPage(html: string, onFallback: (reason: string) => void = () => {}): EntryDraft[] {
  const $ = cheerio.load(html);
  try {
    return parseRankRows($);
  } catch (rscError) {
    const drafts = parseItemList($);
    onFallback(rscError instanceof Error ? rscError.message : String(rscError));
    return drafts;
  }
}

/** RSC 데이터의 `initialData` 배열을 읽는다. 점수와 스타 수는 수집마다 바뀌므로 `metrics`에 넣는다(ADR-0009). */
function parseRankRows($: cheerio.CheerioAPI): EntryDraft[] {
  const payload = $('script')
    .map((_, element) => $(element).text())
    .get()
    .flatMap((scriptText) => [...scriptText.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)])
    .map((match) => JSON.parse(match[1]) as string)
    .join('');
  const rows = readJsonArrayAfter(payload, '"initialData":') as TrendshiftRankRow[];
  if (rows.length === 0 || rows.some((row) => typeof row.full_name !== 'string' || typeof row.rank !== 'number')) {
    throw new Error('RSC initialData의 순위 형식이 예상과 다르다');
  }
  return rows
    .toSorted((first, second) => first.rank - second.rank)
    .map((row) => ({
      url: `https://github.com/${row.full_name}`,
      title: row.full_name,
      externalId: row.full_name,
      author: row.full_name.split('/')[0],
      summary: toSummaryText(row.repository_description ?? undefined),
      extra: {
        language: row.repository_language ?? undefined,
        tags: row.tags?.map((tag) => tag.display_name),
        trendshiftUrl: `${BASE_URL}/repositories/${row.repository_id}`,
      },
      metrics: {
        score: row.score,
        stars: row.repository_stars,
        forks: row.repository_forks,
        starsGained: row.repository_stars_gained,
      },
      raw: row,
    }));
}

/** JSON-LD `ItemList`를 읽는다. 순위(`position`)와 저장소 정보만 있고 수치는 없다. */
function parseItemList($: cheerio.CheerioAPI): EntryDraft[] {
  const itemList = $('script[type="application/ld+json"]')
    .map((_, element) => JSON.parse($(element).text()))
    .get()
    .find((jsonLd) => jsonLd['@type'] === 'ItemList');
  if (!itemList) throw new Error('Trendshift 페이지에서 RSC 데이터와 ItemList JSON-LD를 모두 찾지 못했다. 페이지 구조가 바뀌었는지 확인한다.');

  return (itemList.itemListElement as TrendshiftListItem[])
    .toSorted((first, second) => first.position - second.position)
    .map((listItem) => ({
      url: listItem.item.codeRepository,
      title: listItem.item.name,
      externalId: listItem.item.name,
      author: listItem.item.author?.name,
      summary: toSummaryText(listItem.item.description),
      extra: {
        language: listItem.item.programmingLanguage,
        tags: listItem.item.keywords,
        trendshiftUrl: listItem.url,
      },
      raw: listItem,
    }));
}

/**
 * 문자열에서 `key` 바로 뒤에 오는 JSON 배열을 잘라 파싱한다. RSC 데이터는 JSON 조각이 이어 붙은 형식이라 전체를 한 번에 파싱할 수 없다.
 * 문자열 안의 괄호는 세지 않는다.
 */
function readJsonArrayAfter(text: string, key: string): unknown[] {
  const start = text.indexOf(key);
  if (start === -1 || text[start + key.length] !== '[') throw new Error(`RSC 데이터에서 ${key}를 찾지 못했다`);
  let depth = 0;
  let inString = false;
  for (let index = start + key.length; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (character === '\\') index += 1;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === '[' || character === '{') depth += 1;
    else if (character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start + key.length, index + 1));
    }
  }
  throw new Error(`RSC 데이터의 ${key} 배열이 닫히지 않았다`);
}

/**
 * 기간 순위표 주소를 만든다. `language`는 Trendshift의 언어 이름 그대로다(`TypeScript`, `Python`). 비우면 전체 언어다.
 */
export function makeTrendshiftUrl(period: TrendshiftPeriod, language?: string): string {
  return language ? `${BASE_URL}/${period}?language=${encodeURIComponent(language)}` : `${BASE_URL}/${period}`;
}

export const trendshiftHandler = defineHandler<{ period: TrendshiftPeriod; language?: string }>({
  async fetchEntries({ period, language }, { httpClient }) {
    const url = makeTrendshiftUrl(period, language);
    const html = await httpClient(url, { responseType: 'text' });
    return parseTrendshiftPage(html, (reason) => console.warn(`[trendshift] ${url}: RSC 데이터를 읽지 못해 JSON-LD로 읽었다(${reason})`));
  },
});
