import type { SetKind } from "@workspace/shared";

/** Set categories use data colors, with letters as a second cue. */
export const SET_TONES = {
  working: { text: "text-foreground", background: "bg-default" },
  warmup: { text: "text-set-warmup", background: "bg-set-warmup/10" },
  drop: { text: "text-set-drop", background: "bg-set-drop/10" },
  failure: { text: "text-set-failure", background: "bg-set-failure/10" },
  top: { text: "text-set-top", background: "bg-set-top/10" },
  backoff: { text: "text-set-backoff", background: "bg-set-backoff/10" },
  myo: { text: "text-set-myo", background: "bg-set-myo/10" },
} as const satisfies Record<SetKind, { text: string; background: string }>;
