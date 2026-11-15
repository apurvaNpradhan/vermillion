import type { ProgressPose } from "@workspace/shared";

/** The i18n key of each pose's name. */
export const poseLabels = {
  front: "body__pose_front",
  side: "body__pose_side",
  back: "body__pose_back",
} as const satisfies Record<ProgressPose, string>;
