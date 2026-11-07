/** Typed error codes every API procedure can fail with. */
export const ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "BAD_GATEWAY",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status of each code; the server and the Better Auth mapping share it. */
export const HTTP_STATUS_BY_CODE = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  BAD_GATEWAY: 502,
} as const satisfies Record<ErrorCode, number>;
