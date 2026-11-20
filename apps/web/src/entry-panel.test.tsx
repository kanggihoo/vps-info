// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EntryView, FeedTitledEntryView } from '@trendboda/api-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError, apiClient } from './api-client.ts';
import { EntryChangesProvider } from './entry-changes.tsx';
import { EntryPanel } from './entry-panel.tsx';

const entry: EntryView = {
  id: 7,
  feedId: 'hn-best',
  url: 'https://example.com/7',
  title: '펼친 Entry 제목',
  publishedAt: null,
  author: null,
  summary: '이 Entry의 요약입니다.',
  extra: null,
  firstSeenAt: '2026-11-18T00:00:00.000Z',
  openedAt: null,
  bookmarkedAt: null,
  translatedTitle: null,
  translatedSummary: null,
};

const titledEntry: FeedTitledEntryView = { ...entry, feedTitle: 'Hacker News Best' };

/** 테스트가 직접 끝내는 요청. 요청이 진행 중인 동안의 화면을 확인할 때 쓴다. */
function makeDeferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/** `selection`을 주면 목록에서 고른 것이고, 주지 않으면 화면 주소로 바로 연 것이다. */
function renderPanel({ withSelection }: { withSelection: boolean }) {
  return render(
    <TooltipProvider>
      <EntryChangesProvider>
        <EntryPanel
          entryId={entry.id}
          selection={withSelection ? { entry } : undefined}
          feeds={[]}
          onClose={() => {}}
          llmChoice={undefined}
          llmChoiceTitle=""
        />
      </EntryChangesProvider>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(apiClient, 'markOpened').mockResolvedValue(undefined);
  // 버튼에 마우스를 올리면 Radix 툴팁이 열리며 ResizeObserver를 쓴다. jsdom에는 없다.
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EntryPanel 주소로 바로 열기', () => {
  it('받는 동안 불러오는 중 표시를 보이고, 받으면 Entry와 Feed 이름을 보여 준다', async () => {
    const getEntry = vi.spyOn(apiClient, 'getEntry').mockResolvedValue(titledEntry);
    renderPanel({ withSelection: false });

    expect(screen.getByLabelText('불러오는 중')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: '펼친 Entry 제목' })).toBeTruthy();
    expect(screen.getByText('Hacker News Best')).toBeTruthy();
    expect(getEntry).toHaveBeenCalledWith(entry.id);
  });

  it('없는 Entry면 안내 문구를 보여 준다', async () => {
    vi.spyOn(apiClient, 'getEntry').mockRejectedValue(new ApiError('not found', 404, undefined));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel({ withSelection: false });

    expect(await screen.findByText('없는 Entry입니다. 목록에서 다른 Entry를 고르세요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });

  it('받기에 실패하면 오류를 보이고, 다시 시도하는 동안 오류 대신 불러오는 중 표시를 보인다', async () => {
    const retryRequest = makeDeferred<FeedTitledEntryView>();
    const getEntry = vi
      .spyOn(apiClient, 'getEntry')
      .mockRejectedValueOnce(new Error('network down'))
      .mockReturnValueOnce(retryRequest.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel({ withSelection: false });

    expect((await screen.findByRole('alert')).textContent).toContain('Entry를 불러오지 못했습니다.');
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'network down' }));

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('불러오는 중')).toBeTruthy();
    await act(async () => retryRequest.resolve(titledEntry));
    expect(screen.getByRole('heading', { name: '펼친 Entry 제목' })).toBeTruthy();
    expect(getEntry).toHaveBeenCalledTimes(2);
  });

  it('다시 시도도 실패하면 오류를 다시 보여 준다', async () => {
    vi.spyOn(apiClient, 'getEntry').mockRejectedValue(new Error('still down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel({ withSelection: false });
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(apiClient.getEntry).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('alert')).textContent).toContain('Entry를 불러오지 못했습니다.');
  });
});

describe('EntryPanel 목록에서 골랐을 때', () => {
  it('Entry를 다시 받지 않고 바로 보여 주며 처음 열었다고 서버에 한 번 알린다', async () => {
    const getEntry = vi.spyOn(apiClient, 'getEntry');
    renderPanel({ withSelection: true });

    expect(screen.getByRole('heading', { name: '펼친 Entry 제목' })).toBeTruthy();
    expect(screen.getByText('이 Entry의 요약입니다.')).toBeTruthy();
    await waitFor(() => expect(apiClient.markOpened).toHaveBeenCalledWith(entry.id));
    expect(apiClient.markOpened).toHaveBeenCalledTimes(1);
    expect(getEntry).not.toHaveBeenCalled();
  });
});

describe('EntryPanel Bookmark 버튼', () => {
  it('누르면 저장하는 동안 버튼을 막고 안내하며, 끝나면 눌린 상태로 바꾼다', async () => {
    const saveRequest = makeDeferred<undefined>();
    const setBookmarked = vi.spyOn(apiClient, 'setBookmarked').mockReturnValue(saveRequest.promise);
    renderPanel({ withSelection: true });

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));

    expect(setBookmarked).toHaveBeenCalledWith(entry.id, true);
    expect((screen.getByRole('button', { name: 'Bookmark' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Bookmark를 저장하는 중입니다.');
    await act(async () => saveRequest.resolve(undefined));
    const pressedButton = screen.getByRole('button', { name: 'Bookmark 해제' });
    expect(pressedButton.getAttribute('aria-pressed')).toBe('true');
    expect((pressedButton as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('저장에 실패하면 안내를 보이고 상태는 그대로 두며, 다시 눌러 성공하면 안내를 지운다', async () => {
    vi.spyOn(apiClient, 'setBookmarked').mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(undefined);
    renderPanel({ withSelection: true });

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Bookmark를 변경하지 못했습니다. 다시 시도하세요.');
    expect(screen.getByRole('button', { name: 'Bookmark' }).getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(screen.getByRole('button', { name: 'Bookmark' }));

    await screen.findByRole('button', { name: 'Bookmark 해제' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('EntryPanel 복사 버튼', () => {
  it('누르면 제목·출처·요약을 담은 Markdown을 클립보드에 쓰고 복사됨을 알린다', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderPanel({ withSelection: true });

    await user.click(screen.getByRole('button', { name: '복사' }));
    // "복사됨"은 1.5초 뒤 사라진다. findBy*로 polling하면 느린 CI에서 찾기 전에 사라지므로,
    // act로 클립보드 쓰기 뒤의 상태 변경을 끝낸 다음 기다리지 않고 바로 찾는다.
    await act(async () => {});

    screen.getByRole('button', { name: '복사됨' });
    expect(screen.getByRole('status').textContent).toBe('복사됨');
    const [copiedText] = writeText.mock.calls[0];
    expect(copiedText).toContain('title: "펼친 Entry 제목"');
    expect(copiedText).toContain('source: "https://example.com/7"');
    expect(copiedText).toContain('이 Entry의 요약입니다.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('클립보드에 쓰지 못하면 권한을 확인하라고 안내한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    renderPanel({ withSelection: true });

    await user.click(screen.getByRole('button', { name: '복사' }));

    expect((await screen.findByRole('alert')).textContent).toBe('복사하지 못했습니다. 클립보드 권한을 확인하고 다시 시도하세요.');
    expect(screen.getByRole('button', { name: '복사' })).toBeTruthy();
  });
});
