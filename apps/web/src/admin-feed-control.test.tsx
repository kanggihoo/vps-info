// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminFeed } from '@trendboda/api-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminFeedControl } from './admin-feed-control.tsx';
import { apiClient } from './api-client.ts';

const feed: AdminFeed = {
  id: 'hn-best',
  title: 'Hacker News Best',
  kind: 'ranked',
  wanted: false,
  intervalMinutes: 60,
  nextRunAt: '2026-11-18T03:00:00.000Z',
  paused: false,
  manualRequestedAt: null,
  consecutiveFailures: 0,
  lastSuccessAt: '2026-11-18T02:00:00.000Z',
  latestAttempt: null,
};

function getIntervalInput(): HTMLInputElement {
  return screen.getByLabelText('Hacker News Best 수집 주기, 분');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminFeedControl 주기 입력', () => {
  it('서버에서 받은 주기가 바뀌면 입력 칸도 그 값으로 바뀐다', () => {
    const { rerender } = render(<AdminFeedControl feed={feed} onChanged={async () => {}} />);
    expect(getIntervalInput().value).toBe('60');

    rerender(<AdminFeedControl feed={{ ...feed, intervalMinutes: 120 }} onChanged={async () => {}} />);

    expect(getIntervalInput().value).toBe('120');
  });

  it('주기는 그대로이고 다른 값만 바뀌면 사용자가 입력 중인 값을 지우지 않는다', async () => {
    const { rerender } = render(<AdminFeedControl feed={feed} onChanged={async () => {}} />);
    await userEvent.clear(getIntervalInput());
    await userEvent.type(getIntervalInput(), '30');

    rerender(<AdminFeedControl feed={{ ...feed, consecutiveFailures: 2 }} onChanged={async () => {}} />);

    expect(getIntervalInput().value).toBe('30');
  });

  it('서버 주기가 바뀐 뒤에도 입력을 고치면 고친 값을 보여 준다', async () => {
    const { rerender } = render(<AdminFeedControl feed={feed} onChanged={async () => {}} />);
    rerender(<AdminFeedControl feed={{ ...feed, intervalMinutes: 120 }} onChanged={async () => {}} />);

    await userEvent.clear(getIntervalInput());
    await userEvent.type(getIntervalInput(), '15');

    expect(getIntervalInput().value).toBe('15');
  });

  it('값이 서버 주기와 같거나 올바르지 않으면 저장 버튼을 막는다', async () => {
    render(<AdminFeedControl feed={feed} onChanged={async () => {}} />);
    const saveButton = screen.getByRole('button', { name: '저장' });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    await userEvent.clear(getIntervalInput());
    await userEvent.type(getIntervalInput(), '0');
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    expect(getIntervalInput().getAttribute('aria-invalid')).toBe('true');

    await userEvent.clear(getIntervalInput());
    await userEvent.type(getIntervalInput(), '30');
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('AdminFeedControl 조치', () => {
  it('주기를 저장하면 서버에 보내고 결과를 알린 뒤 상위 상태를 다시 읽는다', async () => {
    const updateAdminFeed = vi.spyOn(apiClient, 'updateAdminFeed').mockResolvedValue(undefined as never);
    const onChanged = vi.fn(async () => {});
    render(<AdminFeedControl feed={feed} onChanged={onChanged} />);

    await userEvent.clear(getIntervalInput());
    await userEvent.type(getIntervalInput(), '30');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect((await screen.findByRole('status')).textContent).toBe('주기를 변경했습니다.');
    expect(updateAdminFeed).toHaveBeenCalledWith('hn-best', { intervalMinutes: 30 });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('저장에 실패하면 오류 안내를 보이고 상위 상태는 다시 읽지 않는다', async () => {
    vi.spyOn(apiClient, 'updateAdminFeed').mockRejectedValue(new Error('주기를 바꿀 수 없습니다.'));
    const onChanged = vi.fn(async () => {});
    render(<AdminFeedControl feed={feed} onChanged={onChanged} />);

    await userEvent.clear(getIntervalInput());
    await userEvent.type(getIntervalInput(), '30');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect((await screen.findByRole('alert')).textContent).toBe('주기를 바꿀 수 없습니다.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('일시정지 중이면 재개 버튼으로 바뀌고, 누르면 paused를 풀어 달라고 요청한다', async () => {
    const updateAdminFeed = vi.spyOn(apiClient, 'updateAdminFeed').mockResolvedValue(undefined as never);
    render(<AdminFeedControl feed={{ ...feed, paused: true }} onChanged={async () => {}} />);

    await userEvent.click(screen.getByRole('button', { name: '재개' }));

    expect((await screen.findByRole('status')).textContent).toBe('재개했습니다.');
    expect(updateAdminFeed).toHaveBeenCalledWith('hn-best', { paused: false });
  });

  it('수집 중이거나 이미 요청한 Feed는 지금 수집 요청 버튼을 막는다', () => {
    const { rerender } = render(<AdminFeedControl feed={{ ...feed, manualRequestedAt: '2026-11-18T02:30:00.000Z' }} onChanged={async () => {}} />);
    expect((screen.getByRole('button', { name: '요청됨' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <AdminFeedControl
        feed={{ ...feed, latestAttempt: { id: 1, feedId: feed.id, status: 'running', startedAt: '2026-11-18T02:40:00.000Z', finishedAt: null, insertedEntryCount: null, errorMessage: null } }}
        onChanged={async () => {}}
      />,
    );
    expect((screen.getByRole('button', { name: '실행 중' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('원티드 Feed는 주기 입력 없이 수동 수집 요청만 제공한다', async () => {
    const requestFeedFetch = vi.spyOn(apiClient, 'requestFeedFetch').mockResolvedValue(undefined as never);
    render(<AdminFeedControl feed={{ ...feed, wanted: true }} onChanged={async () => {}} />);

    expect(screen.queryByLabelText('Hacker News Best 수집 주기, 분')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '지금 수집 요청' }));

    await screen.findByText('수집을 요청했습니다. 수집기가 순서대로 처리합니다.');
    expect(requestFeedFetch).toHaveBeenCalledWith('hn-best');
  });
});
