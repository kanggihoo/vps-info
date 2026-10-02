/**
 * Feed Group을 화면에 펼치는 규칙(ADR-0010): 왼쪽 목록의 구역과 줄, Group 안에서 변형 고르기, 마지막으로 본 변형 기억.
 */
import type { FeedGroupView, FeedKind, FeedSummary, FeedNavigationItem, FeedNavigationOrder } from '@trendboda/api-types';

/** 왼쪽 목록의 한 줄. Group에 들지 않은 Feed 하나, 또는 Feed Group 하나다. */
export type SidebarRow = { kind: 'feed'; feed: FeedSummary } | { kind: 'group'; group: FeedGroupView; feeds: FeedSummary[] };

/** 왼쪽 목록의 구역. Feed 종류마다 하나다. */
export type SidebarSection = { kind: FeedKind; rows: SidebarRow[] };

/** 구역 순서. 새 글이 쌓이는 Stream을 위에 둔다. */
const SECTION_ORDER: FeedKind[] = ['stream', 'ranked'];

/** 마지막으로 본 변형을 남기는 `localStorage` 키의 앞부분. 뒤에 Group id가 붙는다. */
const LAST_FEED_STORAGE_KEY_PREFIX = 'feed-group-last-feed:';

/**
 * Feed 목록을 종류별 구역으로 나누고, 같은 Group의 Feed를 한 줄로 합친다.
 * Group 줄은 그 Group의 첫 Feed가 있던 자리에 놓인다. 선언되지 않은 Group을 가리키는 Feed는 혼자 한 줄이다.
 *
 * @param feeds - 선언 순서의 Feed 목록
 * @param order - 저장한 배치. 없는 줄은 구역 끝에 선언 순서로 붙인다(ADR-0016).
 * @returns 빈 구역은 뺀다
 */
export function buildSidebarSections(feeds: FeedSummary[], groups: FeedGroupView[], order?: FeedNavigationOrder): SidebarSection[] {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const rowsByKind = new Map<FeedKind, SidebarRow[]>(SECTION_ORDER.map((kind) => [kind, []]));
  const groupRowsById = new Map<string, Extract<SidebarRow, { kind: 'group' }>>();

  for (const feed of feeds) {
    const group = feed.group ? groupsById.get(feed.group.id) : undefined;
    const existingGroupRow = group ? groupRowsById.get(group.id) : undefined;
    if (existingGroupRow) {
      existingGroupRow.feeds.push(feed);
      continue;
    }
    const row: SidebarRow = group ? { kind: 'group', group, feeds: [feed] } : { kind: 'feed', feed };
    if (row.kind === 'group') groupRowsById.set(row.group.id, row);
    rowsByKind.get(feed.kind)?.push(row);
  }
  return SECTION_ORDER.map((kind) => {
    const remaining = new Map((rowsByKind.get(kind) ?? []).map((row) => [sidebarRowKey(row), row]));
    const rows: SidebarRow[] = [];
    for (const item of order?.[kind] ?? []) {
      const key = `${item.kind}:${item.id}`;
      const row = remaining.get(key);
      if (row) { rows.push(row); remaining.delete(key); }
    }
    return { kind, rows: [...rows, ...remaining.values()] };
  }).filter((section) => section.rows.length > 0);
}

/** 순서 저장과 드래그에서 사용하는 화면 줄의 식별자. */
export function sidebarRowItem(row: SidebarRow): FeedNavigationItem {
  return row.kind === 'feed' ? { kind: 'feed', id: row.feed.id } : { kind: 'group', id: row.group.id };
}

/** 개별 Feed와 Group의 id가 같아도 충돌하지 않는 키. */
export function sidebarRowKey(row: SidebarRow): string {
  const item = sidebarRowItem(row);
  return `${item.kind}:${item.id}`;
}

/** 왼쪽 목록의 한 줄을 눌렀을 때 열 Feed. Group이면 마지막으로 본 변형, 없으면 선언 순서의 첫 Feed다. */
export function pickRowFeed(row: SidebarRow): FeedSummary {
  if (row.kind === 'feed') return row.feed;
  const lastFeedId = readLastFeedId(row.group.id);
  return row.feeds.find((feed) => feed.id === lastFeedId) ?? row.feeds[0];
}

/**
 * 같은 Group 안에서 축 하나의 값만 바꾼 Feed를 찾는다.
 * 나머지 축이 같은 Feed가 없으면 그 값을 가진 첫 Feed를, 그것도 없으면 `undefined`를 돌려준다.
 */
export function findVariantFeed(groupFeeds: FeedSummary[], current: FeedSummary, axisKey: string, value: string): FeedSummary | undefined {
  const wantedVariant = { ...current.group?.variant, [axisKey]: value };
  const sameOtherAxes = groupFeeds.find((feed) =>
    Object.entries(wantedVariant).every(([key, wantedValue]) => feed.group?.variant[key] === wantedValue),
  );
  return sameOtherAxes ?? groupFeeds.find((feed) => feed.group?.variant[axisKey] === value);
}

/** Feed에 새로 볼 것이 있는지. Stream Feed는 안 읽음, Ranked Feed는 최신 Rank Snapshot의 NEW다. */
export function hasSomethingNew(feed: FeedSummary): boolean {
  return feed.kind === 'ranked' ? feed.rankSnapshotNewCount > 0 : feed.unreadCount > 0;
}

/** 마지막으로 본 Group 안의 Feed를 남긴다. 저장소가 막힌 브라우저에서는 조용히 넘긴다. */
export function saveLastFeedId(groupId: string, feedId: string): void {
  try {
    localStorage.setItem(LAST_FEED_STORAGE_KEY_PREFIX + groupId, feedId);
  } catch {
    // 기억하지 못하면 다음에 선언 순서의 첫 Feed로 열린다.
  }
}

function readLastFeedId(groupId: string): string | undefined {
  try {
    return localStorage.getItem(LAST_FEED_STORAGE_KEY_PREFIX + groupId) ?? undefined;
  } catch {
    return undefined;
  }
}
