/**
 * Ranked Feed의 순위표(ADR-0009). 최신 Rank Snapshot을 순위순으로 보여 주고,
 * 직전 Snapshot과 비교한 순위 변동·NEW·재진입과 점수 증감을 표시한다. 빠진 Entry는 아래에 접어 둔다.
 * Read Cursor가 없으므로 스크롤은 읽기 상태를 바꾸지 않는다.
 */
import { ChevronDown, ChevronUp, Minus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { EntryView, FeedSummary, RankedEntryView, RankSnapshotView } from '@trendboda/api-types';
import { Badge } from '@/components/ui/badge';
import { apiClient } from './api-client.ts';
import { findCardKind, findChangeMetricKey } from './card-kind.ts';
import { EntryCard } from './entry-card.tsx';
import { readNumber } from './entry-meta.tsx';
import { EmptyMessage, EntryListSkeleton, LoadError } from './load-states.tsx';

const takenAtFormatter = new Intl.DateTimeFormat('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const nextRunFormatter = new Intl.DateTimeFormat('ko', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

type RankTableProps = {
  feed: FeedSummary;
};

/** 카드에 보여 줄 Entry. 점수·댓글 수·스타 수는 처음 봤을 때의 값(`extra`) 대신 최신 수치로 덮는다. */
function withLatestMetrics(rankedEntry: RankedEntryView): EntryView {
  return { ...rankedEntry, extra: { ...rankedEntry.extra, ...rankedEntry.metrics } };
}

export function RankTable({ feed }: RankTableProps) {
  const [snapshot, setSnapshot] = useState<RankSnapshotView | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  const cardKind = findCardKind(feed.id, feed.group?.id);
  const changeMetricKey = findChangeMetricKey(cardKind);

  const loadSnapshot = useCallback(() => {
    setLoadFailed(false);
    apiClient
      .getRankSnapshot(feed.id)
      .then(setSnapshot)
      .catch((error: unknown) => {
        console.error(error);
        setLoadFailed(true);
      });
  }, [feed.id]);

  // 수집이 끝나면 nextRunAt이 바뀌므로, Feed 목록 갱신으로 새 Snapshot이 생긴 것을 알고 다시 받는다.
  useEffect(loadSnapshot, [loadSnapshot, feed.nextRunAt]);

  /** Opened At이나 Bookmark가 바뀐 Entry를 순위표와 빠짐 목록 양쪽에 반영한다. */
  const applyEntryChange = (changedEntry: EntryView) => {
    const applyTo = <Item extends EntryView>(item: Item): Item =>
      item.id === changedEntry.id ? { ...item, openedAt: changedEntry.openedAt, bookmarkedAt: changedEntry.bookmarkedAt } : item;
    setSnapshot((current) => current && { ...current, entries: current.entries.map(applyTo), droppedEntries: current.droppedEntries.map(applyTo) });
  };

  if (loadFailed) return <LoadError message="순위표를 불러오지 못했습니다." onRetry={loadSnapshot} />;
  if (!snapshot) return <EntryListSkeleton />;
  if (!snapshot.takenAt)
    return (
      <EmptyMessage>
        아직 순위표가 없습니다. 다음 수집은{' '}
        <span className="font-mono tabular-nums">{nextRunFormatter.format(new Date(feed.nextRunAt))}</span>입니다.
      </EmptyMessage>
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[760px] flex-col gap-2 p-4">
        <p className="text-caption text-muted-foreground">
          <span className="font-mono tabular-nums">{takenAtFormatter.format(new Date(snapshot.takenAt))}</span> 수집
          {snapshot.previousTakenAt && (
            <>
              {' '}
              · 직전 <span className="font-mono tabular-nums">{takenAtFormatter.format(new Date(snapshot.previousTakenAt))}</span>과 비교
            </>
          )}
        </p>
        <ol className="flex flex-col gap-2">
          {snapshot.entries.map((rankedEntry) => {
            const metric = readNumber(rankedEntry.metrics, changeMetricKey);
            const previousMetric = readNumber(rankedEntry.previousMetrics, changeMetricKey);
            return (
              <li key={rankedEntry.id} className="flex items-start gap-2 md:gap-3">
                <RankLabel rankedEntry={rankedEntry} />
                <div className="min-w-0 flex-1">
                  <EntryCard
                    entry={withLatestMetrics(rankedEntry)}
                    cardKind={cardKind}
                    metricChange={metric !== undefined && previousMetric !== undefined ? metric - previousMetric : undefined}
                    onEntryChange={applyEntryChange}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {snapshot.droppedEntries.length > 0 && (
          <details className="mt-4 group">
            <summary className="cursor-pointer rounded-xs py-1 text-caption-bold text-muted-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring">
              빠짐 <span className="font-mono tabular-nums">{snapshot.droppedEntries.length}</span>개
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {snapshot.droppedEntries.map((droppedEntry) => (
                <li key={droppedEntry.id} className="flex items-start gap-2 md:gap-3">
                  <div className="w-8 shrink-0 pt-3 text-center text-caption md:w-12 text-muted-foreground">
                    직전 <span className="font-mono tabular-nums">{droppedEntry.previousRank}</span>위
                  </div>
                  <div className="min-w-0 flex-1">
                    <EntryCard entry={droppedEntry} cardKind={cardKind} onEntryChange={applyEntryChange} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

/** 순위 숫자와 그 아래의 변동 표시(NEW, 재진입, 오름·내림·그대로). */
function RankLabel({ rankedEntry }: { rankedEntry: RankedEntryView }) {
  return (
    <div className="flex w-8 shrink-0 flex-col items-center gap-1 pt-3 md:w-12">
      <span className="font-mono text-entry-title tabular-nums text-foreground">
        {rankedEntry.rank}
        <span className="sr-only">위</span>
      </span>
      <RankMovementMark rankedEntry={rankedEntry} />
    </div>
  );
}

function RankMovementMark({ rankedEntry }: { rankedEntry: RankedEntryView }) {
  if (rankedEntry.movement === 'new')
    return <Badge className="rounded-full bg-brand px-1.5 font-mono text-numeric-badge text-brand-foreground">NEW</Badge>;
  if (rankedEntry.movement === 'reentered')
    return (
      <Badge variant="outline" className="rounded-full px-1.5 text-numeric-badge text-muted-foreground">
        재진입
      </Badge>
    );
  if (rankedEntry.movement !== 'stayed' || rankedEntry.previousRank === null) return null;

  const rankChange = rankedEntry.previousRank - rankedEntry.rank;
  if (rankChange === 0)
    return (
      <span className="text-subtle-foreground">
        <Minus className="size-3.5" strokeWidth={1.5} aria-label="변동 없음" />
      </span>
    );
  const Icon = rankChange > 0 ? ChevronUp : ChevronDown;
  return (
    <span className="flex items-center font-mono text-numeric-badge tabular-nums text-muted-foreground">
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
      {Math.abs(rankChange)}
      <span className="sr-only">{rankChange > 0 ? '계단 오름' : '계단 내림'}</span>
    </span>
  );
}
