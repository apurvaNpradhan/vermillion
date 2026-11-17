CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "access_invite" (
	"id" uuid PRIMARY KEY,
	"email" text NOT NULL,
	"state" text NOT NULL,
	"token_hash" text,
	"requested_at" timestamp with time zone,
	"invited_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"redeemed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_invite_state_known" CHECK ("state" IN ('requested', 'invited', 'redeemed', 'revoked')),
	CONSTRAINT "access_invite_email_lower" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"detail" jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "two_factor_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_login_method" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_seen_app_version" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_seen_app_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_userId_idx" ON "two_factor" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_invite_email_uidx" ON "access_invite" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "access_invite_token_uidx" ON "access_invite" ("token_hash");--> statement-breakpoint
CREATE INDEX "access_invite_state_idx" ON "access_invite" ("state","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_created_idx" ON "admin_audit" ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_target_idx" ON "admin_audit" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_audit_action_idx" ON "admin_audit" ("action");--> statement-breakpoint
-- Pre-check (hand-written): the live catalog must not already hold two titles that differ only in
-- case, or the unique index below cannot be built. Fails loudly and names them instead.
DO $$
DECLARE clashes text;
BEGIN
  SELECT string_agg(lower(title), ', ') INTO clashes FROM (
    SELECT lower(title) AS title FROM "exercise"
     WHERE "user_id" IS NULL AND "retired_at" IS NULL
     GROUP BY lower(title) HAVING count(*) > 1
  ) AS duplicate;
  IF clashes IS NOT NULL THEN
    RAISE EXCEPTION 'live catalog titles differ only in case: %; retire or rename one of each', clashes;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_catalog_live_title_ci_uidx" ON "exercise" (lower("title")) WHERE "user_id" IS NULL AND "retired_at" IS NULL;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "access_invite" ADD CONSTRAINT "access_invite_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;