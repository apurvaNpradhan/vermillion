import { useSyncExternalStore } from "react";

import { parseOnboardingStep, type OnboardingStepId } from "@/auth";
import {
  clearOnboardingProgress,
  readOnboardingProgress,
  writeOnboardingProgress,
} from "@/platform/onboarding-progress";
import { deviceStorage } from "@/platform/storage";

import { createSetupStatusStore } from "./setup-status-store";

// Completion is per account on this device, including accounts with a provider-supplied name.
const setupStatus = createSetupStatusStore(deviceStorage);

export function finishSetup(userId: string) {
  clearOnboardingProgress(userId);
  setupStatus.set(userId, "done");
}

export function savedSetupStep(userId: string): OnboardingStepId | null {
  return userId === "" ? null : parseOnboardingStep(readOnboardingProgress(userId));
}

export function saveSetupStep(userId: string, step: OnboardingStepId) {
  if (setupStatus.needsSetup(userId)) writeOnboardingProgress(userId, step);
}

export function useNeedsSetup(userId: string): boolean {
  return useSyncExternalStore(setupStatus.subscribe, () => setupStatus.needsSetup(userId));
}
