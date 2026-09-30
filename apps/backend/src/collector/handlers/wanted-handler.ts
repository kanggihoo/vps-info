/**
 * 원티드의 개발 직군 신입 공고를 원티드 웹이 쓰는 목록 API(`/api/chaos/navigation/v1/results`)로 가져오는 Handler.
 * 공식 API가 아니라 사이트가 자기 목록 화면에서 부르는 주소라, 응답이 바뀌면 여기만 고친다.
 * 목록은 최신 등록순이며 새 공고만 Entry가 된다. 마감일은 목록에 없어서 저장하지 않는다.
 */
import { defineHandler } from './define-handler.ts';
import { wantedProxyAgent } from '../../wanted-proxy.ts';
import { makeCareerLabel } from './job-posting.ts';

const JOBS_URL = 'https://www.wanted.co.kr/api/chaos/navigation/v1/results';

/** 직군 518은 "개발", `years=0`은 신입이 지원할 수 있는 공고다(서버가 `is_newbie`로 거른다). */
const JOBS_QUERY = { job_group_id: 518, country: 'kr', job_sort: 'job.latest_order', years: 0, locations: 'all' };

/** 한 요청이 돌려주는 최대 공고 수. 넘으면 `offset`으로 다음 페이지를 받는다. */
const PAGE_SIZE = 100;
/** 받는 페이지 수의 상한. 직무 하나의 신입 공고는 수십~백여 건이라 넘을 일이 없지만, 무한 반복을 막는다. */
const MAX_PAGES = 10;

/** 개발 직군(518) 안의 직무 ID → 이름. 카드의 직무 태그에 쓴다. */
const JOB_NAMES: Record<number, string> = {
  872: '서버 개발자',
  10110: '소프트웨어 엔지니어',
  660: '자바 개발자',
  895: 'Node.js 개발자',
  899: '파이썬 개발자',
  10231: 'DBA',
  873: '웹 개발자',
  669: '프론트엔드 개발자',
  1634: '머신러닝 엔지니어',
  655: '데이터 엔지니어',
  1025: '빅데이터 엔지니어',
  1024: '데이터 사이언티스트',
  674: 'DevOps / 시스템 관리자',
  665: '시스템,네트워크 관리자',
  676: 'QA,테스트 엔지니어',
  877: '개발 매니저',
  677: '안드로이드 개발자',
  678: 'iOS 개발자',
  10111: '크로스플랫폼 앱 개발자',
};

/** 정규직이 아닌 고용 형태의 화면 표기. 정규직은 기본이라 태그로 달지 않는다. */
const EMPLOYMENT_TAGS: Record<string, string> = { intern: '인턴', contract: '계약직' };

/** API 응답 항목 중 쓰는 필드. */
type WantedJob = {
  id: number;
  position: string;
  company: { name: string };
  annual_from: number;
  annual_to?: number;
  employment_type?: string;
  category_tag?: { id: number };
  address?: { location?: string; district?: string };
};

type WantedJobsResponse = { data: WantedJob[]; links?: { next?: string | null } };

export const wantedHandler = defineHandler<{ jobIds: number[] }>({
  async fetchEntries({ jobIds }, { httpClient }) {
    const jobs = new Map<number, WantedJob>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await httpClient<WantedJobsResponse>(JOBS_URL, {
        query: { ...JOBS_QUERY, job_ids: jobIds, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
        dispatcher: wantedProxyAgent,
      });
      for (const job of response.data) jobs.set(job.id, job);
      if (!response.links?.next) break;
    }
    return [...jobs.values()]
      .filter((job) => job.position)
      .map((job) => ({
        url: `https://www.wanted.co.kr/wd/${job.id}`,
        title: job.position,
        externalId: String(job.id),
        author: job.company.name,
        extra: {
          location: [job.address?.location, job.address?.district].filter(Boolean).join(' ') || undefined,
          career: makeCareerLabel(job.annual_from, job.annual_to),
          tags: [JOB_NAMES[job.category_tag?.id ?? 0], EMPLOYMENT_TAGS[job.employment_type ?? '']].filter(Boolean),
        },
        raw: job,
      }));
  },
});
