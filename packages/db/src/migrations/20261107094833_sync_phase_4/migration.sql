CREATE TABLE "jwks" (
	"id" text PRIMARY KEY,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "sync_upload_receipts" (
	"user_id" text,
	"install_id" uuid,
	"tx_id" bigint,
	"digest" text NOT NULL,
	"outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_upload_receipts_pkey" PRIMARY KEY("user_id","install_id","tx_id")
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notes_user_id_live_idx" ON "notes" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sync_upload_receipts_created_at_idx" ON "sync_upload_receipts" ("created_at");--> statement-breakpoint
ALTER TABLE "sync_upload_receipts" ADD CONSTRAINT "sync_upload_receipts_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_title_length" CHECK (char_length("title") BETWEEN 1 AND 200);--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_body_length" CHECK (char_length("body") <= 10000);