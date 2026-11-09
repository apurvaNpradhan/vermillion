import { pendingOnboardingSteps, type OnboardingProfile } from "@workspace/shared";

import { safeReturnLocation } from "@/platform/navigation";

/**
 * Where a person goes once signed in: onboarding while a required step is pending (remembering
 * where they were headed), else the page they asked for.
 */
export function postSignInTarget(user: OnboardingProfile, redirect: string | undefined) {
  const returnTo = safeReturnLocation(redirect);
  if (pendingOnboardingSteps(user).length > 0) {
    return { href: `/onboarding?redirect=${encodeURIComponent(returnTo)}` };
  }
  return { href: returnTo };
}
