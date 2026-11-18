// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedSummary, FeedTitledEntryView, RankedEntryView, RankSnapshotView } from '@trendboda/api-types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app.tsx';
import { apiClient } from './api-client.ts';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EntryChangesProvider } from './entry-changes.tsx';

const WIDE_DETAIL_QUERY = '(min-width: 1024px)';

/** 화면 너비를 테스트가 바꿀 수 있는 matchMedia. 1024px 이상(`lg`)과 768px 이상(`md`)만 구분한다. */
function stubViewportWidth(initialWide: boolean) {
  let wide = initialWide;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === WIDE_DETAIL_QUERY ? wide : query === '(min-width: 768px)';
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => { if (query === WIDE_DETAIL_QUERY) listeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
  }));
  return (nextWide: boolean) => {
    wide = nextWide;
    act(() => listeners.forEach((listener) => listener()));
  };
}

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

function makeRankedEntry(id: number, rank: number): RankedEntryView {
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
  entries: [makeRankedEntry(1, 1), makeRankedEntry(2, 2)],
  droppedEntries: [],
};

function stubApi() {
  vi.spyOn(apiClient, 'listFeeds').mockResolvedValue([feed]);
  vi.spyOn(apiClient, 'listFeedGroups').mockResolvedValue([]);
  vi.spyOn(apiClient, 'getFeedNavigationOrder').mockResolvedValue({ stream: [], ranked: [{ kind: 'feed', id: feed.id }] });
  vi.spyOn(apiClient, 'listLlmModels').mockResolvedValue({ engines: [] });
  vi.spyOn(apiClient, 'getRankSnapshot').mockResolvedValue(snapshot);
  vi.spyOn(apiClient, 'markOpened').mockResolvedValue(undefined);
  vi.spyOn(apiClient, 'setBookmarked').mockResolvedValue(undefined);
  vi.spyOn(apiClient, 'getEntry').mockImplementation(async (entryId) => ({
    ...makeRankedEntry(entryId, entryId),
    feedTitle: feed.title,
  }) satisfies FeedTitledEntryView);
}

function renderApp() {
  return render(
    <TooltipProvider>
      <EntryChangesProvider>
        <App />
      </EntryChangesProvider>
    </TooltipProvider>,
  );
}

/** 목록에 카드가 뜰 때까지 기다린다. */
async function renderLoadedApp() {
  const view = renderApp();
  await screen.findByRole('link', { name: '글 1' });
  return view;
}

function getPanel(name: 'feeds' | 'entries' | 'detail'): HTMLElement {
  const panel = document.querySelector<HTMLElement>(`[data-reading-panel="${name}"]`);
  if (!panel) throw new Error(`${name} 패널이 없습니다.`);
  return panel;
}

async function openEntry(title: string) {
  await userEvent.click(screen.getByRole('link', { name: title }));
  await waitFor(() => expect(document.querySelector('[data-reading-panel="detail"]')).not.toBeNull());
}

beforeAll(() => {
  // jsdom에는 레이아웃이 없다. 이 두 메서드는 구현돼 있지 않거나 항상 비어 있다.
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  window.location.hash = '#/feeds/hn-best';
  stubApi();
  // 레이아웃이 없으면 모든 요소가 "안 보이는" 것으로 계산돼 포커스 이동 대상이 사라진다.
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.location.hash = '';
  localStorage.clear();
});

describe('App Entry 선택', () => {
  it('카드를 누르면 주소 해시가 그 Entry로 바뀌고 펼친 Entry로 포커스가 옮겨 간다', async () => {
    stubViewportWidth(true);
    await renderLoadedApp();
    expect(document.querySelector('[data-reading-panel="detail"]')).toBeNull();

    await openEntry('글 2');

    expect(window.location.hash).toBe('#/feeds/hn-best/entries/2');
    await waitFor(() => expect(document.activeElement).toBe(getPanel('detail')));
    // 목록에서 고른 Entry를 다시 조회하지 않고 그대로 쓴다.
    expect(apiClient.getEntry).not.toHaveBeenCalled();
    expect(apiClient.markOpened).toHaveBeenCalledWith(2);
  });

  it('카드 링크는 Feed 화면에서는 Entry 해시를 가리킨다', async () => {
    stubViewportWidth(true);
    await renderLoadedApp();

    expect(screen.getByRole('link', { name: '글 1' }).getAttribute('href')).toBe('#/feeds/hn-best/entries/1');
    expect(screen.getByRole('link', { name: '글 2' }).getAttribute('href')).toBe('#/feeds/hn-best/entries/2');
  });
});

