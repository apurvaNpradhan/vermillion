import type { CapPrompt } from "@workspace/shared";

/** How many Sessions in a row must lower the suggestion to the same weight before we ask. */
export const CAP_PROMPT_AFTER = 2;
const SAME = 0.0005;
/** The most remembered gym and exercise pairs; the oldest go first. */
const KEPT = 100;

/** The key the prompt remembers a gym and exercise under. */
export const capPromptKey = (gymId: string, exerciseId: string) => `${gymId}:${exerciseId}`;

/** The prompts to store and whether to ask now. */
export type LoggedLoadNote = { prompts: CapPrompt[]; ask: boolean };

/**
 * What the "Is this the max on this machine?" prompt remembers after a working set was logged.
 * `suggestedKg` is what the Ghost value offered and `loggedKg` what the user did instead. Lowering
 * it to the same weight in `CAP_PROMPT_AFTER` different Sessions asks once; logging at or above the
 * suggestion forgets the count. Two sets of one Session count once.
 */
export function noteLoggedLoad(
  prompts: readonly CapPrompt[],
  input: { key: string; sessionId: string; suggestedKg: number; loggedKg: number },
): LoggedLoadNote {
  const { key, sessionId, suggestedKg, loggedKg } = input;
  const current = prompts.find((prompt) => prompt.key === key);
  const others = prompts.filter((prompt) => prompt.key !== key);
  const lowered = loggedKg > 0 && loggedKg < suggestedKg - SAME;
  if (!lowered) {
    // Back on the suggestion: forget the count, but never forget a dismissal.
    if (!current || current.dismissed) return { prompts: [...prompts], ask: false };
    return { prompts: others, ask: false };
  }
  if (current?.dismissed) return { prompts: [...prompts], ask: false };
  const same = current !== undefined && Math.abs(current.kg - loggedKg) < SAME;
  if (same && current.sessionId === sessionId) return { prompts: [...prompts], ask: false };
  const count = same ? current.count + 1 : 1;
  const next: CapPrompt = { key, kg: loggedKg, count, sessionId, dismissed: false };
  return { prompts: [...others, next].slice(-KEPT), ask: count >= CAP_PROMPT_AFTER };
}

/** The prompt answered or dismissed: it never asks again for that gym and exercise. */
export function dismissCapPrompt(prompts: readonly CapPrompt[], key: string): CapPrompt[] {
  const others = prompts.filter((prompt) => prompt.key !== key);
  return [...others, { key, kg: 0, count: 0, sessionId: null, dismissed: true }].slice(-KEPT);
}
