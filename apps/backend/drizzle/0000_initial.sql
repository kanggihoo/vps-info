CREATE TABLE "entry" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"feed_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone,
	"author" text,
	"summary" text,
	"extra" jsonb,
	"raw" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	"bookmarked_at" timestamp with time zone,
	CONSTRAINT "entry_feed_id_dedup_key_unique" UNIQUE("feed_id","dedup_key")
);
--> statement-breakpoint
CREATE TABLE "feed" (
	"id" text PRIMARY KEY NOT NULL,
	"interval_minutes" integer NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"read_cursor_entry_id" bigint
);
--> statement-breakpoint
CREATE TABLE "fetch_attempt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fetch_attempt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"feed_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"inserted_entry_count" integer,
	"error_message" text,
	CONSTRAINT "fetch_attempt_status_check" CHECK ("fetch_attempt"."status" in ('running', 'success', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_feed_id_feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_attempt" ADD CONSTRAINT "fetch_attempt_feed_id_feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_feed_id_id_index" ON "entry" USING btree ("feed_id","id");--> statement-breakpoint
CREATE INDEX "fetch_attempt_feed_id_started_at_index" ON "fetch_attempt" USING btree ("feed_id","started_at");