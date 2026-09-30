/**
 * DB의 Entry 행을 API 응답(`EntryView`)으로 바꾸는 규칙.
 * 조회 컬럼을 여기 한 곳에 모아 `raw`가 응답에 섞이지 않게 한다(ADR-0003).
 * 번역은 `entry_translation`에 따로 있으므로, `entryViewColumns`로 조회할 때는 `translationJoin`으로 LEFT JOIN한다(ADR-0011).
 */
import { eq } from 'drizzle-orm';
import type { EntryView } from '@trendboda/api-types';
import { entry, entryTranslation } from '../db/schema.ts';

/** `entry` 테이블에서 조회하는 컬럼. `raw`는 일부러 뺐다. */
const entryColumns = {
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

/** Entry를 조회할 때 쓰는 컬럼 목록. 번역 컬럼이 있으므로 `.leftJoin(entryTranslation, translationJoin)`과 함께 쓴다. */
export const entryViewColumns = {
  ...entryColumns,
  translatedTitle: entryTranslation.title,
  translatedSummary: entryTranslation.summary,
};

/** `entryViewColumns`의 번역 컬럼을 채우는 LEFT JOIN 조건. */
export const translationJoin = eq(entryTranslation.entryId, entry.id);

/** `entryViewColumns`로 조회한 행 하나의 타입. 번역은 LEFT JOIN이라 없으면 `null`이다. */
type EntryViewRow = {
  [Key in keyof typeof entryColumns]: (typeof entryColumns)[Key]['_']['notNull'] extends true
    ? (typeof entryColumns)[Key]['_']['data']
    : (typeof entryColumns)[Key]['_']['data'] | null;
} & { translatedTitle: string | null; translatedSummary: string | null };

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
