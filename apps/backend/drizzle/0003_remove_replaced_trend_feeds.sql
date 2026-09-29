-- Trendshift 기간·언어별 Feed로 바꾸면서 선언에서 뺀 두 Feed(GitHub Trending 일간, Trendshift 첫 화면)의 데이터를 지운다.
-- Bookmark가 하나라도 있는 Feed는 남긴다. 선언에서 빠졌으므로 수집과 화면 표시는 어느 쪽이든 멈춘다(ADR-0004).
-- 지우는 순서는 외래 키 순서다: Rank Snapshot → Entry → Fetch Attempt → Feed.
DELETE FROM "rank_snapshot" WHERE "fetch_attempt_id" IN (
  SELECT "id" FROM "fetch_attempt" WHERE "feed_id" IN (
    SELECT "id" FROM "feed" WHERE "id" IN ('github-trending-daily', 'trendshift')
      AND NOT EXISTS (SELECT 1 FROM "entry" WHERE "entry"."feed_id" = "feed"."id" AND "entry"."bookmarked_at" IS NOT NULL)
  )
);--> statement-breakpoint
DELETE FROM "entry" WHERE "feed_id" IN (
  SELECT "id" FROM "feed" WHERE "id" IN ('github-trending-daily', 'trendshift')
    AND NOT EXISTS (SELECT 1 FROM "entry" AS "bookmarked" WHERE "bookmarked"."feed_id" = "feed"."id" AND "bookmarked"."bookmarked_at" IS NOT NULL)
);--> statement-breakpoint
DELETE FROM "fetch_attempt" WHERE "feed_id" IN (
  SELECT "id" FROM "feed" WHERE "id" IN ('github-trending-daily', 'trendshift')
    AND NOT EXISTS (SELECT 1 FROM "entry" WHERE "entry"."feed_id" = "feed"."id")
);--> statement-breakpoint
DELETE FROM "feed" WHERE "id" IN ('github-trending-daily', 'trendshift')
  AND NOT EXISTS (SELECT 1 FROM "entry" WHERE "entry"."feed_id" = "feed"."id");
