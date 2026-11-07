import { createRequestLogger, initLogger, log } from "evlog";
import type { EnrichContext, RequestLogger } from "evlog";
import { useLogger } from "evlog/hono";

export { createRequestLogger, initLogger, log };
export type { RequestLogger };

/** The current request's wide event, when called inside a request. */
export function currentRequestLog() {
  try {
    return useLogger();
  } catch {
    return undefined;
  }
}

/** Whether a recorded error is an object whose name, code and status can be read. */
function isErrorObject(error: EnrichContext["event"]["error"]): error is object {
  return typeof error === "object" && error !== null;
}

/**
 * Hono middleware options. Events keep only an error's name, code and status:
 * messages and stacks can quote driver queries or provider responses.
 */
export const requestLoggingOptions = {
  exclude: ["/api/health"],
  enrich: ({ event }: EnrichContext) => {
    const error = event.error;
    if (isErrorObject(error)) {
      event.error = {
        name: "name" in error ? error.name : undefined,
        code: "code" in error ? error.code : undefined,
        status: "status" in error ? error.status : undefined,
      };
    }
  },
};

/**
 * Records a handled failure. Inside a request it joins the request's wide event
 * and raises its level; elsewhere it is a standalone error event. Fields are
 * IDs, names and codes only, never addresses, tokens or error messages.
 */
type LogFields = Record<string, string | number | boolean | undefined>;

export function logFailure(action: string, fields: LogFields = {}) {
  const request = currentRequestLog();
  if (request) {
    request.setLevel("error");
    request.set({ failure: { action, ...fields } });
  } else {
    log.error({ action, ...fields });
  }
}

/**
 * Runs one background job as a single wide event. The job sets what it knows
 * on `event`; failures are recorded and rethrown.
 */
export async function runLoggedJob<T>(
  name: string,
  job: (event: RequestLogger) => Promise<T>,
): Promise<T> {
  const event = createRequestLogger({ method: "JOB", path: `/jobs/${name}` });
  event.set({ job: name });
  try {
    return await job(event);
  } catch (error) {
    event.error(error instanceof Error ? error : String(error));
    throw error;
  } finally {
    event.emit();
  }
}
