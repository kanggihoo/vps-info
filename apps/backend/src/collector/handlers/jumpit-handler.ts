/**
 * 점핏의 서버/백엔드 신입 공고를 점핏 웹이 쓰는 JSON API로 가져오는 Handler.
 * 공식 API가 아니라 사이트가 자기 목록 화면에서 부르는 주소라, 바뀌면 여기만 고친다.
 * 목록은 최신 등록순이며 새 공고만 Entry가 된다.
 */
import { defineHandler } from './define-handler.ts';
import { makeCareerLabel } from './job-posting.ts';

/** 직무 1은 "서버/백엔드 개발자", `career=0`은 신입 공고다. 한 페이지만 가져온다. */
const POSITIONS_URL = 'https://jumpit-api.saramin.co.kr/api/positions';
const POSITIONS_QUERY = { jobCategory: 1, career: 0, sort: 'reg_dt', page: 1 };

/** API 응답 항목 중 쓰는 필드. */
type JumpitPosition = {
  id: number;
  title: string;
  companyName: string;
  techStacks?: string[];
  locations?: string[];
  minCareer: number;
  maxCareer?: number;
  /** 마감 시각(`2026-10-29T23:59:59`, 한국 시각). */
  closedAt?: string;
  alwaysOpen?: boolean;
};

export const jumpitHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const { result } = await httpClient<{ result: { positions: JumpitPosition[] } }>(POSITIONS_URL, { query: POSITIONS_QUERY });
    return result.positions
      .filter((position) => position.title)
      .map((position) => ({
        url: `https://jumpit.saramin.co.kr/position/${position.id}`,
        title: position.title,
        externalId: String(position.id),
        author: position.companyName,
        extra: {
          location: position.locations?.join(', ') || undefined,
          career: makeCareerLabel(position.minCareer, position.maxCareer),
          deadline: position.closedAt?.slice(0, 10),
          alwaysOpen: position.alwaysOpen || undefined,
          tags: position.techStacks,
        },
        raw: position,
      }));
  },
});
