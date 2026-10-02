CREATE TABLE "feed_navigation_order" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"stream_order" jsonb NOT NULL,
	"ranked_order" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_navigation_order_singleton" CHECK ("feed_navigation_order"."id" = 1),
	CONSTRAINT "feed_navigation_order_arrays" CHECK (jsonb_typeof("feed_navigation_order"."stream_order") = 'array' and jsonb_typeof("feed_navigation_order"."ranked_order") = 'array')
);

--> statement-breakpoint
COMMENT ON TABLE "feed_navigation_order" IS '개인용 공통 Feed·Feed Group 화면 배치. 정의는 코드에 유지한다.';
--> statement-breakpoint
COMMENT ON COLUMN "feed_navigation_order"."id" IS '공통 설정 한 행의 식별자. 항상 1이다.';
--> statement-breakpoint
COMMENT ON COLUMN "feed_navigation_order"."stream_order" IS 'Stream 구역의 줄 순서. kind와 id를 가진 배열이다.';
--> statement-breakpoint
COMMENT ON COLUMN "feed_navigation_order"."ranked_order" IS 'Ranked 구역의 줄 순서. kind와 id를 가진 배열이다.';
--> statement-breakpoint
COMMENT ON COLUMN "feed_navigation_order"."updated_at" IS '순서를 마지막으로 저장한 시각.';
