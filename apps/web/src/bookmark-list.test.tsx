// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BookmarkedEntryView } from '@trendboda/api-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client.ts';
import { BookmarkList } from './bookmark-list.tsx';
import { EntryChangesProvider } from './entry-changes.tsx';

function makeBookmark(id: number, title: string): BookmarkedEntryView {
  return {
    id,
    feedId: 'hn-best',
    feedTitle: 'Hacker News Best',
    url: `https://example.com/${id}`,
    title,
    publishedAt: null,
    author: null,
    summary: null,
    extra: null,
    firstSeenAt: '2026-11-18T00:00:00.000Z',
    openedAt: null,
    bookmarkedAt: '2026-11-18T01:00:00.000Z',
    translatedTitle: null,
    translatedSummary: null,
  };
}

function renderList() {
  return render(
    <EntryChangesProvider>
      <BookmarkList feeds={[]} selectedEntryId={undefined} makeEntryHref={(entryId) => `#/bookmarks/entries/${entryId}`} onSelectEntry={() => {}} />
    </EntryChangesProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BookmarkList', () => {
  it('받기 전에는 불러오는 중 표시를, 받으면 최근 순서의 카드와 Feed 이름을 보여 준다', async () => {
    vi.spyOn(apiClient, 'listBookmarks').mockResolvedValue([makeBookmark(2, '두 번째 저장'), makeBookmark(1, '첫 번째 저장')]);
    renderList();

    expect(screen.getByLabelText('불러오는 중')).toBeTruthy();
    await screen.findByText('두 번째 저장');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['두 번째 저장', '첫 번째 저장']);
    expect(screen.getAllByText('Hacker News Best')).toHaveLength(2);
  });

  it('Bookmark가 없으면 안내 문구를 보여 준다', async () => {
    vi.spyOn(apiClient, 'listBookmarks').mockResolvedValue([]);
    renderList();

    expect(await screen.findByText('Entry의 별을 누르면 여기에 모입니다.')).toBeTruthy();
  });

  it('요청이 실패하면 오류를 보이고, 다시 시도해서 성공하면 오류를 지우고 목록을 보여 준다', async () => {
    const listBookmarks = vi
      .spyOn(apiClient, 'listBookmarks')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([makeBookmark(1, '저장한 글')]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderList();

    expect((await screen.findByRole('alert')).textContent).toContain('Bookmark를 불러오지 못했습니다.');
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'network down' }));

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await screen.findByText('저장한 글');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(listBookmarks).toHaveBeenCalledTimes(2);
  });

  it('다시 시도도 실패하면 오류를 계속 보여 준다', async () => {
    vi.spyOn(apiClient, 'listBookmarks').mockRejectedValue(new Error('still down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderList();

    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(apiClient.listBookmarks).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('alert')).textContent).toContain('Bookmark를 불러오지 못했습니다.');
  });

  it('카드에서 Bookmark를 해제하면 목록에서 그 카드를 뺀다', async () => {
    vi.spyOn(apiClient, 'listBookmarks').mockResolvedValue([makeBookmark(1, '남길 글'), makeBookmark(2, '뺄 글')]);
    vi.spyOn(apiClient, 'setBookmarked').mockResolvedValue(undefined);
    renderList();
    await screen.findByText('뺄 글');

    const [, secondUnbookmark] = screen.getAllByRole('button', { name: 'Bookmark 해제' });
    await userEvent.click(secondUnbookmark);

    await waitFor(() => expect(screen.queryByText('뺄 글')).toBeNull());
    expect(screen.getByText('남길 글')).toBeTruthy();
    expect(apiClient.setBookmarked).toHaveBeenCalledWith(2, false);
  });
});
