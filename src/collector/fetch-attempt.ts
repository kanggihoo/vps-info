/**
 * Fetch Attempt 한 번: 시도를 기록하고, Handler를 부르고, 새 Entry를 저장하고, 결과를 Feed에 반영한다.
 */
import { eq, sql } from 'drizzle-orm';
import { database } from '../db/database-client.ts';
import { entry, feed, fetchAttempt } from '../db/schema.ts';
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
};

/**
 * Feed 하나를 한 번 수집한다. 실패해도 예외를 밖으로 던지지 않고 Fetch Attempt에 기록한다.
 *
 * @returns 새로 저장된 Entry 수. 실패하면 `undefined`.
 */
export async function runFetchAttempt(definition: FeedDefinition, state: FeedRunState): Promise<number | undefined> {
  const [attempt] = await database
    .insert(fetchAttempt)
    .values({ feedId: definition.id, status: 'running' })
    .returning({ id: fetchAttempt.id });

  try {
    // handler 이름과 params의 짝은 FeedDefinition 타입이 이미 검사했다.
    const handler = handlers[definition.handler] as Handler<typeof definition.params>;
    const drafts = await handler.fetchEntries(definition.params, { httpClient });
    if (drafts.length === 0 && !definition.allowEmpty) {
      throw new Error('Handler가 0건을 돌려줬습니다. 정보원 구조가 바뀌었을 수 있습니다');
    }

    return await database.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(entry)
        .values(toEntryRows(definition.id, drafts))
        .onConflictDoNothing()
        .returning({ id: entry.id });
      const now = new Date();
      await transaction
        .update(fetchAttempt)
        .set({ status: 'success', finishedAt: now, insertedEntryCount: inserted.length })
        .where(eq(fetchAttempt.id, attempt.id));
      await transaction
        .update(feed)
        .set({ consecutiveFailures: 0, nextRunAt: computeNextRunAt(0, state.intervalMinutes, now) })
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
        .set({ consecutiveFailures, nextRunAt: computeNextRunAt(consecutiveFailures, state.intervalMinutes, now) })
        .where(eq(feed.id, definition.id));
    });
    console.error(`[${definition.id}] 수집 실패 (연속 ${consecutiveFailures}회): ${String(error)}`);
    return undefined;
  }
}

/**
 * EntryDraft를 저장할 행으로 바꾼다.
 *
 * 게시 시각이 빠른 것부터 저장해서 `entry.id` 순서가 "First Seen → 게시 시각" 순서가 되게 한다.
 * 게시 시각이 없는 항목은 안정 정렬 덕분에 Handler가 돌려준 순서를 유지한다.
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
      extra: draft.extra,
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
