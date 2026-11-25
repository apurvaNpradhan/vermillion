import type { Equipment } from "../../exercise/vocabulary";

/**
 * Equipment whose numbers belong to one place: the stack of a machine or cable, and a Smith
 * machine's bar, differ between gyms, so 60 kg on one is not 60 kg on another. A plate-loaded
 * machine is a `machine` here. Free weights (barbell, dumbbell, kettlebell, bodyweight) read the
 * same anywhere.
 */
const GYM_BOUND_EQUIPMENT: readonly Equipment[] = ["machine", "cable", "smith_machine"];

export const usesGymHistory = (equipment: Equipment): boolean =>
  GYM_BOUND_EQUIPMENT.includes(equipment);

/**
 * The Sessions a suggestion and its Ghost values read from (newest first, as given). For gym-bound
 * equipment the Sessions at `gymId` when there are any, else all of them; free weights and an
 * unknown gym always read all. Sessions with no gym (older ones) count as other gyms.
 */
export function historyForGym<T extends { gymId?: string | null }>(
  history: readonly T[],
  gymId: string | null,
  equipment: Equipment,
): readonly T[] {
  if (gymId === null || !usesGymHistory(equipment)) return history;
  const here = history.filter((session) => session.gymId === gymId);
  return here.length > 0 ? here : history;
}
