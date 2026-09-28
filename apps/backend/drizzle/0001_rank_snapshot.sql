CREATE TABLE "rank_snapshot" (
	"fetch_attempt_id" bigint NOT NULL,
	"rank" integer NOT NULL,
	"entry_id" bigint NOT NULL,
	"metrics" jsonb,
	CONSTRAINT "rank_snapshot_fetch_attempt_id_rank_pk" PRIMARY KEY("fetch_attempt_id","rank"),
	CONSTRAINT "rank_snapshot_fetch_attempt_id_entry_id_unique" UNIQUE("fetch_attempt_id","entry_id")
);
--> statement-breakpoint
ALTER TABLE "feed" ADD COLUMN "rank_limit" integer;--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD CONSTRAINT "rank_snapshot_fetch_attempt_id_fetch_attempt_id_fk" FOREIGN KEY ("fetch_attempt_id") REFERENCES "public"."fetch_attempt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD CONSTRAINT "rank_snapshot_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE no action ON UPDATE no action;