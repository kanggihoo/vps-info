/**
 * DACON(데이콘)의 AI·데이터 경진대회 목록을 DACON 웹이 쓰는 JSON API로 가져오는 Handler.
 * `dacon.io` 화면은 AWS WAF 챌린지를 띄울 때가 있지만 API 호스트 `app.dacon.io`는 JSON을 바로 준다(2026-11-20 확인).
 * 목록은 최신 대회가 앞에 오고 한 번에 15개다. 새 대회만 Entry가 된다.
 */
import { defineHandler } from './define-handler.ts';

const LIST_URL = 'https://app.dacon.io/api/v1/competition/list';

/** API 응답 항목 중 쓰는 필드. */
type DaconCompetition = {
  cpt_id: number;
  name: string;
  /** 분야·평가 방식을 `|`로 이은 문자열. 예: `알고리즘 | 코드 제출 평가 | 오디오`. */
  keyword?: string | null;
  /** 총상금(만 원 단위 숫자 문자열). 상금이 없으면 "0"이다. */
  prize?: string | null;
  /** 한국 시각 `YYYY-MM-DD HH:mm:ss`. */
  period_start?: string | null;
  period_end?: string | null;
  /** 주최. 지금은 모든 대회가 빈 문자열이다. */
  sponsor?: string | null;
};

/** `YYYY-MM-DD HH:mm:ss`(한국 시각)에서 날짜만 꺼낸다. 형식이 다르면 비운다. */
function toDate(value: string | null | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
}

export const daconHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const { data } = await httpClient<{ data: DaconCompetition[] }>(LIST_URL, { query: { offset: 0 } });
    return data
      .filter((competition) => competition.cpt_id && competition.name)
      .map((competition) => {
        const prize = Number(competition.prize);
        return {
          url: `https://dacon.io/competitions/official/${competition.cpt_id}/overview/description`,
          title: competition.name,
          externalId: String(competition.cpt_id),
          author: competition.sponsor || undefined,
          extra: {
            deadline: toDate(competition.period_end),
            startDate: toDate(competition.period_start),
            prize: prize > 0 ? `${prize.toLocaleString('ko-KR')}만 원` : undefined,
            tags: (competition.keyword ?? '').split('|').map((tag) => tag.trim()).filter(Boolean),
          },
          raw: competition,
        };
      });
  },
});
