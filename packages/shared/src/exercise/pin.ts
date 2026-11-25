import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

const EXERCISE_PIN_NAMESPACE = "f945177e-8238-436e-86af-8dcc2d382b74";

export const exercisePinUuid = z.uuid().transform((value) => value.toLowerCase());

/** Both devices derive the same pin id. The account's stored text id is used for ownership. */
export function exercisePinId(userId: string, exerciseId: string): string {
  const account = exercisePinUuid.safeParse(userId);
  return uuidv5(
    JSON.stringify([account.success ? account.data : userId, exerciseId.toLowerCase()]),
    EXERCISE_PIN_NAMESPACE,
  );
}
