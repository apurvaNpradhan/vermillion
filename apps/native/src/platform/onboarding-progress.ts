import { deviceStorage } from "./storage";

const keyFor = (userId: string) => `onboarding.step.${userId}`;

export function readOnboardingProgress(userId: string) {
  return deviceStorage.get(keyFor(userId));
}

export function writeOnboardingProgress(userId: string, step: string) {
  deviceStorage.set(keyFor(userId), step);
}

export function clearOnboardingProgress(userId: string) {
  // Invalidate synchronously so a quick relaunch cannot restore the previous step.
  deviceStorage.set(keyFor(userId), "");
}
