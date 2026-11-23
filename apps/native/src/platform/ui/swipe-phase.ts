/**
 * Where a swipe row is in its life, so the action layer exists only while it is needed:
 * `idle` (nothing mounted), `dragging` (a swipe began), `open` (settled open), `closing` (the
 * close animation is running).
 */
export type SwipePhase = "idle" | "dragging" | "open" | "closing";
type SwipeEvent =
  /** A swipe started on the row. */
  | "drag"
  /** A release settled open. */
  | "open"
  /** A close began and is animating. */
  | "close"
  /** A close animation finished. */
  | "rest"
  /** A close with no animation. */
  | "reset";

export function swipePhase(phase: SwipePhase, event: SwipeEvent): SwipePhase {
  "worklet";
  switch (event) {
    case "drag":
      // Dragging an open row keeps it open, so its tap-to-close cover stays until it settles.
      return phase === "open" ? "open" : "dragging";
    case "open":
      return "open";
    case "close":
      return "closing";
    case "rest":
      // A finish that arrives after a new drag or open must not unmount a live layer.
      return phase === "closing" ? "idle" : phase;
    case "reset":
      return "idle";
  }
}

export function swipePresentation(
  phase: SwipePhase,
  touching: boolean,
): "hidden" | "actions" | "open" {
  "worklet";
  if (phase === "open") return "open";
  return phase === "idle" && !touching ? "hidden" : "actions";
}
