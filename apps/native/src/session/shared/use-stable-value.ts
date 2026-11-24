import { useState } from "react";

import { deepEqual, type Plain } from "@/session/store/equal";

/** `value`, or the one held before it while they are equal, for a prop that is rebuilt each render. */
export function useStableValue<T extends Plain>(value: T): T {
  const [held, setHeld] = useState(value);
  if (deepEqual(held, value)) return held;
  setHeld(value);
  return value;
}
