// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedGroupView, FeedSummary } from '@trendboda/api-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FeedGroupBar } from './feed-group-bar.tsx';

const group: FeedGroupView = {
  id: 'trendshift',
  title: 'Trendshift',
  axes: [
    { key: 'period', title: '기간', values: [{ value: 'daily', title: '일간' }, { value: 'weekly', title: '주간' }] },
    { key: 'language', title: '언어', values: [{ value: 'all', title: '전체' }, { value: 'typescript', title: 'TypeScript' }] },
  ],
};

function makeFeed(id: string, variant: Record<string, string>, unreadCount: number): FeedSummary {
  return {
    id,
    title: id,
    kind: 'stream',
    group: { id: group.id, variant },
    unreadCount,
    rankSnapshotNewCount: 0,
    readCursorEntryId: null,
    latestEntryId: null,
    consecutiveFailures: 0,
    nextRunAt: '2026-11-18T03:00:00.000Z',
  };
}

const dailyAll = makeFeed('trendshift-daily-all', { period: 'daily', language: 'all' }, 0);
const dailyTypescript = makeFeed('trendshift-daily-typescript', { period: 'daily', language: 'typescript' }, 3);
const weeklyAll = makeFeed('trendshift-weekly-all', { period: 'weekly', language: 'all' }, 5);
const feeds = [dailyAll, dailyTypescript, weeklyAll];

beforeEach(() => {
  window.location.hash = '';
});

afterEach(cleanup);

describe('FeedGroupBar', () => {
  it('첫 축은 탭 링크로 보여 주고 지금 보는 Feed의 탭만 현재 페이지로 표시한다', () => {
    render(<FeedGroupBar group={group} feeds={feeds} selectedFeed={dailyAll} />);

    const tabs = within(screen.getByRole('navigation', { name: 'Trendshift 기간' }));
    expect(tabs.getByRole('link', { name: /일간/ }).getAttribute('aria-current')).toBe('page');
    const weeklyTab = tabs.getByRole('link', { name: /주간/ });
    expect(weeklyTab.getAttribute('aria-current')).toBeNull();
    expect(weeklyTab.getAttribute('href')).toBe('#/feeds/trendshift-weekly-all');
  });

  it('나머지 축은 드롭다운으로 보여 주고 선택지마다 그 Feed의 안 읽음 수를 붙인다', () => {
    render(<FeedGroupBar group={group} feeds={feeds} selectedFeed={dailyAll} />);

    const languageSelect = screen.getByRole('combobox', { name: '언어' });
    expect((languageSelect as HTMLSelectElement).value).toBe('all');
    expect(within(languageSelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['전체', 'TypeScript · 안 읽음 3']);
  });

  it('드롭다운에서 고르면 같은 Group의 그 Feed 화면 주소로 옮겨 간다', async () => {
    render(<FeedGroupBar group={group} feeds={feeds} selectedFeed={dailyAll} />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '언어' }), 'typescript');

    expect(window.location.hash).toBe('#/feeds/trendshift-daily-typescript');
  });

  it('고른 축 값을 가진 Feed가 없으면 그 선택지를 보이지 않는다', () => {
    render(<FeedGroupBar group={group} feeds={[dailyAll, weeklyAll]} selectedFeed={dailyAll} />);

    const languageSelect = screen.getByRole('combobox', { name: '언어' });
    expect(within(languageSelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['전체']);
  });
});
