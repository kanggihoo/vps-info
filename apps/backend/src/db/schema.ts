/**
 * DB 테이블 정의. 서버와 수집기가 함께 쓴다.
 * 이 파일을 바꾼 뒤에는 `npm run db:generate`로 마이그레이션 SQL을 만든다.
 */
import { sql } from 'drizzle-orm';
import type { FeedNavigationItem } from '@trendboda/api-types';
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

/** 개인용 공통 Feed Navigation Order. Group 정의는 코드에 있고 배치만 저장한다(ADR-0016). */
export const feedNavigationOrder = pgTable('feed_navigation_order', {
  id: integer('id').primaryKey().default(1),
  streamOrder: jsonb('stream_order').$type<FeedNavigationItem[]>().notNull(),
  rankedOrder: jsonb('ranked_order').$type<FeedNavigationItem[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('feed_navigation_order_singleton', sql`${table.id} = 1`),
  check('feed_navigation_order_arrays', sql`jsonb_typeof(${table.streamOrder}) = 'array' and jsonb_typeof(${table.rankedOrder}) = 'array'`),
]);

/**
 * Feed의 실행 상태와 운영 값.
 *
 * Feed의 정의(Handler, 파라미터, 제목)는 코드(`src/feed-definitions.ts`)에 있고, 여기에는 두지 않는다.
 * 수집 주기처럼 운영하면서 바꾸는 값만 DB가 소유한다(ADR-0004, ADR-0009).
 */
export const feed = pgTable('feed', {
  /** 코드의 Feed 정의와 같은 식별자. 한 번 정하면 바꾸지 않는다. */
  id: text('id').primaryKey(),
  /** 수집 주기(분). 처음 한 번만 코드 값으로 채우고, 이후에는 DB에서 바꾼다. */
  intervalMinutes: integer('interval_minutes').notNull(),
  /** 다음 수집 예정 시각. 수집기는 이 값이 지난 Feed를 실행한다. */
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull().defaultNow(),
  /** 연속으로 실패한 Fetch Attempt 수. 성공하면 0이 된다(ADR-0005). */
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  /** Read Cursor. 마지막으로 지나간 Entry의 id이며, 이보다 큰 id가 안 읽음이다. Stream Feed만 쓴다. */
  readCursorEntryId: bigint('read_cursor_entry_id', { mode: 'number' }),
  /** Ranked Feed가 한 번에 가져올 순위 수. Stream Feed는 비어 있다. 처음 한 번만 코드 값으로 채운다(ADR-0009). */
  rankLimit: integer('rank_limit'),
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
    /** 같은 Feed 안에서 같은 항목인지 판정하는 값(ADR-0002). */
    dedupKey: text('dedup_key').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    /** 정보원이 준 게시 시각. 표시용이다. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    author: text('author'),
    summary: text('summary'),
    /** Feed마다 다른 필드 중 화면에 쓰는 것(HN 점수 등). */
    extra: jsonb('extra').$type<Record<string, unknown>>(),
    /** 정보원 원본. 내부 전용이며 API로 내보내지 않는다(ADR-0003). */
    raw: jsonb('raw').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Opened At. 앱에서 Entry를 펼치거나 원문 링크를 처음 연 시각(CONTEXT.md). */
    openedAt: timestamp('opened_at', { withTimezone: true }),
    /** Bookmark한 시각. 비어 있으면 Bookmark가 아니다. */
    bookmarkedAt: timestamp('bookmarked_at', { withTimezone: true }),
  },
  (table) => [
    unique('entry_feed_id_dedup_key_unique').on(table.feedId, table.dedupKey),
    index('entry_feed_id_id_index').on(table.feedId, table.id),
  ],
);

/**
 * Entry 제목·요약의 한국어 번역(ADR-0011). Entry와 1:1이고, 번역한 Entry에만 행이 있다.
 * DeepL로 만든 파생 데이터라 정보원에서 가져온 `entry`와 나눠 둔다. 목표 언어가 한국어 하나라 언어 컬럼은 없다.
 */
export const entryTranslation = pgTable('entry_translation', {
  entryId: bigint('entry_id', { mode: 'number' })
    .primaryKey()
    .references(() => entry.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** 원문 요약이 없으면 비어 있다. */
  summary: text('summary'),
  translatedAt: timestamp('translated_at', { withTimezone: true }).notNull().defaultNow(),
});

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

/**
 * Rank Snapshot: Ranked Feed를 한 번 수집해 성공했을 때 본 순위표(ADR-0009).
 * 성공한 Fetch Attempt 하나에 Rank마다 한 행이다. 순위가 직전과 같아도 쌓는다.
 */
export const rankSnapshot = pgTable(
  'rank_snapshot',
  {
    fetchAttemptId: bigint('fetch_attempt_id', { mode: 'number' })
      .notNull()
      .references(() => fetchAttempt.id),
    /** 1부터 시작하는 순위. 정보원이 준 목록 순서다. */
    rank: integer('rank').notNull(),
    entryId: bigint('entry_id', { mode: 'number' })
      .notNull()
      .references(() => entry.id),
    /** 그 시점의 수치(점수, 댓글 수 등). Feed마다 필드가 다르다. */
    metrics: jsonb('metrics').$type<Record<string, unknown>>(),
  },
  (table) => [
    primaryKey({ columns: [table.fetchAttemptId, table.rank] }),
    unique('rank_snapshot_fetch_attempt_id_entry_id_unique').on(table.fetchAttemptId, table.entryId),
  ],
);
