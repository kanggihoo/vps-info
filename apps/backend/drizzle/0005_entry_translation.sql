CREATE TABLE "entry_translation" (
	"entry_id" bigint PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"translated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_translation" ADD CONSTRAINT "entry_translation_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;