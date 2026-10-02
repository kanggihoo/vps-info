/** 한 Feed의 수집 이력을 50건씩 조회하고 성공·실패 및 오류 상세를 보여준다(ADR-0017). */
import { useEffect, useRef, useState } from 'react';
import type { AdminAttemptPage, AdminFetchAttempt } from '@trendboda/api-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiClient } from './api-client.ts';
import { formatAdminDate } from './admin-display.ts';

/** 선택한 Feed의 이력. 최신 상태가 바뀌면 현재 조회 페이지를 다시 읽는다. */
export function AdminHistory({ feedId, title, latestAttempt }: { feedId: string; title: string; latestAttempt: AdminFetchAttempt | null }) {
  const [status, setStatus] = useState<'' | 'success' | 'failed'>('');
  const [before, setBefore] = useState<number | undefined>();
  const [page, setPage] = useState<AdminAttemptPage>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const requestVersion = useRef(0);
  useEffect(() => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    apiClient.listAdminAttempts(feedId, status || undefined, before).then((result) => {
      if (version === requestVersion.current) setPage(result);
    }).catch((reason: unknown) => {
      if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : '이력을 불러오지 못했습니다.');
    }).finally(() => { if (version === requestVersion.current) setLoading(false); });
    return () => { requestVersion.current++; };
  }, [feedId, status, before, refresh, latestAttempt?.id, latestAttempt?.status]);

  return <section className="rounded-lg border bg-card p-4" aria-label={`${title} 수집 이력`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-entry-title">{title} 수집 이력</h2>
      <div className="flex items-center gap-2">
        <label htmlFor="attempt-status" className="sr-only">수집 결과 필터</label>
        <select id="attempt-status" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setBefore(undefined); }}
          className="min-h-11 rounded-full border border-input bg-background px-3 text-caption focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">전체</option><option value="success">성공</option><option value="failed">실패</option>
        </select>
        <Button variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" disabled={loading} onClick={() => { setBefore(undefined); setRefresh((value) => value + 1); }}>최신 기록</Button>
      </div>
    </div>
    {error ? <div role="alert" className="flex items-center gap-3 text-caption text-destructive">{error}
      <Button variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" onClick={() => setRefresh((value) => value + 1)}>다시 시도</Button></div>
      : loading ? <div aria-busy="true" aria-label="수집 이력 불러오는 중" className="space-y-2">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-10 w-full rounded-sm" />)}</div>
      : !page?.attempts.length ? <p className="text-body-sm text-muted-foreground">조건에 맞는 수집 이력이 없습니다. 수집을 요청하면 여기에 기록됩니다.</p>
      : <>
        <Table className="min-w-[640px] text-caption">
          <TableHeader><TableRow><TableHead>시작</TableHead><TableHead>결과</TableHead><TableHead>소요 시간</TableHead><TableHead>새 Entry</TableHead><TableHead>오류</TableHead></TableRow></TableHeader>
          <TableBody>{page.attempts.map((attempt) => <TableRow key={attempt.id}>
            <TableCell className="font-mono tabular-nums">{formatAdminDate(attempt.startedAt)}</TableCell>
            <TableCell className={attempt.status === 'failed' ? 'text-destructive' : ''}>{attempt.status === 'success' ? '성공' : attempt.status === 'failed' ? '실패' : '실행 중'}</TableCell>
            <TableCell className="font-mono tabular-nums">{attempt.finishedAt ? `${Math.max(0, (Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt)) / 1000).toFixed(1)}초` : '진행 중'}</TableCell>
            <TableCell className="font-mono tabular-nums">{attempt.insertedEntryCount ?? '기록 없음'}</TableCell>
            <TableCell className="max-w-sm whitespace-normal break-words">{attempt.errorMessage ? <details><summary className="min-h-11 cursor-pointer text-destructive focus-visible:ring-2 focus-visible:ring-ring md:min-h-0">오류 상세</summary><p className="mt-2 break-all">{attempt.errorMessage}</p></details> : '없음'}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <div className="mt-4 flex items-center justify-between gap-2 text-caption text-muted-foreground">
          <span>최대 50건 · 최신순</span>
          {page.nextBefore !== null && <Button variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" onClick={() => setBefore(page.nextBefore!)}>이전 기록</Button>}
        </div>
      </>}
  </section>;
}
