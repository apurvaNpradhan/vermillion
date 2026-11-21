/**
 * The sign-up and sign-in flows as data: which screens a flow has, in order. The progress dashes
 * and the "first screen is a close button" rule both read from here, so adding a screen to a flow
 * is one row, not a change in every screen.
 */
const ONBOARDING_ORDER = [
  "name",
  "units",
  "body",
  "experience",
  "days",
  "place",
  "reminders",
] as const;
export type OnboardingStepId = (typeof ONBOARDING_ORDER)[number];

export type FlowKind = "get-started" | "sign-in";
export type FlowStepId = "email" | "code" | OnboardingStepId;

export const FLOW_STEPS = {
  "get-started": ["email", "code", ...ONBOARDING_ORDER],
  "sign-in": ["email", "code"],
} as const satisfies Record<FlowKind, readonly FlowStepId[]>;

/** Where a screen sits in its flow: `index` is 0-based. */
export type FlowPosition = { index: number; total: number };

export function stepPosition(kind: FlowKind, step: FlowStepId): FlowPosition {
  const steps: readonly FlowStepId[] = FLOW_STEPS[kind];
  const index = Math.max(steps.indexOf(step), 0);
  return { index, total: steps.length };
}

/** A route param is untyped text; anything but "sign-in" is the get-started flow. */
export function parseFlowKind(raw: string | undefined): FlowKind {
  return raw === "sign-in" ? "sign-in" : "get-started";
}

/** A stored step name back to a step; anything unrecognised is `null`. */
export function parseOnboardingStep(raw: string | null | undefined): OnboardingStepId | null {
  return ONBOARDING_ORDER.find((step) => step === raw) ?? null;
}

/**
 * Where onboarding opens. The emailed code creates the session, so the root route guard hands a
 * new account to onboarding; the name is the first question. An account that already has its
 * name (the app was closed mid-way, or the name came from a provider) resumes at the step it had
 * reached (`resumeAt`, kept on this device), else at the units.
 */
export function firstOnboardingStep({
  hasName,
  resumeAt = null,
}: {
  hasName: boolean;
  resumeAt?: OnboardingStepId | null;
}): OnboardingStepId {
  if (!hasName) return "name";
  return resumeAt === null || resumeAt === "name" ? "units" : resumeAt;
}

/** The step after `step`, or `null` when it was the last one and onboarding is finished. */
export function nextOnboardingStep(step: OnboardingStepId): OnboardingStepId | null {
  return ONBOARDING_ORDER[ONBOARDING_ORDER.indexOf(step) + 1] ?? null;
}
