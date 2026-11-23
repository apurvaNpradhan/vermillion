CREATE TABLE "share_link" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "share_link_code_length" CHECK (char_length("code") = 6),
	CONSTRAINT "share_link_kind_known" CHECK ("kind" IN ('program','workout')),
	CONSTRAINT "share_link_snapshot_size" CHECK (pg_column_size("snapshot") <= 1048576)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "share_link_code_uidx" ON "share_link" ("code");--> statement-breakpoint
CREATE INDEX "share_link_user_id_idx" ON "share_link" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;