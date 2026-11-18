// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedSummary, RankedEntryView, RankSnapshotView } from '@trendboda/api-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client.ts';
import { EntryChangesProvider } from './entry-changes.tsx';
import { RankTable } from './rank-table.tsx';

const feed: FeedSummary = {
  id: 'hn-best',
  title: 'Hacker News Best',
  kind: 'ranked',
  group: null,
  unreadCount: 0,
  rankSnapshotNewCount: 0,
  readCursorEntryId: null,
  latestEntryId: 2,
  consecutiveFailures: 0,
  nextRunAt: '2026-11-18T03:00:00.000Z',
};

function makeRankedEntry(id: number, rank: number, title: string): RankedEntryView {
  return {
    id,
    feedId: feed.id,
    url: `https://example.com/${id}`,
    title,
    publishedAt: null,
    author: null,
    summary: null,
    extra: null,
    firstSeenAt: '2026-11-18T00:00:00.000Z',
    openedAt: null,
    bookmarkedAt: null,
    translatedTitle: null,
    translatedSummary: null,
    rank,
    metrics: null,
    previousRank: null,
    previousMetrics: null,
    movement: 'new',
  };
}

const snapshot: RankSnapshotView = {
  takenAt: '2026-11-18T01:00:00.000Z',
  previousTakenAt: null,
  entries: [makeRankedEntry(1, 1, '첫 번째 글'), makeRankedEntry(2, 2, '두 번째 글')],
  droppedEntries: [],
};

function renderTable() {
  return render(
    <EntryChangesProvider>
      <RankTable feed={feed} selectedEntryId={undefined} makeEntryHref={(entryId) => `#${entryId}`} onSelectEntry={() => {}} />
    </EntryChangesProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RankTable', () => {
  it('Snapshot를 받기 전에는 불러오는 중 표시를 보이고, 받으면 순위순으로 보여 준다', async () => {
    vi.spyOn(apiClient, 'getRankSnapshot').mockResolvedValue(snapshot);
    renderTable();

    expect(screen.getByLabelText('불러오는 중')).toBeTruthy();
    await screen.findByText('첫 번째 글');
    expect(screen.getByText('두 번째 글')).toBeTruthy();
    expect(screen.queryByLabelText('불러오는 중')).toBeNull();
  });

  it('요청이 실패하면 오류와 다시 시도 버튼을 보이고, 다시 시도해서 성공하면 오류를 지우고 순위표를 보여 준다', async () => {
    const getRankSnapshot = vi
      .spyOn(apiClient, 'getRankSnapshot')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(snapshot);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTable();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('순위표를 불러오지 못했습니다.');
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'network down' }));

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await screen.findByText('첫 번째 글');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(getRankSnapshot).toHaveBeenCalledTimes(2);
    expect(getRankSnapshot).toHaveBeenLastCalledWith(feed.id);
  });

  it('다시 시도도 실패하면 오류를 계속 보여 준다', async () => {
    vi.spyOn(apiClient, 'getRankSnapshot').mockRejectedValue(new Error('still down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTable();

    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(apiClient.getRankSnapshot).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('alert')).textContent).toContain('순위표를 불러오지 못했습니다.');
  });
});
