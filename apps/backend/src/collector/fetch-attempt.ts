/**
 * Fetch Attempt 한 번: 시도를 기록하고, Handler를 부르고, 새 Entry를 저장하고, 결과를 Feed에 반영한다.
 * Ranked Feed면 이번에 본 순위표를 Rank Snapshot으로 함께 저장한다(ADR-0009).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { database } from '../db/database-client.ts';
import { entry, feed, fetchAttempt, rankSnapshot } from '../db/schema.ts';
import type { FeedDefinition } from '../feed-definitions.ts';
import { makeDedupKey } from './dedup-key.ts';
import type { EntryDraft, Handler } from './handlers/define-handler.ts';
import { handlers } from './handlers/index.ts';
import { httpClient } from './http-client.ts';
import { computeNextRunAt } from './next-run-time.ts';

/** Fetch Attempt를 시작할 때 필요한 Feed의 현재 상태. */
export type FeedRunState = {
  intervalMinutes: number;
  consecutiveFailures: number;
  /** DB `feed.rank_limit`. Stream Feed는 비어 있다. */
  rankLimit?: number | null;
};

/** Feed 정의와 가져올 순위 수를 받아 EntryDraft 목록을 가져오는 함수. 테스트에서는 가짜 함수로 바꿔 넣는다. */
export type EntryFetcher = (definition: FeedDefinition, rankLimit: number | undefined) => Promise<EntryDraft[]>;

/** 등록된 Handler에 공통 HTTP 클라이언트를 주입해 부른다. 실제 수집에서 쓰는 기본값이다. */
export const fetchEntriesWithRegisteredHandler: EntryFetcher = (definition, rankLimit) => {
  // handler 이름과 params의 짝은 FeedDefinition 타입이 이미 검사했다.
  const handler = handlers[definition.handler] as Handler<typeof definition.params>;
  return handler.fetchEntries(definition.params, { httpClient, rankLimit });
};

/** Ranked Feed가 이번에 가져올 순위 수. DB 값이 원본이고, 없으면 선언 값을 쓴다(ADR-0009). Stream Feed는 `undefined`. */
function resolveRankLimit(definition: FeedDefinition, state: FeedRunState): number | undefined {
  if (definition.kind !== 'ranked') return undefined;
  return state.rankLimit ?? definition.rankLimit;
}

/**
 * Feed 하나를 한 번 수집한다. 실패해도 예외를 밖으로 던지지 않고 Fetch Attempt에 기록한다.
 *
 * @param fetchEntries - EntryDraft를 가져오는 함수. 기본값은 등록된 Handler 호출이다.
 * @param onlyWhenDue - collector 실행에서는 true. 일시정지·스케줄 변경을 실행 직전에 다시 확인한다.
 * @returns 새로 저장된 Entry 수. 실패하면 `undefined`, 실행 조건이 바뀌었거나 이미 실행 중이면 `null`.
 */
export async function runFetchAttempt(
  definition: FeedDefinition,
  state: FeedRunState,
  fetchEntries: EntryFetcher = fetchEntriesWithRegisteredHandler,
  onlyWhenDue = false,
): Promise<number | undefined | null> {
  // API의 수동 요청과 같은 Feed 행을 잠근다. 요청 소비와 running 기록 사이에 중복 요청이 들어올 틈을 없앤다.
  const started = await database.transaction(async (transaction) => {
    const [current] = await transaction.select({
      intervalMinutes: feed.intervalMinutes, consecutiveFailures: feed.consecutiveFailures, rankLimit: feed.rankLimit,
      nextRunAt: feed.nextRunAt, paused: feed.paused, manualRequestedAt: feed.manualRequestedAt, scheduleRevision: feed.scheduleRevision,
    }).from(feed).where(eq(feed.id, definition.id)).for('update');
    if (!current) throw new Error(`등록되지 않은 Feed입니다: ${definition.id}`);
    if (onlyWhenDue && !current.manualRequestedAt && (current.paused || current.nextRunAt > new Date())) return null;
    const [running] = await transaction.select({ id: fetchAttempt.id }).from(fetchAttempt)
      .where(and(eq(fetchAttempt.feedId, definition.id), eq(fetchAttempt.status, 'running'))).limit(1);
    if (running) return null;
    const [attempt] = await transaction.insert(fetchAttempt).values({ feedId: definition.id, status: 'running' }).returning({ id: fetchAttempt.id });
    await transaction.update(feed).set({ manualRequestedAt: null }).where(eq(feed.id, definition.id));
    return { attempt, current };
  });
  if (!started) return null;
  const { attempt, current } = started;
  if (onlyWhenDue) state = current;
  const scheduleRevision = current.scheduleRevision;

  try {
    const rankLimit = resolveRankLimit(definition, state);
    const fetchedDrafts = await fetchEntries(definition, rankLimit);
    const limitedDrafts = rankLimit === undefined ? fetchedDrafts : fetchedDrafts.slice(0, rankLimit);
    if (limitedDrafts.length === 0 && !definition.allowEmpty) {
      throw new Error('Handler가 0건을 돌려줬습니다. 정보원 구조가 바뀌었을 수 있습니다');
    }
    // 0건 검사는 Handler가 돌려준 목록으로 한다. 게시일 하한으로 모두 걸러져 0건이 되는 것은 정상이다.
    const drafts = filterByPublishedSince(limitedDrafts, definition.publishedSince);

    return await database.transaction(async (transaction) => {
      // allowEmpty인 Feed는 0건도 성공이다. 빈 목록은 INSERT할 수 없으므로 건너뛴다.
      const inserted =
        drafts.length === 0
          ? []
          : await transaction
              .insert(entry)
              .values(toEntryRows(definition.id, drafts))
              .onConflictDoNothing()
              .returning({ id: entry.id });
      if (rankLimit !== undefined) await insertRankSnapshot(transaction, definition.id, attempt.id, drafts);
      const now = new Date();
      await transaction
        .update(fetchAttempt)
        .set({ status: 'success', finishedAt: now, insertedEntryCount: inserted.length })
        .where(eq(fetchAttempt.id, attempt.id));
      await transaction
        .update(feed)
        .set({ consecutiveFailures: 0, nextRunAt: sql`case when ${feed.scheduleRevision} = ${scheduleRevision} then ${computeNextRunAt(0, state.intervalMinutes, now)}::timestamptz else ${feed.nextRunAt} end` })
        .where(eq(feed.id, definition.id));
      return inserted.length;
    });
  } catch (error) {
    const consecutiveFailures = state.consecutiveFailures + 1;
    const now = new Date();
    await database.transaction(async (transaction) => {
      await transaction
        .update(fetchAttempt)
        .set({ status: 'failed', finishedAt: now, errorMessage: String(error) })
        .where(eq(fetchAttempt.id, attempt.id));
      await transaction
        .update(feed)
        .set({ consecutiveFailures, nextRunAt: sql`case when ${feed.scheduleRevision} = ${scheduleRevision} then ${computeNextRunAt(consecutiveFailures, state.intervalMinutes, now)}::timestamptz else ${feed.nextRunAt} end` })
        .where(eq(feed.id, definition.id));
    });
    console.error(`[${definition.id}] 수집 실패 (연속 ${consecutiveFailures}회): ${String(error)}`);
    return undefined;
  }
}

