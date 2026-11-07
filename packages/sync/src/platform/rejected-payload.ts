import type { WireObject } from "./row-conversion";
import { REJECTED_PAYLOAD_MAX_BYTES } from "./tables";

export type BoundedPayload = { payload: string; truncated: boolean };

const encoder = new TextEncoder();

/**
 * JSON of a rejected op's data, capped at `maxBytes` of UTF-8. A truncated payload is no longer
 * valid JSON; `truncated` tells the recovery UI to show it as text only.
 */
export function boundPayload(
  data: WireObject | null | undefined,
  maxBytes = REJECTED_PAYLOAD_MAX_BYTES,
): BoundedPayload {
  const json = JSON.stringify(data ?? null);
  if (encoder.encode(json).length <= maxBytes) return { payload: json, truncated: false };
  let end = Math.min(json.length, maxBytes);
  while (end > 0 && encoder.encode(json.slice(0, end)).length > maxBytes) end -= 1;
  // Do not cut a surrogate pair in half.
  const last = json.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { payload: json.slice(0, end), truncated: true };
}
