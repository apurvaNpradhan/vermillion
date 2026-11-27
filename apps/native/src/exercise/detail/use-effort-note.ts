import { useCallback, useState } from "react";

import { deviceStorage } from "@/platform/storage";

/** Set once the lifter has read why estimated 1RM now counts reps in reserve. */
const KEY = "device.note.one_rm_effort";

/**
 * The one-time note under Records that explains why an estimated 1RM moved: it counts the reps
 * left in reserve when effort is logged. Seen once per device, then never again.
 */
export function useEffortNote(moved: boolean) {
  const [seen, setSeen] = useState(() => deviceStorage.get(KEY) !== null);
  const dismiss = useCallback(() => {
    deviceStorage.set(KEY, "1");
    setSeen(true);
  }, []);
  return { visible: moved && !seen, dismiss };
}
