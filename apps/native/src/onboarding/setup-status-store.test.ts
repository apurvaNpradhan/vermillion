import { describe, expect, it } from "vitest";

import { pendingOnboardingSteps } from "@workspace/shared";

import { firstOnboardingStep, nextOnboardingStep } from "../auth/flow";
import { routeGuards, toSessionState } from "../auth/session-state";
import { createSetupStatusStore } from "./setup-status-store";

const userId = "new-account";

function guardsAfterSessionRefresh(name: string, setupPending: boolean) {
  return routeGuards(
    toSessionState({
      session: {
        isPending: false,
        hasSession: true,
        needsOnboarding: pendingOnboardingSteps({ name }).length > 0 || setupPending,
      },
      owner: { isPending: false, hasOwner: true },
      signedOut: false,
    }),
  );
}

describe("setup status", () => {
  it("keeps home closed between saving the name and finishing setup even without storage", () => {
    const setup = createSetupStatusStore({ get: () => null, set: () => undefined });
    const changes: boolean[] = [];
    setup.subscribe(() => changes.push(setup.needsSetup(userId)));

    const onboardingOnly = { app: false, auth: false, onboarding: true };
    expect(guardsAfterSessionRefresh("", setup.needsSetup(userId))).toEqual(onboardingOnly);
    expect(guardsAfterSessionRefresh("Ada", setup.needsSetup(userId))).toEqual(onboardingOnly);

    const steps: string[] = [];
    let step: ReturnType<typeof nextOnboardingStep> = firstOnboardingStep({ hasName: true });
    while (step !== null) {
      steps.push(step);
      expect(guardsAfterSessionRefresh("Ada", setup.needsSetup(userId))).toEqual(onboardingOnly);
      step = nextOnboardingStep(step);
    }
    expect(steps).toEqual(["units", "body", "experience", "days", "place", "reminders"]);

    setup.set(userId, "done");
    expect(guardsAfterSessionRefresh("Ada", setup.needsSetup(userId))).toEqual({
      app: true,
      auth: false,
      onboarding: false,
    });
    expect(changes).toEqual([false]);
  });

  it("restores completion only for the same account when storage is available", () => {
    const saved = new Map<string, string>();
    const storage = { get: (key: string) => saved.get(key) ?? null, set: saved.set.bind(saved) };
    createSetupStatusStore(storage).set(userId, "pending");

    const restarted = createSetupStatusStore(storage);
    expect(restarted.needsSetup(userId)).toBe(true);
    expect(restarted.needsSetup("existing-account")).toBe(true);

    restarted.set(userId, "done");
    expect(createSetupStatusStore(storage).needsSetup(userId)).toBe(false);
    expect(createSetupStatusStore(storage).needsSetup("existing-account")).toBe(true);
  });

  it("does not let a stale persisted mark block home if completion cannot be written", () => {
    const setup = createSetupStatusStore({ get: () => "pending", set: () => undefined });
    setup.set(userId, "done");
    expect(setup.needsSetup(userId)).toBe(false);
  });
});
