import type { BodyGroup, BodyView } from "./groups";

/**
 * The art layers (file stems in `assets/interim`) that draw each group, per view. A group with no
 * layer in a view is simply not drawn there. A layer belongs to one group only, so a tap on a
 * layer names exactly one group.
 */
export const GROUP_LAYERS = {
  abdominals: { front: ["front_rectus_abdominis", "front_obliques"], back: ["back_obliques"] },
  abductors: { front: ["front_tensor_fasciae_latae"], back: ["back_gluteus_medius"] },
  adductors: { front: ["front_hip_adductors"], back: ["back_hip_adductors"] },
  biceps: {
    front: ["front_biceps", "front_brachialis"],
    back: ["back_biceps", "back_brachialis"],
  },
  calves: {
    front: ["front_gastrocnemius", "front_soleus", "front_tibias"],
    back: ["back_gastrocnemius", "back_soleus", "back_popliteus"],
  },
  chest: {
    front: ["front_chest", "front_chest_clavicular_head", "front_serratus_anterior"],
    back: [],
  },
  forearms: {
    front: ["front_brachioradialis", "front_wrist_extensors"],
    back: ["back_wrist_flexors"],
  },
  glutes: { front: [], back: ["back_gluteus_maximus"] },
  hamstrings: { front: [], back: ["back_hamstrings"] },
  lats: { front: [], back: ["back_latissimus_dorsi"] },
  lower_back: { front: [], back: ["back_erector_spinae"] },
  neck: { front: ["front_neck"], back: ["back_neck"] },
  quadriceps: { front: ["front_quadriceps", "front_sartorius"], back: ["back_quadriceps"] },
  shoulders: {
    front: ["front_deltoid_anterior", "front_deltoid_lateral"],
    back: ["back_deltoids"],
  },
  traps: { front: ["front_trapezius"], back: ["back_upper_trapezius"] },
  triceps: { front: ["front_triceps"], back: ["back_triceps"] },
  upper_back: {
    front: [],
    back: [
      "back_middle_trapezius",
      "back_lower_trapezius",
      "back_teres_major",
      "back_teres_minor",
      "back_infraspinatus",
    ],
  },
} as const satisfies Record<BodyGroup, Record<BodyView, readonly string[]>>;

/** The grey silhouette each view is drawn over. */
export const BASE_LAYERS = {
  front: "front_grey_body",
  back: "back_grey_body",
} as const satisfies Record<BodyView, string>;

/** The view that shows a group best: the one a small group icon and a lone group are drawn in. */
export const PREFERRED_VIEW = {
  abdominals: "front",
  abductors: "back",
  adductors: "front",
  biceps: "front",
  calves: "front",
  chest: "front",
  forearms: "front",
  glutes: "back",
  hamstrings: "back",
  lats: "back",
  lower_back: "back",
  neck: "front",
  quadriceps: "front",
  shoulders: "front",
  traps: "back",
  triceps: "back",
  upper_back: "back",
} as const satisfies Record<BodyGroup, BodyView>;

/** The file stem of every layer in use; the generated tables are typed to cover exactly these. */
export type LayerName =
  | (typeof BASE_LAYERS)[BodyView]
  | (typeof GROUP_LAYERS)[BodyGroup][BodyView][number];

/** Every layer in use, for the coverage checks and the generator. */
export function allLayerNames(): LayerName[] {
  return [
    ...Object.values(BASE_LAYERS),
    ...Object.values(GROUP_LAYERS).flatMap((views) => [...views.front, ...views.back]),
  ];
}
