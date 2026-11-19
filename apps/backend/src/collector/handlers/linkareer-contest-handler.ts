/**
 * 링커리어의 진행 중인 공모전을 링커리어 웹이 쓰는 GraphQL API로 가져오는 Handler.
 * `/list/contest` 화면의 `__NEXT_DATA__`도 같은 질의 결과라서, HTML 대신 채용 Handler(`linkareer-handler.ts`)와 같은 API를 쓴다.
 * 목록은 최신 등록순이며 새 공모전만 Entry가 된다.
 */
import { defineHandler } from './define-handler.ts';
import { toKoreanDateString } from './job-posting.ts';

const GRAPHQL_URL = 'https://api.linkareer.com/graphql';

/**
 * 활동 유형 3은 공모전이다(1 대외활동, 2 동아리, 5 채용, 6 인턴). 진행 중인 것만, 최신순.
 * 하루 20~30개가 올라와서 하루 1회 수집에 100개면 며칠 밀려도 놓치지 않는다.
 */
const ACTIVITIES_QUERY = `query ($filterBy: ActivityFilter, $orderBy: ActivityOrder, $pagination: Pagination) {
  activities(filterBy: $filterBy, orderBy: $orderBy, pagination: $pagination) {
    nodes { id title organizationName recruitStartAt recruitCloseAt createdAt awards categories { name } }
  }
}`;
const ACTIVITIES_VARIABLES = {
  filterBy: { activityTypeID: '3', status: 'OPEN' },
  orderBy: { direction: 'DESC', field: 'RECENT' },
  pagination: { page: 1, pageSize: 100 },
};

/** API 응답 항목 중 쓰는 필드. */
type LinkareerContest = {
  id: string;
  title: string;
  organizationName: string;
  /** 접수 시작·마감 시각(epoch 밀리초). */
  recruitStartAt?: number | null;
  recruitCloseAt?: number | null;
  /** 링커리어에 등록된 시각(epoch 밀리초). */
  createdAt?: number | null;
  /** 시상 규모(만 원 단위 숫자 문자열). 없으면 "0"이다. */
  awards?: string | null;
  categories?: { name: string }[];
};

export const linkareerContestHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const { data } = await httpClient<{ data: { activities: { nodes: LinkareerContest[] } } }>(GRAPHQL_URL, {
      method: 'POST',
      body: { query: ACTIVITIES_QUERY, variables: ACTIVITIES_VARIABLES },
    });
    return data.activities.nodes
      .filter((contest) => contest.id && contest.title)
      .map((contest) => {
        // 조기 마감(ASAP)도 마감 시각을 주므로 그 날짜를 마감일로 쓴다. 마감 시각이 없을 때만 상시로 본다.
        const deadline = contest.recruitCloseAt ? toKoreanDateString(new Date(contest.recruitCloseAt)) : undefined;
        const awards = Number(contest.awards);
        return {
          url: `https://linkareer.com/activity/${contest.id}`,
          title: contest.title,
          externalId: contest.id,
          publishedAt: contest.createdAt ? new Date(contest.createdAt) : undefined,
          author: contest.organizationName || undefined,
          extra: {
            deadline,
            alwaysOpen: deadline ? undefined : true,
            startDate: contest.recruitStartAt ? toKoreanDateString(new Date(contest.recruitStartAt)) : undefined,
            prize: awards > 0 ? `${awards.toLocaleString('ko-KR')}만 원` : undefined,
            tags: contest.categories?.map((category) => category.name) ?? [],
          },
          raw: contest,
        };
      });
  },
});
