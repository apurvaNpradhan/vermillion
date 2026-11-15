import type { BodyMetric, ProgressPose } from "@workspace/shared";
import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";
export const bodyMeasurement = sqliteTable(
  "body_measurement",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    metric: text("metric").$type<BodyMetric>().notNull(),
    value: real("value").notNull(),
    measured_at: text("measured_at").notNull(),
    local_date: text("local_date").notNull(),
    source: text("source").$type<"manual" | "health">().notNull(),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (t) => [index("body_measurement_metric_date_idx").on(t.metric, t.local_date)],
);
/** A front, side or back photo on a date; `media_id` names the `media` row of its image. */
export const progressPhoto = sqliteTable(
  "progress_photo",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    media_id: text("media_id").notNull(),
    pose: text("pose").$type<ProgressPose>().notNull(),
    taken_at: text("taken_at").notNull(),
    local_date: text("local_date").notNull(),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    index("progress_photo_date_idx").on(t.local_date),
    index("progress_photo_pose_date_idx").on(t.pose, t.local_date),
  ],
);
