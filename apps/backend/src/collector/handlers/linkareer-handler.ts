/**
 * 링커리어의 백엔드/서버개발 신입 채용 공고를 링커리어 웹이 쓰는 GraphQL API로 가져오는 Handler.
 * 공식 API가 아니라 사이트가 자기 목록 화면에서 부르는 질의라, 스키마가 바뀌면 여기만 고친다.
 * 목록은 최신 등록순이며 새 공고만 Entry가 된다.
 */
import { defineHandler } from './define-handler.ts';
import { toKoreanDateString } from './job-posting.ts';

const GRAPHQL_URL = 'https://api.linkareer.com/graphql';

/** 직무 103002는 "백엔드/서버개발"이다. */
const BACKEND_CATEGORY_ID = '103002';

/** 활동 유형 5는 채용, `NEW`는 신입이 지원할 수 있는 공고다. */
const ACTIVITIES_QUERY = `query ($filterBy: ActivityFilter, $orderBy: ActivityOrder, $pagination: Pagination) {
  activities(filterBy: $filterBy, orderBy: $orderBy, pagination: $pagination) {
    nodes { id title organizationName jobTypes recruitType recruitCloseAt regions { name } categories { id } }
  }
}`;
const ACTIVITIES_VARIABLES = {
  filterBy: { activityTypeID: '5', status: 'OPEN', categoryIDs: [BACKEND_CATEGORY_ID], jobTypes: ['NEW'] },
  orderBy: { direction: 'DESC', field: 'RECENT' },
  pagination: { page: 1, pageSize: 30 },
};

/** 지원 자격 코드의 화면 표기. 한 공고가 신입·경력·인턴을 함께 받을 수 있다. */
const JOB_TYPE_LABELS: Record<string, string> = { NEW: '신입', EXPERIENCED: '경력', INTERN: '인턴' };

/** API 응답 항목 중 쓰는 필드. */
type LinkareerActivity = {
  id: string;
  title: string;
  organizationName: string;
  jobTypes: string[];
  /** `ALWAYS`(상시), `ASAP`(채용 시 마감), `NORMAL`(마감일 있음). */
  recruitType: string;
  /** 마감 시각(epoch 밀리초). */
  recruitCloseAt?: number;
  regions?: { name: string }[];
  categories?: { id: string }[];
};

export const linkareerHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const { data } = await httpClient<{ data: { activities: { nodes: LinkareerActivity[] } } }>(GRAPHQL_URL, {
      method: 'POST',
      body: { query: ACTIVITIES_QUERY, variables: ACTIVITIES_VARIABLES },
    });
    // 직무 필터는 모든 직무를 받는다고 표시한 공고("전체")도 함께 돌려주므로, 백엔드 직무를 직접 단 공고만 남긴다.
    return data.activities.nodes
      .filter((activity) => activity.title && activity.categories?.some((category) => category.id === BACKEND_CATEGORY_ID))
      .map((activity) => {
        const hasDeadline = activity.recruitType === 'NORMAL' && activity.recruitCloseAt !== undefined;
        return {
          url: `https://linkareer.com/activity/${activity.id}`,
          title: activity.title,
          externalId: activity.id,
          author: activity.organizationName,
          extra: {
            location: activity.regions?.map((region) => region.name).join(', ') || undefined,
            career: activity.jobTypes.map((jobType) => JOB_TYPE_LABELS[jobType] ?? jobType).join('·') || undefined,
            deadline: hasDeadline ? toKoreanDateString(new Date(activity.recruitCloseAt ?? 0)) : undefined,
            alwaysOpen: hasDeadline ? undefined : true,
          },
          raw: activity,
        };
      });
  },
});
