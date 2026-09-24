/**
 * DB 테이블 정의. 서버와 수집기가 함께 쓴다.
 * 이 파일을 바꾼 뒤에는 `npm run db:generate`로 마이그레이션 SQL을 만든다.
 */
import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * Feed의 실행 상태와 운영 값.
 *
 * Feed의 정의(Handler, 파라미터, 제목)는 코드(`src/feed-definitions.ts`)에 있고, 여기에는 두지 않는다.
 * 수집 주기처럼 운영하면서 바꾸는 값만 DB가 소유한다(ADR-0007).
 */
export const feed = pgTable('feed', {
  /** 코드의 Feed 정의와 같은 식별자. 한 번 정하면 바꾸지 않는다. */
  id: text('id').primaryKey(),
  /** 수집 주기(분). 처음 한 번만 코드 값으로 채우고, 이후에는 DB에서 바꾼다. */
  intervalMinutes: integer('interval_minutes').notNull(),
  /** 다음 수집 예정 시각. 수집기는 이 값이 지난 Feed를 실행한다. */
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull().defaultNow(),
  /** 연속으로 실패한 Fetch Attempt 수. 성공하면 0이 된다(ADR-0008). */
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  /** Read Cursor. 마지막으로 지나간 Entry의 id이며, 이보다 큰 id가 안 읽음이다. */
  readCursorEntryId: bigint('read_cursor_entry_id', { mode: 'number' }),
});

/**
 * Feed에서 발견한 항목 하나.
 *
 * `id`는 저장 순서대로 커지고, 화면의 정렬 순서이자 Read Cursor의 기준이다.
 * 수집기가 하나뿐이고 Fetch Attempt 안에서 게시 시각순으로 저장하므로, id 순서가
 * "First Seen → 게시 시각" 순서와 같다.
 */
export const entry = pgTable(
  'entry',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    feedId: text('feed_id').notNull().references(() => feed.id),
    /** 같은 Feed 안에서 같은 항목인지 판정하는 값(ADR-0005). */
    dedupKey: text('dedup_key').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    /** 정보원이 준 게시 시각. 표시용이다. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    author: text('author'),
    summary: text('summary'),
    /** Feed마다 다른 필드 중 화면에 쓰는 것(HN 점수 등). */
    extra: jsonb('extra').$type<Record<string, unknown>>(),
    /** 정보원 원본. 내부 전용이며 API로 내보내지 않는다(ADR-0006). */
    raw: jsonb('raw').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** 원문 링크를 처음 연 시각. */
    openedAt: timestamp('opened_at', { withTimezone: true }),
    /** Bookmark한 시각. 비어 있으면 Bookmark가 아니다. */
    bookmarkedAt: timestamp('bookmarked_at', { withTimezone: true }),
  },
  (table) => [
    unique('entry_feed_id_dedup_key_unique').on(table.feedId, table.dedupKey),
    index('entry_feed_id_id_index').on(table.feedId, table.id),
  ],
);

/** Fetch Attempt의 상태. */
export type FetchAttemptStatus = 'running' | 'success' | 'failed';

/** 한 Feed를 한 번 수집하려 한 시도. 재시도도 각각 한 행이다. */
export const fetchAttempt = pgTable(
  'fetch_attempt',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    feedId: text('feed_id').notNull().references(() => feed.id),
    status: text('status').$type<FetchAttemptStatus>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** 이 시도로 새로 저장된 Entry 수. */
    insertedEntryCount: integer('inserted_entry_count'),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('fetch_attempt_feed_id_started_at_index').on(table.feedId, table.startedAt),
    check('fetch_attempt_status_check', sql`${table.status} in ('running', 'success', 'failed')`),
  ],
);