/**
 * 게시일 하한보다 먼저 게시된 항목을 버린다. 게시 시각이 없는 항목은 남긴다(CONTEXT.md First Seen).
 *
 * @param publishedSince - Feed 선언의 `YYYY-MM-DD`(UTC). 없으면 그대로 돌려준다.
 */
function filterByPublishedSince(drafts: EntryDraft[], publishedSince: string | undefined): EntryDraft[] {
  if (publishedSince === undefined) return drafts;
  const lowerBound = new Date(`${publishedSince}T00:00:00Z`);
  return drafts.filter((draft) => draft.publishedAt === undefined || draft.publishedAt >= lowerBound);
}

/** 트랜잭션 안에서 쓰는 DB 핸들. */
type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];

/**
 * 이번에 본 순위표를 Rank Snapshot으로 저장한다. Rank는 Handler가 돌려준 순서다(ADR-0009).
 * 같은 Entry가 목록에 두 번 나오면 앞의 순위만 남긴다.
 */
async function insertRankSnapshot(transaction: Transaction, feedId: string, fetchAttemptId: number, drafts: EntryDraft[]) {
  const dedupKeys = drafts.map((draft) => makeDedupKey(draft));
  const storedEntries = await transaction
    .select({ id: entry.id, dedupKey: entry.dedupKey })
    .from(entry)
    .where(and(eq(entry.feedId, feedId), inArray(entry.dedupKey, dedupKeys)));
  const entryIdsByDedupKey = new Map(storedEntries.map((storedEntry) => [storedEntry.dedupKey, storedEntry.id]));

  const rankedEntryIds = new Set<number>();
  const rows = drafts.flatMap((draft, index) => {
    const entryId = entryIdsByDedupKey.get(dedupKeys[index]);
    if (entryId === undefined || rankedEntryIds.has(entryId)) return [];
    rankedEntryIds.add(entryId);
    return [{ fetchAttemptId, entryId, metrics: draft.metrics }];
  });
  if (rows.length === 0) return;
  await transaction.insert(rankSnapshot).values(rows.map((row, index) => ({ ...row, rank: index + 1 })));
}

/**
 * EntryDraft를 저장할 행으로 바꾼다.
 *
 * 게시 시각이 빠른 것부터 저장해서 `entry.id` 순서가 "First Seen → 게시 시각" 순서가 되게 한다.
 * 게시 시각이 없는 항목은 안정 정렬 덕분에 Handler가 돌려준 순서를 유지한다.
 * `metrics`는 처음 봤을 때의 값으로 `extra`에 합친다(ADR-0009).
 */
function toEntryRows(feedId: string, drafts: EntryDraft[]) {
  return drafts
    .toSorted((first, second) => (first.publishedAt?.getTime() ?? 0) - (second.publishedAt?.getTime() ?? 0))
    .map((draft) => ({
      feedId,
      dedupKey: makeDedupKey(draft),
      url: draft.url,
      title: draft.title,
      publishedAt: draft.publishedAt,
      author: draft.author,
      summary: draft.summary,
      extra: draft.metrics ? { ...draft.extra, ...draft.metrics } : draft.extra,
      raw: draft.raw,
    }));
}

/** 수집기가 시작할 때 부른다. 이전 프로세스가 도중에 죽어 `running`으로 남은 시도를 실패로 정리한다. */
export async function markInterruptedAttemptsFailed(): Promise<void> {
  await database
    .update(fetchAttempt)
    .set({ status: 'failed', finishedAt: sql`now()`, errorMessage: '수집기가 시도 도중에 종료됐습니다' })
    .where(eq(fetchAttempt.status, 'running'));
}
