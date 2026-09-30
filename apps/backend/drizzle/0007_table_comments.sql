-- 테이블·컬럼 설명을 DB에 남긴다. pg_dump에 COMMENT로 들어가 Liam ERD에 표시된다.
-- 설명의 원본은 schema.ts의 JSDoc이며, 스키마 구조는 바꾸지 않는다.
COMMENT ON TABLE "feed" IS 'Feed의 실행 상태와 운영 값. Feed 정의(Handler, 파라미터, 제목)는 코드에 있고 수집 주기처럼 운영하며 바꾸는 값만 여기에 둔다';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."id" IS '코드의 Feed 정의와 같은 식별자. 한 번 정하면 바꾸지 않는다';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."interval_minutes" IS '수집 주기(분). 처음 한 번만 코드 값으로 채우고 이후에는 DB에서 바꾼다';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."next_run_at" IS '다음 수집 예정 시각. 수집기는 이 값이 지난 Feed를 실행한다';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."consecutive_failures" IS '연속으로 실패한 Fetch Attempt 수. 성공하면 0이 된다';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."read_cursor_entry_id" IS 'Read Cursor. 마지막으로 지나간 Entry의 id이며 이보다 큰 id가 안 읽음이다. Stream Feed만 쓴다';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."rank_limit" IS 'Ranked Feed가 한 번에 가져올 순위 수. Stream Feed는 비어 있다';
--> statement-breakpoint
COMMENT ON TABLE "entry" IS 'Feed에서 발견한 항목 하나. id는 저장 순서대로 커지며 화면의 정렬 순서이자 Read Cursor의 기준이다';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."id" IS '저장 순서대로 커지는 식별자. 화면 정렬과 Read Cursor의 기준';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."feed_id" IS '이 항목을 수집한 Feed';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."dedup_key" IS '같은 Feed 안에서 같은 항목인지 판정하는 값';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."url" IS '원문 주소';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."title" IS '항목 제목';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."published_at" IS '정보원이 준 게시 시각. 표시용';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."author" IS '작성자';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."summary" IS '항목 요약';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."extra" IS 'Feed마다 다른 필드 중 화면에 쓰는 것(HN 점수 등)';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."raw" IS '정보원 원본. 내부 전용이며 API로 내보내지 않는다';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."first_seen_at" IS '수집기가 이 항목을 처음 본 시각';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."opened_at" IS 'Opened At. 앱에서 Entry를 펼치거나 원문 링크를 처음 연 시각';
--> statement-breakpoint
COMMENT ON COLUMN "entry"."bookmarked_at" IS 'Bookmark한 시각. 비어 있으면 Bookmark가 아니다';
--> statement-breakpoint
COMMENT ON TABLE "entry_translation" IS 'Entry 제목·요약의 한국어 번역. Entry와 1:1이고 번역한 Entry에만 행이 있다. DeepL로 만든 파생 데이터';
--> statement-breakpoint
COMMENT ON COLUMN "entry_translation"."entry_id" IS '번역 대상 Entry. Entry가 지워지면 함께 지워진다';
--> statement-breakpoint
COMMENT ON COLUMN "entry_translation"."title" IS '번역된 제목';
--> statement-breakpoint
COMMENT ON COLUMN "entry_translation"."summary" IS '번역된 요약. 원문 요약이 없으면 비어 있다';
--> statement-breakpoint
COMMENT ON COLUMN "entry_translation"."translated_at" IS '번역한 시각';
--> statement-breakpoint
COMMENT ON TABLE "fetch_attempt" IS '한 Feed를 한 번 수집하려 한 시도. 재시도도 각각 한 행이다';
--> statement-breakpoint
COMMENT ON COLUMN "fetch_attempt"."id" IS '시도 식별자';
--> statement-breakpoint
COMMENT ON COLUMN "fetch_attempt"."feed_id" IS '수집한 Feed';
--> statement-breakpoint
COMMENT ON COLUMN "fetch_attempt"."status" IS '시도 상태: running, success, failed 중 하나';
--> statement-breakpoint
COMMENT ON COLUMN "fetch_attempt"."started_at" IS '시도를 시작한 시각';
--> statement-breakpoint
COMMENT ON COLUMN "fetch_attempt"."finished_at" IS '시도를 끝낸 시각. 진행 중이면 비어 있다';
--> statement-breakpoint
COMMENT ON COLUMN "fetch_attempt"."inserted_entry_count" IS '이 시도로 새로 저장된 Entry 수';
--> statement-breakpoint
COMMENT ON COLUMN "fetch_attempt"."error_message" IS '실패했을 때의 오류 메시지';
--> statement-breakpoint
COMMENT ON TABLE "rank_snapshot" IS 'Rank Snapshot. Ranked Feed를 한 번 수집해 성공했을 때 본 순위표. 성공한 Fetch Attempt 하나에 Rank마다 한 행';
--> statement-breakpoint
COMMENT ON COLUMN "rank_snapshot"."fetch_attempt_id" IS '이 순위표를 만든 성공한 Fetch Attempt';
--> statement-breakpoint
COMMENT ON COLUMN "rank_snapshot"."rank" IS '1부터 시작하는 순위. 정보원이 준 목록 순서';
--> statement-breakpoint
COMMENT ON COLUMN "rank_snapshot"."entry_id" IS '이 순위에 있던 Entry';
--> statement-breakpoint
COMMENT ON COLUMN "rank_snapshot"."metrics" IS '그 시점의 수치(점수, 댓글 수 등). Feed마다 필드가 다르다';