describe('App 좁은 화면의 펼친 Entry 숨김', () => {
  it('2번 키로 목록으로, 3번 키로 펼친 Entry로 돌아간다', async () => {
    stubViewportWidth(false);
    await renderLoadedApp();
    await openEntry('글 1');
    await waitFor(() => expect(document.activeElement).toBe(getPanel('detail')));
    expect(getPanel('detail').hidden).toBe(false);

    await userEvent.keyboard('2');

    await waitFor(() => expect(getPanel('detail').hidden).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: '글 1' })));

    await userEvent.keyboard('3');

    await waitFor(() => expect(getPanel('detail').hidden).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(getPanel('detail')));
  });

  it('목록에서 다른 카드를 고르면 숨겨 둔 펼친 Entry가 다시 보인다', async () => {
    stubViewportWidth(false);
    await renderLoadedApp();
    await openEntry('글 1');
    await userEvent.keyboard('2');
    await waitFor(() => expect(getPanel('detail').hidden).toBe(true));

    await userEvent.click(screen.getByRole('link', { name: '글 2' }));

    await waitFor(() => expect(window.location.hash).toBe('#/feeds/hn-best/entries/2'));
    await waitFor(() => expect(getPanel('detail').hidden).toBe(false));
  });

  it('주소의 Entry가 바뀌면(뒤로 가기 등) 숨겨 둔 펼친 Entry가 다시 보인다', async () => {
    stubViewportWidth(false);
    await renderLoadedApp();
    await openEntry('글 1');
    await userEvent.keyboard('2');
    await waitFor(() => expect(getPanel('detail').hidden).toBe(true));

    act(() => {
      window.location.hash = '#/feeds/hn-best/entries/2';
    });

    await waitFor(() => expect(getPanel('detail').hidden).toBe(false));
    // 주소로 바로 연 Entry는 목록이 가진 값이 없어 서버에서 받는다.
    await waitFor(() => expect(apiClient.getEntry).toHaveBeenCalledWith(2));
  });

  it('화면을 넓혔다가 다시 좁히면 예전에 숨겨 둔 상태를 기억하지 않는다', async () => {
    const setWide = stubViewportWidth(false);
    await renderLoadedApp();
    await openEntry('글 1');
    await userEvent.keyboard('2');
    await waitFor(() => expect(getPanel('detail').hidden).toBe(true));

    setWide(true);
    await waitFor(() => expect(getPanel('detail').hidden).toBe(false));
    setWide(false);

    await waitFor(() => expect(getPanel('entries').hasAttribute('inert')).toBe(true));
    expect(getPanel('detail').hidden).toBe(false);
  });
});

describe('App 키보드 단축키', () => {
  it('넓은 화면에서 1·2·3번 키로 Feed 목록, Entry 목록, 펼친 Entry로 포커스를 옮긴다', async () => {
    stubViewportWidth(true);
    await renderLoadedApp();
    await openEntry('글 1');
    await waitFor(() => expect(document.activeElement).toBe(getPanel('detail')));

    await userEvent.keyboard('2');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: '글 1' })));

    await userEvent.keyboard('1');
    await waitFor(() => expect(getPanel('feeds').contains(document.activeElement)).toBe(true));

    await userEvent.keyboard('3');
    await waitFor(() => expect(document.activeElement).toBe(getPanel('detail')));
    // 넓은 화면은 두 패널이 함께 보이므로 숨기지 않는다.
    expect(getPanel('detail').hidden).toBe(false);
  });

  it('Entry 목록에서 위·아래 화살표 키로 카드 사이를 옮긴다', async () => {
    stubViewportWidth(true);
    await renderLoadedApp();
    screen.getByRole('link', { name: '글 1' }).focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: '글 2' }));

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: '글 2' }));

    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: '글 1' }));
  });

  it('펼친 Entry가 있을 때 B 키는 도구줄의 Bookmark 버튼을 눌러 Bookmark를 저장한다', async () => {
    stubViewportWidth(true);
    await renderLoadedApp();
    await openEntry('글 1');
    await waitFor(() => expect(document.activeElement).toBe(getPanel('detail')));

    await userEvent.keyboard('b');

    await waitFor(() => expect(apiClient.setBookmarked).toHaveBeenCalledExactlyOnceWith(1, true));
  });

  it('펼친 Entry가 없으면 도구 단축키를 무시한다', async () => {
    stubViewportWidth(true);
    await renderLoadedApp();
    screen.getByRole('link', { name: '글 1' }).focus();

    await userEvent.keyboard('b');

    expect(apiClient.setBookmarked).not.toHaveBeenCalled();
  });

  it('앱 바깥에서 일어난 키 입력은 처리하지 않는다', async () => {
    stubViewportWidth(false);
    await renderLoadedApp();
    await openEntry('글 1');
    await waitFor(() => expect(document.activeElement).toBe(getPanel('detail')));
    // App 밖에 붙은 요소가 읽기 패널 표시(data-reading-panel)를 달고 있어도 App의 단축키가 가로채면 안 된다.
    const outsidePanel = document.body.appendChild(document.createElement('div'));
    outsidePanel.dataset.readingPanel = 'entries';
    const outside = outsidePanel.appendChild(document.createElement('button'));
    outside.focus();
    expect(document.activeElement).toBe(outside);

    await userEvent.keyboard('2');

    expect(getPanel('detail').hidden).toBe(false);
    outsidePanel.remove();
  });

  it('입력창에 글을 쓰는 중에는 단축키로 처리하지 않는다', async () => {
    stubViewportWidth(false);
    await renderLoadedApp();
    await openEntry('글 1');
    await waitFor(() => expect(document.activeElement).toBe(getPanel('detail')));
    const input = getPanel('detail').appendChild(document.createElement('input'));
    input.focus();

    await userEvent.keyboard('2');

    expect(getPanel('detail').hidden).toBe(false);
    expect(input.value).toBe('2');
  });

  it('화면을 닫으면 window의 keydown 처리를 제거한다', async () => {
    stubViewportWidth(true);
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = await renderLoadedApp();
    const keydownRegistration = addEventListener.mock.calls.find(([type]) => type === 'keydown');
    expect(keydownRegistration).toBeDefined();

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('keydown', keydownRegistration?.[1]);
  });
});
