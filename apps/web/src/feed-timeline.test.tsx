// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EntryView, FeedSummary } from '@trendboda/api-types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client.ts';
import { EntryChangesProvider } from './entry-changes.tsx';
import { FeedTimeline } from './feed-timeline.tsx';

/** 목록 끝의 LoadTrigger가 쓰는 observer. 테스트가 "화면에 들어왔다"를 직접 알린다. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  disconnected = false;
  constructor(readonly callback: (observations: { isIntersecting: boolean }[]) => void) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
}

/** 지금 관찰 중인 표식이 화면에 들어오거나 나갔다고 알린다. */
function reportVisibility(isIntersecting: boolean) {
  const active = FakeIntersectionObserver.instances.filter((observer) => !observer.disconnected);
  expect(active).toHaveLength(1);
  act(() => active[0].callback([{ isIntersecting }]));
}

const feed: FeedSummary = {
  id: 'hn-new',
  title: 'Hacker News New',
  kind: 'stream',
  group: null,
  unreadCount: 0,
  rankSnapshotNewCount: 0,
  readCursorEntryId: null,
  latestEntryId: null,
  consecutiveFailures: 0,
  nextRunAt: '2026-11-18T03:00:00.000Z',
};

function makeEntry(id: number): EntryView {
  return {
    id,
    feedId: feed.id,
    url: `https://example.com/${id}`,
    title: `글 ${id}`,
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
}

function makeEntries(firstId: number, count: number): EntryView[] {
  return Array.from({ length: count }, (_, index) => makeEntry(firstId + index));
}

function renderTimeline(props: Partial<FeedSummary> = {}, onReadCursorSaved = vi.fn()) {
  return render(
    <EntryChangesProvider>
      <FeedTimeline
        feed={{ ...feed, ...props }}
        onReadCursorSaved={onReadCursorSaved}
        selectedEntryId={undefined}
        makeEntryHref={(entryId) => `#${entryId}`}
        onSelectEntry={() => {}}
      />
    </EntryChangesProvider>,
  );
}

beforeAll(() => {
  // jsdom에는 레이아웃이 없어서 scrollIntoView가 구현돼 있지 않다.
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FeedTimeline 처음 불러오기', () => {
  it('Read Cursor가 없으면 처음부터 안 읽음을 받아 "여기부터 새 글" 구분선을 첫 Entry 위에 둔다', async () => {
    const listEntriesAfter = vi.spyOn(apiClient, 'listEntriesAfter').mockResolvedValue(makeEntries(1, 2));
    const listEntriesBefore = vi.spyOn(apiClient, 'listEntriesBefore');
    renderTimeline();

    await screen.findByText('글 1');
    expect(screen.getByText('여기부터 새 글')).toBeTruthy();
    expect(listEntriesAfter).toHaveBeenCalledExactlyOnceWith(feed.id, 0, 50);
    expect(listEntriesBefore).not.toHaveBeenCalled();
  });

  it('요청이 실패하면 오류와 다시 시도 버튼을 보이고, 다시 시도해서 성공하면 오류를 지우고 Entry를 보여 준다', async () => {
    let finishRetry: (entries: EntryView[]) => void = () => {};
    const retryRequest = new Promise<EntryView[]>((resolve) => { finishRetry = resolve; });
    const listEntriesAfter = vi
      .spyOn(apiClient, 'listEntriesAfter')
      .mockRejectedValueOnce(new Error('network down'))
      .mockReturnValueOnce(retryRequest);
    renderTimeline();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Entry를 불러오지 못했습니다.');

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    // 재시도 요청이 끝나기 전에 이미 오류는 사라지고 불러오는 중 표시가 보인다.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('불러오는 중')).toBeTruthy();

    await act(async () => finishRetry(makeEntries(1, 2)));

    await screen.findByText('글 1');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(listEntriesAfter).toHaveBeenCalledTimes(2);
  });

  it('다시 시도도 실패하면 오류를 계속 보여 준다', async () => {
    const listEntriesAfter = vi.spyOn(apiClient, 'listEntriesAfter').mockRejectedValue(new Error('still down'));
    renderTimeline();

    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(listEntriesAfter).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('alert')).textContent).toContain('Entry를 불러오지 못했습니다.');
  });
});

