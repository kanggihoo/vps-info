CREATE TABLE "collector_heartbeat" (
	"id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feed" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feed" ADD COLUMN "manual_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed" ADD COLUMN "schedule_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
COMMENT ON TABLE "collector_heartbeat" IS '수집기 하나의 마지막 응답과 정상 종료 기록';
--> statement-breakpoint
COMMENT ON COLUMN "collector_heartbeat"."id" IS '단일 수집기 식별자 main';
--> statement-breakpoint
COMMENT ON COLUMN "collector_heartbeat"."last_seen_at" IS '긴 수집과 독립적으로 30초마다 갱신하는 마지막 응답 시각';
--> statement-breakpoint
COMMENT ON COLUMN "collector_heartbeat"."stopped_at" IS '정상 종료 시각. 재시작하면 비운다';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."paused" IS '자동 수집과 자동 재시도 일시정지. 수동 요청은 허용';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."manual_requested_at" IS '대기 중인 수동 수집 요청 시각. Fetch Attempt 시작과 함께 소비';
--> statement-breakpoint
COMMENT ON COLUMN "feed"."schedule_revision" IS '운영 중 변경한 스케줄을 수집 완료가 덮어쓰지 않도록 비교하는 버전';
