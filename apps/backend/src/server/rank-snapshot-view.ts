/**
 * Ranked Feed의 최신 Rank Snapshot을 직전 Snapshot과 비교해 화면용 순위표로 만든다(ADR-0009).
 */
import { and, asc, desc, eq, exists, inArray } from 'drizzle-orm';
import type { DroppedEntryView, RankedEntryView, RankMovement, RankSnapshotView } from '@trendboda/api-types';
import { database } from '../db/database-client.ts';
import { entry, entryTranslation, fetchAttempt, rankSnapshot } from '../db/schema.ts';
import { entryViewColumns, toEntryView, translationJoin } from './entry-view.ts';

/** 비교에 쓰는 Snapshot 수: 최신과 직전. */
const COMPARED_SNAPSHOT_COUNT = 2;

/**
 * Feed의 최신 Rank Snapshot을 직전 Snapshot과 비교해 돌려준다.
 * Snapshot이 없는 Fetch Attempt(실패, Ranked Feed가 되기 전의 성공)는 건너뛴다.
 */
export async function loadRankSnapshotView(feedId: string): Promise<RankSnapshotView> {
  const snapshots = await database
    .select({ id: fetchAttempt.id, startedAt: fetchAttempt.startedAt })
    .from(fetchAttempt)
    .where(
      and(
        eq(fetchAttempt.feedId, feedId),
        exists(database.select({ rank: rankSnapshot.rank }).from(rankSnapshot).where(eq(rankSnapshot.fetchAttemptId, fetchAttempt.id))),
      ),
    )
    .orderBy(desc(fetchAttempt.id))
    .limit(COMPARED_SNAPSHOT_COUNT);
  const [latest, previous] = snapshots;
  if (!latest) return { takenAt: null, previousTakenAt: null, entries: [], droppedEntries: [] };

  const rows = await database
    .select({ ...entryViewColumns, fetchAttemptId: rankSnapshot.fetchAttemptId, rank: rankSnapshot.rank, metrics: rankSnapshot.metrics })
    .from(rankSnapshot)
    .innerJoin(entry, eq(entry.id, rankSnapshot.entryId))
    .leftJoin(entryTranslation, translationJoin)
    .where(inArray(rankSnapshot.fetchAttemptId, snapshots.map((snapshot) => snapshot.id)))
    .orderBy(asc(rankSnapshot.rank));
  const latestRows = rows.filter((row) => row.fetchAttemptId === latest.id);
  const previousRowsByEntryId = new Map(rows.filter((row) => row.fetchAttemptId === previous?.id).map((row) => [row.id, row]));
  const latestEntryIds = new Set(latestRows.map((row) => row.id));

  const entries = latestRows.map(({ fetchAttemptId: _, rank, metrics, ...entryRow }): RankedEntryView => {
    const previousRow = previousRowsByEntryId.get(entryRow.id);
    // Entry는 그 수집의 트랜잭션 안에서 저장되므로, 처음 발견한 Entry의 First Seen은 수집 시작 시각보다 늦다.
    const firstSeenInLatest = entryRow.firstSeenAt >= latest.startedAt;
    return {
      ...toEntryView(entryRow),
      rank,
      metrics,
      previousRank: previousRow?.rank ?? null,
      previousMetrics: previousRow?.metrics ?? null,
      movement: decideMovement(firstSeenInLatest, previous !== undefined, previousRow !== undefined),
    };
  });
  const droppedEntries = [...previousRowsByEntryId.values()]
    .filter((row) => !latestEntryIds.has(row.id))
    .map(({ fetchAttemptId: _, rank, metrics: __, ...entryRow }): DroppedEntryView => ({ ...toEntryView(entryRow), previousRank: rank }));

  return {
    takenAt: latest.startedAt.toISOString(),
    previousTakenAt: previous?.startedAt.toISOString() ?? null,
    entries,
    droppedEntries,
  };
}

/** 직전 Snapshot과 비교한 상태를 정한다. 첫 Snapshot이면 NEW만 표시하고 나머지는 `null`이다. */
function decideMovement(firstSeenInLatest: boolean, hasPrevious: boolean, inPrevious: boolean): RankMovement | null {
  if (firstSeenInLatest) return 'new';
  if (!hasPrevious) return null;
  return inPrevious ? 'stayed' : 'reentered';
}
