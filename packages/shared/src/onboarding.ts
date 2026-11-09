/** What onboarding needs to know about a person. Both the API user and the session user fit. */
export type OnboardingProfile = { name?: string | null | undefined };

export type OnboardingStepId = "name";

export type OnboardingStep = {
  id: OnboardingStepId;
  /** A required step blocks the app until it is complete. */
  required: boolean;
  isComplete: (profile: OnboardingProfile) => boolean;
};

/**
 * Account-first onboarding, derived from the profile: nothing is stored, so a step stays done
 * exactly as long as its data exists. Order is the order the steps are asked in. Add a step by
 * adding a row; clients render whichever `pendingOnboardingSteps` returns first.
 */
export const onboardingSteps: readonly OnboardingStep[] = [
  {
    id: "name",
    required: true,
    isComplete: (profile) => (profile.name ?? "").trim().length > 0,
  },
];

/** Required steps the person has not completed, in order. Empty means onboarding is done. */
export function pendingOnboardingSteps(profile: OnboardingProfile): OnboardingStep[] {
  return onboardingSteps.filter((step) => step.required && !step.isComplete(profile));
}
