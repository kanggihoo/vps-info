/** Feed 운영과 수집기·LLM·DeepL 상태를 확인하는 별도 관리자 화면(ADR-0017). */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminFeed, AdminOverview, DeepLUsageView, LlmModelsView } from '@trendboda/api-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from 'cn';
import { apiClient } from './api-client.ts';
import { AdminFeedControl } from './admin-feed-control.tsx';
import { AdminHistory } from './admin-history.tsx';
import { describeAdminFeed, formatAdminDate, formatInterval } from './admin-display.ts';

const collectorLabels = { unknown: '아직 응답 기록이 없습니다', alive: '응답 중', stale: '수집기 응답 확인 안 됨', stopped: '수집기 정상 종료' };

/** 관리 화면. 수집 상태는 화면을 보는 동안만 10초마다 갱신한다. */
export function AdminPanel() {
  const [overview, setOverview] = useState<AdminOverview>();
  const [error, setError] = useState('');
  const [selectedFeedId, setSelectedFeedId] = useState<string>();
  const active = useRef(false);
  const requestVersion = useRef(0);
  const historyRegion = useRef<HTMLDivElement>(null);
  const mainRegion = useRef<HTMLElement>(null);
  const showHistory = useCallback(() => {
    const main = mainRegion.current;
    const history = historyRegion.current;
    if (main && history) main.scrollTo({ top: main.scrollTop + history.getBoundingClientRect().top - main.getBoundingClientRect().top });
  }, []);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const result = await apiClient.getAdminOverview();
      if (active.current && version === requestVersion.current) { setOverview(result); setError(''); }
    } catch (reason) {
      if (active.current && version === requestVersion.current) setError(reason instanceof Error ? reason.message : '관리 상태를 불러오지 못했습니다.');
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10_000);
    return () => { active.current = false; requestVersion.current++; window.clearInterval(timer); };
  }, [refresh]);
  const selectedFeed = overview?.feeds.find((feed) => feed.id === selectedFeedId);
  useEffect(() => {
    if (selectedFeedId) showHistory();
  }, [selectedFeedId, showHistory]);
  const selectFeed = (id: string) => {
    setSelectedFeedId(id);
    if (id === selectedFeedId) showHistory();
  };

  return <main ref={mainRegion} className="relative min-h-0 min-w-0 overflow-y-auto bg-background" aria-label="관리자 패널">
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-4 md:p-6">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-panel-title">시스템 관리</h1><p className="mt-1 text-caption text-muted-foreground">Feed 수집 상태와 운영 설정</p></div>
        <Button variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" onClick={() => void refresh()}>수집 상태 새로고침</Button>
      </header>
      {error && <p role="alert" className="text-caption text-destructive">{error} <button className="min-h-11 underline focus-visible:ring-2 focus-visible:ring-ring md:min-h-0" onClick={() => void refresh()}>다시 시도</button></p>}
      <div className="grid gap-3 xl:grid-cols-3">
        <section className="rounded-lg border bg-card p-4" aria-label="수집기 상태">
          <h2 className="text-entry-title">수집기</h2>
          {!overview ? <Skeleton className="mt-3 h-16 w-full rounded-sm" /> : <>
            <p className={cn('mt-3 text-body-sm-medium', ['stale', 'stopped'].includes(overview.collector.status) && 'text-warn-ink')}>{collectorLabels[overview.collector.status]}</p>
            <p className="mt-2 text-caption text-muted-foreground">마지막 응답 <span className="font-mono">{formatAdminDate(overview.collector.lastSeenAt)}</span></p>
            <p className="mt-1 text-caption text-muted-foreground">{overview.collector.runningFeedId
              ? `실행 중: ${overview.feeds.find((feed) => feed.id === overview.collector.runningFeedId)?.title ?? overview.collector.runningFeedId}`
              : '실행 중인 Feed 없음'}</p>
          </>}
        </section>
        <AdminIntegrations />
      </div>
      {!overview && !error ? <div aria-busy="true" aria-label="Feed 운영 상태 불러오는 중" className="space-y-2">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-16 w-full rounded-sm" />)}</div>
        : overview && <>
          <AdminFeedTable title="Feed 운영" feeds={overview.feeds.filter((feed) => !feed.wanted)} selectedFeedId={selectedFeedId} onSelect={selectFeed} onChanged={refresh} />
          <AdminFeedTable title="원티드" description="맥이 켜져 있을 때 수집을 요청합니다. 수동 수집도 맥의 프록시 연결이 필요합니다."
            feeds={overview.feeds.filter((feed) => feed.wanted)} selectedFeedId={selectedFeedId} onSelect={selectFeed} onChanged={refresh} />
        </>}
      {selectedFeed ? <div ref={historyRegion}><AdminHistory key={selectedFeed.id} feedId={selectedFeed.id} title={selectedFeed.title} latestAttempt={selectedFeed.latestAttempt} /></div>
        : overview && <p className="text-body-sm text-muted-foreground">Feed의 이름을 누르면 수집 이력과 오류 상세가 표시됩니다.</p>}
    </div>
  </main>;
}

