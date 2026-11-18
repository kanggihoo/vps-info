// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EntryView } from '@trendboda/api-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client.ts';
import { EntryCard } from './entry-card.tsx';
import { EntryChangesProvider } from './entry-changes.tsx';

const entry: EntryView = {
  id: 7,
  feedId: 'hn-best',
  url: 'https://example.com/7',
  title: '카드 제목',
  publishedAt: null,
  author: null,
  summary: null,
  extra: null,
  firstSeenAt: '2026-11-18T00:00:00.000Z',
  openedAt: null,
  bookmarkedAt: null,
  translatedTitle: null,
  translatedSummary: null,
};

function renderCard(props: Partial<Parameters<typeof EntryCard>[0]> = {}) {
  return render(
    <EntryChangesProvider>
      <EntryCard entry={entry} href="#/feeds/hn-best/entries/7" selected={false} {...props} />
    </EntryChangesProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EntryCard Bookmark', () => {
  it('Bookmark를 누르면 저장하고 눌린 상태로 바꾸며 바뀐 Entry를 알린다', async () => {
    const setBookmarked = vi.spyOn(apiClient, 'setBookmarked').mockResolvedValue(undefined);
    const onEntryChange = vi.fn();
    renderCard({ onEntryChange });

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));

    const pressedButton = await screen.findByRole('button', { name: 'Bookmark 해제' });
    expect(pressedButton.getAttribute('aria-pressed')).toBe('true');
    expect(setBookmarked).toHaveBeenCalledWith(entry.id, true);
    expect(onEntryChange).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id, bookmarkedAt: expect.any(String) }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('저장에 실패하면 안내를 보이고 Bookmark 상태는 그대로 두며 알리지 않는다', async () => {
    vi.spyOn(apiClient, 'setBookmarked').mockRejectedValue(new Error('network down'));
    const onEntryChange = vi.fn();
    renderCard({ onEntryChange });

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Bookmark를 변경하지 못했습니다. 다시 시도하세요.');
    expect(screen.getByRole('button', { name: 'Bookmark' }).getAttribute('aria-pressed')).toBe('false');
    expect(onEntryChange).not.toHaveBeenCalled();
  });

  it('실패 안내가 떠 있을 때 다시 누르면 안내를 지우고, 성공하면 Bookmark가 된다', async () => {
    vi.spyOn(apiClient, 'setBookmarked').mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(undefined);
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));

    await screen.findByRole('button', { name: 'Bookmark 해제' });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(apiClient.setBookmarked).toHaveBeenCalledTimes(2);
  });

  it('다시 눌렀을 때도 실패하면 안내를 계속 보여 준다', async () => {
    vi.spyOn(apiClient, 'setBookmarked').mockRejectedValue(new Error('still down'));
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));

    await waitFor(() => expect(apiClient.setBookmarked).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('alert')).textContent).toContain('Bookmark를 변경하지 못했습니다');
  });

  it('Bookmark한 카드를 누르면 해제를 요청한다', async () => {
    const setBookmarked = vi.spyOn(apiClient, 'setBookmarked').mockResolvedValue(undefined);
    renderCard({ entry: { ...entry, bookmarkedAt: '2026-11-18T01:00:00.000Z' } });

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark 해제' }));

    await screen.findByRole('button', { name: 'Bookmark' });
    expect(setBookmarked).toHaveBeenCalledWith(entry.id, false);
  });
});

describe('EntryCard 선택', () => {
  it('제목 링크를 누르면 그 Entry로 알린다', async () => {
    const onSelect = vi.fn();
    renderCard({ onSelect });

    await userEvent.click(screen.getByRole('link', { name: '카드 제목' }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id }));
  });
});
