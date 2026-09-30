-- OpenAI News와 OpenRouter에 게시일 하한(2026-01-01)을 선언하면서, 첫 수집 때 들어온 그 이전 Entry를 지운다(CONTEXT.md First Seen).
-- Bookmark했거나 연 Entry는 사용자가 남긴 흔적이라 남긴다. 두 Feed는 Stream Feed라 Rank Snapshot 참조가 없다.
DELETE FROM "entry"
WHERE "feed_id" IN ('openai-news', 'openrouter-models')
  AND "published_at" < '2026-01-01T00:00:00Z'
  AND "bookmarked_at" IS NULL
  AND "opened_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "rank_snapshot" WHERE "rank_snapshot"."entry_id" = "entry"."id");
