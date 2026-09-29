import { describe, expect, it } from 'vitest';
import type { FeedGroupView, FeedSummary } from '@trendboda/api-types';
import { buildSidebarSections, findVariantFeed, pickRowFeed } from './feed-group.ts';

/** 테스트용 Feed. 실제 선언된 Feed id를 쓴다. */
function makeFeed(id: string, kind: FeedSummary['kind'], group: FeedSummary['group'] = null): FeedSummary {
  return {
    id,
    title: id,
    kind,
    group,
    unreadCount: 0,
    rankSnapshotNewCount: 0,
    readCursorEntryId: null,
    latestEntryId: null,
    consecutiveFailures: 0,
    nextRunAt: '2026-09-29T00:00:00Z',
  };
}

const trendshiftGroup: FeedGroupView = {
  id: 'trendshift',
  title: 'Trendshift',
  axes: [
    { key: 'period', title: '기간', values: [{ value: 'weekly', title: '주간' }, { value: 'monthly', title: '월간' }] },
    { key: 'language', title: '언어', values: [{ value: 'all', title: '전체 언어' }, { value: 'python', title: 'Python' }] },
  ],
};

const weekly = makeFeed('trendshift-weekly', 'ranked', { id: 'trendshift', variant: { period: 'weekly', language: 'all' } });
const weeklyPython = makeFeed('trendshift-weekly-python', 'ranked', { id: 'trendshift', variant: { period: 'weekly', language: 'python' } });
const monthly = makeFeed('trendshift-monthly', 'ranked', { id: 'trendshift', variant: { period: 'monthly', language: 'all' } });

describe('buildSidebarSections', () => {
  it('Stream 구역을 먼저 두고, 같은 Group의 Feed는 첫 Feed 자리에 한 줄로 합친다', () => {
    const hnBest = makeFeed('hn-best', 'ranked');
    const geeknews = makeFeed('geeknews', 'stream');
    const sections = buildSidebarSections([hnBest, weekly, geeknews, weeklyPython], [trendshiftGroup]);

    expect(sections.map((section) => section.kind)).toEqual(['stream', 'ranked']);
    expect(sections[0].rows).toEqual([{ kind: 'feed', feed: geeknews }]);
    expect(sections[1].rows).toEqual([
      { kind: 'feed', feed: hnBest },
      { kind: 'group', group: trendshiftGroup, feeds: [weekly, weeklyPython] },
    ]);
  });

  it('Group 선언을 아직 못 받았으면 Feed를 한 줄씩 둔다', () => {
    const sections = buildSidebarSections([weekly, weeklyPython], []);
    expect(sections[0].rows.map((row) => row.kind)).toEqual(['feed', 'feed']);
  });
});

describe('findVariantFeed', () => {
  it('다른 축은 그대로 두고 한 축만 바꾼 Feed를 찾는다', () => {
    expect(findVariantFeed([weekly, weeklyPython, monthly], weeklyPython, 'period', 'weekly')).toBe(weeklyPython);
    expect(findVariantFeed([weekly, weeklyPython, monthly], weekly, 'language', 'python')).toBe(weeklyPython);
  });

  it('그런 조합이 없으면 그 값을 가진 첫 Feed로 간다', () => {
    expect(findVariantFeed([weekly, weeklyPython, monthly], weeklyPython, 'period', 'monthly')).toBe(monthly);
  });
});

describe('pickRowFeed', () => {
  it('기억한 변형이 없으면 Group의 첫 Feed를 연다', () => {
    expect(pickRowFeed({ kind: 'group', group: trendshiftGroup, feeds: [weekly, weeklyPython] })).toBe(weekly);
  });
});
