/**
 * 채용 공고 Handler들이 함께 쓰는 변환. 채용 Feed의 `extra`는 모두 같은 필드 이름을 쓴다
 * (`location`, `career`, `deadline`, `alwaysOpen`, `tags`). 화면의 `job` 카드가 이 이름으로 읽는다.
 */

/** 경력 상한이 이 값 이상이면 상한이 없는 것으로 본다. 원티드가 "무관"을 100으로 준다. */
const UNBOUNDED_CAREER_YEARS = 50;

/**
 * 경력 범위를 사람이 읽는 한 줄로 바꾼다.
 *
 * @param minYears - 요구 경력 하한(년). 0이면 신입도 지원할 수 있다.
 * @param maxYears - 요구 경력 상한(년). 비어 있거나 매우 크면 상한이 없다.
 */
export function makeCareerLabel(minYears: number, maxYears: number | undefined): string {
  if (maxYears === undefined || maxYears >= UNBOUNDED_CAREER_YEARS) return minYears === 0 ? '경력 무관' : `${minYears}년 이상`;
  if (minYears === 0) return maxYears === 0 ? '신입' : `신입~${maxYears}년`;
  return minYears === maxYears ? `${minYears}년` : `${minYears}~${maxYears}년`;
}

/** 한국 시각 기준 날짜(`YYYY-MM-DD`). 마감일은 날짜 단위라 시간대 때문에 하루가 밀리지 않게 한국 시각으로 맞춘다. */
export function toKoreanDateString(instant: Date): string {
  return new Date(instant.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
