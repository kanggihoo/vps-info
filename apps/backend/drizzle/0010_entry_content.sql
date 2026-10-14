CREATE TABLE "entry_content" (
	"entry_id" bigint PRIMARY KEY NOT NULL,
	"markdown" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry" ADD COLUMN "reader_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entry_content" ADD CONSTRAINT "entry_content_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
COMMENT ON COLUMN "entry"."reader_fetched_at" IS 'Reader Fetched At. 읽기 버튼으로 본문을 처음 가져온 시각. 비어 있으면 읽지 않았거나 기록하기 전이다';
--> statement-breakpoint
COMMENT ON TABLE "entry_content" IS '읽기 버튼으로 가져온 본문 Markdown. Entry와 1:1이고 읽기 버튼을 누른 Entry에만 행이 있다';
--> statement-breakpoint
COMMENT ON COLUMN "entry_content"."entry_id" IS '본문을 가져온 Entry. Entry가 지워지면 함께 지워진다';
--> statement-breakpoint
COMMENT ON COLUMN "entry_content"."markdown" IS '가져온 본문 Markdown. 가져올 때마다 최신 본문으로 덮어쓴다';
--> statement-breakpoint
COMMENT ON COLUMN "entry_content"."fetched_at" IS '이 본문을 가져온 시각. 다시 가져오면 갱신한다';