describe('FeedTimeline 위아래로 더 불러오기', () => {
  it('화면 위쪽 표식이 보이면 더 오래된 Entry를 불러와 목록 위에 붙인다', async () => {
    // 커서 위 맥락이 10개(= 더 있을 수 있음)라서 위쪽 표식이 생긴다.
    vi.spyOn(apiClient, 'listEntriesBefore')
      .mockResolvedValueOnce(makeEntries(11, 10))
      .mockResolvedValueOnce(makeEntries(1, 10));
    vi.spyOn(apiClient, 'listEntriesAfter').mockResolvedValue(makeEntries(21, 2));
    renderTimeline({ readCursorEntryId: 20 });
    await screen.findByText('글 21');

    reportVisibility(true);

    await screen.findByText('글 1');
    expect(apiClient.listEntriesBefore).toHaveBeenLastCalledWith(feed.id, 11, 50);
  });

  it('표식이 화면 밖으로 나갔다는 알림에는 불러오지 않는다', async () => {
    const listEntriesBefore = vi.spyOn(apiClient, 'listEntriesBefore').mockResolvedValue(makeEntries(11, 10));
    vi.spyOn(apiClient, 'listEntriesAfter').mockResolvedValue(makeEntries(21, 2));
    renderTimeline({ readCursorEntryId: 20 });
    await screen.findByText('글 21');
    expect(listEntriesBefore).toHaveBeenCalledTimes(1);

    reportVisibility(false);

    expect(listEntriesBefore).toHaveBeenCalledTimes(1);
  });

  it('더 오래된 Entry를 불러오지 못하면 오류를 보이고, 다시 시도하면 처음부터 다시 불러온다', async () => {
    const listEntriesBefore = vi
      .spyOn(apiClient, 'listEntriesBefore')
      .mockResolvedValueOnce(makeEntries(11, 10))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(makeEntries(11, 10));
    vi.spyOn(apiClient, 'listEntriesAfter').mockResolvedValue(makeEntries(21, 2));
    renderTimeline({ readCursorEntryId: 20 });
    await screen.findByText('글 21');

    reportVisibility(true);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Entry를 불러오지 못했습니다.');
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'network down' }));

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await screen.findByText('글 21');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(listEntriesBefore).toHaveBeenCalledTimes(3);
  });

  it('화면 아래쪽 표식이 보이면 더 새로운 Entry를 불러와 목록 아래에 붙인다', async () => {
    // 첫 페이지가 가득 찼으므로(50개) 아래쪽 표식이 생긴다.
    vi.spyOn(apiClient, 'listEntriesAfter')
      .mockResolvedValueOnce(makeEntries(1, 50))
      .mockResolvedValueOnce(makeEntries(51, 2));
    renderTimeline();
    await screen.findByText('글 50');

    reportVisibility(true);

    await screen.findByText('글 52');
    expect(apiClient.listEntriesAfter).toHaveBeenLastCalledWith(feed.id, 50, 50);
    expect(screen.getByText(/마지막 Entry입니다/)).toBeTruthy();
  });

  it('더 새로운 Entry를 불러오지 못하면 오류를 보이고, 다시 시도하면 처음부터 다시 불러온다', async () => {
    const listEntriesAfter = vi
      .spyOn(apiClient, 'listEntriesAfter')
      .mockResolvedValueOnce(makeEntries(1, 50))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(makeEntries(1, 3));
    renderTimeline();
    await screen.findByText('글 50');

    reportVisibility(true);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Entry를 불러오지 못했습니다.');

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await screen.findByText('글 3');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(listEntriesAfter).toHaveBeenCalledTimes(3);
  });
});

describe('FeedTimeline 안 읽음 버튼', () => {
  const unreadFeed = { unreadCount: 3, latestEntryId: 9, readCursorEntryId: null };

  it('누르면 Read Cursor를 마지막 Entry로 옮기고 가장 최근 Entry들로 목록을 바꾼다', async () => {
    vi.spyOn(apiClient, 'listEntriesAfter').mockResolvedValue(makeEntries(1, 2));
    const listEntriesBefore = vi.spyOn(apiClient, 'listEntriesBefore').mockResolvedValue(makeEntries(7, 3));
    const moveReadCursor = vi.spyOn(apiClient, 'moveReadCursor').mockResolvedValue({ readCursorEntryId: 9 });
    const onReadCursorSaved = vi.fn();
    renderTimeline(unreadFeed, onReadCursorSaved);
    await screen.findByText('글 1');

    await userEvent.click(screen.getByRole('button', { name: /안 읽음/ }));

    await screen.findByText('글 9');
    expect(moveReadCursor).toHaveBeenCalledExactlyOnceWith(feed.id, 9);
    expect(listEntriesBefore).toHaveBeenCalledExactlyOnceWith(feed.id, 10, 50);
    expect(screen.queryByText('글 1')).toBeNull();
    expect(screen.queryByText('여기부터 새 글')).toBeNull();
    await waitFor(() => expect(onReadCursorSaved).toHaveBeenCalledTimes(1));
  });

  it('최근 Entry를 불러오지 못하면 오류를 보이고, 다시 시도하면 목록을 처음부터 다시 불러온다', async () => {
    const listEntriesAfter = vi.spyOn(apiClient, 'listEntriesAfter').mockResolvedValue(makeEntries(1, 2));
    vi.spyOn(apiClient, 'listEntriesBefore').mockRejectedValue(new Error('network down'));
    vi.spyOn(apiClient, 'moveReadCursor').mockResolvedValue({ readCursorEntryId: 9 });
    renderTimeline(unreadFeed);
    await screen.findByText('글 1');

    await userEvent.click(screen.getByRole('button', { name: /안 읽음/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Entry를 불러오지 못했습니다.');

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(listEntriesAfter).toHaveBeenCalledTimes(2));
    await within(document.body).findByText('글 1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('안 읽음이 없으면 버튼을 보이지 않는다', async () => {
    vi.spyOn(apiClient, 'listEntriesAfter').mockResolvedValue(makeEntries(1, 2));
    renderTimeline({ unreadCount: 0, latestEntryId: 2 });

    await screen.findByText('글 1');
    expect(screen.queryByRole('button', { name: /안 읽음/ })).toBeNull();
  });
});
