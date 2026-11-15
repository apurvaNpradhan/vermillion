import { mediaUserPrefix } from "@workspace/shared";

import type { Services } from "../../platform/services";

/**
 * Deletes every object under `users/<userId>/`, deleted media included. The rows go with the user
 * (cascade). Idempotent: an empty prefix is a success.
 */
export async function purgeUserMedia(
  { objectStore }: Pick<Services, "objectStore">,
  userId: string,
) {
  await objectStore.deletePrefix(mediaUserPrefix(userId));
}
