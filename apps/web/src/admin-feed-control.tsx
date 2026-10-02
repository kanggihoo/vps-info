/** Feed 한 행의 주기 변경·일시정지·재개·수동 요청. 원티드는 수동 요청만 제공한다(ADR-0017). */
import { useEffect, useState } from 'react';
import type { AdminFeed } from '@trendboda/api-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from './api-client.ts';
import { formatAdminDate, previewNextRunAt } from './admin-display.ts';

/** Feed 조치 버튼을 제공하고 변경 결과를 즉시 상위 상태 조회에 반영한다. */
export function AdminFeedControl({ feed, onChanged }: { feed: AdminFeed; onChanged: () => Promise<void> }) {
  const [interval, setIntervalInput] = useState(String(feed.intervalMinutes));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { setIntervalInput(String(feed.intervalMinutes)); }, [feed.intervalMinutes]);
  const minutes = Number(interval);
  const valid = interval.trim() !== '' && Number.isInteger(minutes) && minutes >= 1 && minutes <= 525600;
  const changed = valid && minutes !== feed.intervalMinutes;
  const busy = feed.manualRequestedAt !== null || feed.latestAttempt?.status === 'running';

  const act = async (action: () => Promise<unknown>, success: string) => {
    setPending(true);
    setMessage('');
    setFailed(false);
    try {
      await action();
      setMessage(success);
      await onChanged();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : '변경을 반영하지 못했습니다.');
    } finally { setPending(false); }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {!feed.wanted && <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (changed && !pending) void act(() => apiClient.updateAdminFeed(feed.id, { intervalMinutes: minutes }), '주기를 변경했습니다.');
      }}>
        <label htmlFor={`interval-${feed.id}`} className="sr-only">{feed.title} 수집 주기, 분</label>
        <Input id={`interval-${feed.id}`} type="number" min={1} max={525600} step={1} value={interval} disabled={pending}
          onChange={(event) => setIntervalInput(event.target.value)} aria-invalid={!valid}
          className="min-h-11 w-24 rounded-sm md:min-h-9 font-mono text-caption shadow-none md:text-caption focus-visible:ring-2" />
        <span className="text-caption text-muted-foreground">분</span>
        <Button type="submit" variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" disabled={!changed || pending}>저장</Button>
        <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" disabled={pending}
          onClick={() => void act(() => apiClient.updateAdminFeed(feed.id, { paused: !feed.paused }), feed.paused ? '재개했습니다.' : '자동 수집을 일시정지했습니다.')}>
          {feed.paused ? '재개' : '일시정지'}
        </Button>
      </form>}
      {changed && !feed.wanted && <p className="text-caption text-muted-foreground">
        {feed.paused ? '자동 수집은 재개할 때 시작합니다.' : `저장 시 다음 ${feed.consecutiveFailures ? '재시도' : '수집'} ${formatAdminDate(previewNextRunAt(feed.consecutiveFailures, minutes))} 예상`}
      </p>}
      <div>
        <Button variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" disabled={busy || pending}
          onClick={() => void act(() => apiClient.requestFeedFetch(feed.id), '수집을 요청했습니다. 수집기가 순서대로 처리합니다.')}>
          {feed.latestAttempt?.status === 'running' ? '실행 중' : feed.manualRequestedAt ? '요청됨' : '지금 수집 요청'}
        </Button>
      </div>
      {message && <p role={failed ? 'alert' : 'status'} className={`max-w-sm whitespace-normal text-caption ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>}
    </div>
  );
}
