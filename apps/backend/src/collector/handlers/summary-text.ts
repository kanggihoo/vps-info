/** Handler들이 Entry의 `summary`를 만들 때 쓰는 변환. */
import * as cheerio from 'cheerio';

/** 요약으로 남길 최대 글자 수. 원문 본문을 저장하지 않는다는 결정(링크와 메타데이터만 저장)을 지키기 위한 상한이다. */
const SUMMARY_MAX_LENGTH = 500;

/**
 * HTML이나 평문을 한 줄짜리 짧은 평문 요약으로 바꾼다.
 * 태그를 걷어내고 공백을 하나로 합친 뒤 500자로 자른다.
 *
 * @returns 내용이 비었으면 `undefined`
 */
export function toSummaryText(htmlOrText: string | undefined): string | undefined {
  if (!htmlOrText) return undefined;
  const text = cheerio.load(htmlOrText).text().replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, SUMMARY_MAX_LENGTH) : undefined;
}
