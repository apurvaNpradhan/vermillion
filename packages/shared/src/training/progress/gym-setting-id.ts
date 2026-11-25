import { v5 as uuidv5 } from "uuid";

// Part of the sync protocol. Every device must use this same namespace and tuple order.
const GYM_SETTING_NAMESPACE = "6f0d1a52-8c43-4d0e-9a1b-3b7e5c1f2a94";

/**
 * The id of the one setting a user has for an exercise at a gym. Two devices that each create it
 * offline make the same row, so a later edit from either finds it on the server.
 */
export const gymExerciseSettingId = (input: {
  userId: string;
  gymId: string;
  exerciseId: string;
}) =>
  uuidv5(
    `${input.userId}:${input.gymId.toLowerCase()}:${input.exerciseId.toLowerCase()}`,
    GYM_SETTING_NAMESPACE,
  );
