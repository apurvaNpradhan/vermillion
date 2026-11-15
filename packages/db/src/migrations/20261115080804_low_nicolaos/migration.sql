CREATE TABLE "body_measurement" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "body_measurement_metric" CHECK ("metric" IN ('weight','neck','shoulders','chest','waist','hips','left_bicep','right_bicep','left_forearm','right_forearm','left_thigh','right_thigh','left_calf','right_calf')),
	CONSTRAINT "body_measurement_value" CHECK (("metric" = 'weight' AND "value" BETWEEN 20 AND 400) OR ("metric" <> 'weight' AND "value" BETWEEN 5 AND 250)),
	CONSTRAINT "body_measurement_source" CHECK ("source" IN ('manual','health'))
);
--> statement-breakpoint
CREATE TABLE "deleted_body_measurement" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "body_measurement_metric_date_idx" ON "body_measurement" ("user_id","metric","local_date" DESC NULLS LAST) WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "body_measurement" ADD CONSTRAINT "body_measurement_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deleted_body_measurement" ADD CONSTRAINT "deleted_body_measurement_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE "body_measurement";
--> statement-breakpoint
GRANT SELECT ON "body_measurement" TO powersync_replication;
