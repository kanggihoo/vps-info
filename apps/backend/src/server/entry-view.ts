/**
 * DB의 Entry 행을 API 응답(`EntryView`)으로 바꾸는 규칙.
 * 조회 컬럼을 여기 한 곳에 모아 `raw`가 응답에 섞이지 않게 한다(ADR-0003).
 */
import type { EntryView } from '@trendboda/api-types';
import { entry } from '../db/schema.ts';

/** Entry를 조회할 때 쓰는 컬럼 목록. `raw`는 일부러 뺐다. */
export const entryViewColumns = {
  id: entry.id,
  feedId: entry.feedId,
  url: entry.url,
  title: entry.title,
  publishedAt: entry.publishedAt,
  author: entry.author,
  summary: entry.summary,
  extra: entry.extra,
  firstSeenAt: entry.firstSeenAt,
  openedAt: entry.openedAt,
  bookmarkedAt: entry.bookmarkedAt,
};

/** `entryViewColumns`로 조회한 행 하나의 타입. */
type EntryViewRow = {
  [Key in keyof typeof entryViewColumns]: (typeof entryViewColumns)[Key]['_']['notNull'] extends true
    ? (typeof entryViewColumns)[Key]['_']['data']
    : (typeof entryViewColumns)[Key]['_']['data'] | null;
};

/** 조회한 행을 응답 형태로 바꾼다. 날짜는 ISO 8601 문자열이 된다. */
export function toEntryView(row: EntryViewRow): EntryView {
  return {
    ...row,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    openedAt: row.openedAt?.toISOString() ?? null,
    bookmarkedAt: row.bookmarkedAt?.toISOString() ?? null,
  };
}