function AdminFeedTable({ title, description, feeds, selectedFeedId, onSelect, onChanged }: {
  title: string; description?: string; feeds: AdminFeed[]; selectedFeedId?: string; onSelect: (id: string) => void; onChanged: () => Promise<void>;
}) {
  return <section className="min-w-0 rounded-lg border bg-card p-4" aria-label={title}>
    <h2 className="text-entry-title">{title} <span className="font-mono text-caption text-muted-foreground">{feeds.length}</span></h2>
    {description && <p className="mt-1 text-caption text-muted-foreground">{description}</p>}
    {!feeds.length ? <p className="mt-3 text-caption text-muted-foreground">등록된 Feed가 없습니다.</p> : <div className="mt-3">
      <Table className="min-w-[960px] text-caption">
        <TableHeader><TableRow><TableHead>Feed</TableHead><TableHead>상태</TableHead><TableHead>주기</TableHead><TableHead>최근 성공</TableHead><TableHead>다음 실행</TableHead><TableHead>운영</TableHead></TableRow></TableHeader>
        <TableBody>{feeds.map((feed) => <TableRow key={feed.id} data-state={feed.id === selectedFeedId ? 'selected' : undefined}>
          <TableCell><button className="min-h-11 max-w-56 whitespace-normal text-left text-body-sm-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
            onClick={() => onSelect(feed.id)} aria-label={`${feed.title} 수집 이력 보기`}>{feed.title}</button><p className="mt-1 text-caption text-muted-foreground">{feed.kind === 'ranked' ? 'Ranked' : 'Stream'}</p></TableCell>
          <TableCell className={feed.consecutiveFailures > 0 ? 'text-destructive' : ''}>{describeAdminFeed(feed)}{feed.paused && ['실행 중', '요청됨'].includes(describeAdminFeed(feed)) && <p className="text-muted-foreground">자동 수집 일시정지</p>}</TableCell>
          <TableCell className="font-mono tabular-nums">{feed.wanted ? '맥에서 요청' : formatInterval(feed.intervalMinutes)}</TableCell>
          <TableCell className="font-mono tabular-nums">{formatAdminDate(feed.lastSuccessAt)}</TableCell>
          <TableCell className="font-mono tabular-nums">{feed.wanted ? '맥에서 요청 시' : feed.paused ? '자동 수집 일시정지' : formatAdminDate(feed.nextRunAt)}</TableCell>
          <TableCell><AdminFeedControl feed={feed} onChanged={onChanged} /></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>}
  </section>;
}

function AdminIntegrations() {
  const [models, setModels] = useState<LlmModelsView>();
  const [usage, setUsage] = useState<DeepLUsageView>();
  const [llmError, setLlmError] = useState('');
  const [usageError, setUsageError] = useState('');
  const [loading, setLoading] = useState(true);
  const active = useRef(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([apiClient.listLlmModels(), apiClient.getDeepLUsage()]);
    if (!active.current) return;
    const [llm, deepl] = results;
    if (llm.status === 'fulfilled') { setModels(llm.value); setLlmError(''); }
    else { setModels(undefined); setLlmError(llm.reason instanceof Error ? llm.reason.message : 'LLM에 연결하지 못했습니다.'); }
    if (deepl.status === 'fulfilled') { setUsage(deepl.value); setUsageError(''); }
    else { setUsage(undefined); setUsageError(deepl.reason instanceof Error ? deepl.reason.message : 'DeepL 사용량을 조회하지 못했습니다.'); }
    setLoading(false);
  }, []);
  useEffect(() => { active.current = true; void refresh(); return () => { active.current = false; }; }, [refresh]);
  return <>
    <section className="rounded-lg border bg-card p-4" aria-label="LLM 연결 상태">
      <div className="flex items-center justify-between gap-2"><h2 className="text-entry-title">LLM</h2><Button variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" disabled={loading} onClick={() => void refresh()}>새로고침</Button></div>
      {loading ? <Skeleton className="mt-3 h-16 w-full rounded-sm" /> : llmError ? <p role="alert" className="mt-3 text-caption text-destructive">{llmError}</p> : <>
        <p className="mt-3 text-body-sm-medium">서비스 연결됨</p>
        <p className="mt-2 text-caption text-muted-foreground">{models?.engines.map((engine) => `${engine.title}: 인증 정보 ${engine.available ? '있음' : '없음'}`).join(' · ')}</p>
      </>}
    </section>
    <section className="rounded-lg border bg-card p-4" aria-label="DeepL 사용량">
      <div className="flex items-center justify-between gap-2"><h2 className="text-entry-title">DeepL</h2><Button variant="outline" size="sm" className="min-h-11 rounded-full text-caption shadow-none md:min-h-8" disabled={loading} onClick={() => void refresh()}>새로고침</Button></div>
      {loading ? <Skeleton className="mt-3 h-16 w-full rounded-sm" /> : usageError ? <p role="alert" className="mt-3 text-caption text-destructive">{usageError}</p> : usage && <>
        <p className="mt-3 text-caption text-muted-foreground">계정 사용량 · 현재 과금 기간</p>
        <p className="mt-1 font-mono text-body-sm-medium tabular-nums">{usage.characterCount.toLocaleString()} / {usage.characterLimit === null ? '한도 미설정' : usage.characterLimit.toLocaleString()} 문자</p>
        {usage.characterLimit !== null && <p className="mt-1 font-mono text-caption text-muted-foreground">{(usage.characterLimit > 0 ? usage.characterCount / usage.characterLimit * 100 : 0).toFixed(1)}% 사용</p>}
        {usage.apiKeyCharacterCount !== null && <p className="mt-2 text-caption text-muted-foreground">현재 키 <span className="font-mono">{usage.apiKeyCharacterCount.toLocaleString()} / {usage.apiKeyCharacterLimit === null ? '한도 미설정' : usage.apiKeyCharacterLimit.toLocaleString()}</span> 문자</p>}
        {usage.periodStart && usage.periodEnd && <p className="mt-1 text-caption text-muted-foreground">{formatAdminDate(usage.periodStart)} ~ {formatAdminDate(usage.periodEnd)}</p>}
        <p className="mt-2 text-caption text-muted-foreground">조회 <span className="font-mono">{formatAdminDate(usage.checkedAt)}</span> · 사용량 반영에는 지연이 있을 수 있습니다.</p>
      </>}
    </section>
  </>;
}
