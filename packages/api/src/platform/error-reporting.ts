import { ORPCError } from "@orpc/server";
import * as Sentry from "@sentry/node";
import { HTTP_STATUS_BY_CODE, redactEmails, scrubUrl } from "@workspace/shared";

export type ErrorReportingOptions = {
  /** Sentry DSN of the server project; without it nothing is reported. */
  dsn?: string | undefined;
  environment: string;
  release: string;
};

/**
 * The event as it may leave the server: no request body, cookies or headers, no query strings,
 * only the internal user id, and no email addresses in messages (driver errors can quote rows).
 */
export function scrubServerEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const { user, request, message, exception, breadcrumbs, ...rest } = event;
  return {
    ...rest,
    ...(user?.id === undefined ? {} : { user: { id: user.id } }),
    ...(request?.url === undefined
      ? {}
      : { request: { url: scrubUrl(request.url), method: request.method } }),
    ...(message === undefined ? {} : { message: redactEmails(message) }),
    ...(exception?.values
      ? {
          exception: {
            ...exception,
            values: exception.values.map((value) => ({
              ...value,
              ...(value.value === undefined ? {} : { value: redactEmails(value.value) }),
            })),
          },
        }
      : {}),
    // Breadcrumbs are not collected (see `beforeBreadcrumb`); never send leftovers.
    ...(breadcrumbs ? { breadcrumbs: [] } : {}),
  };
}

/** The HTTP status a typed failure answers with; a code without a mapping is a plain 500. */
export function statusForCode(code: string) {
  const known = Object.entries(HTTP_STATUS_BY_CODE).find(([name]) => name === code);
  return known ? known[1] : 500;
}

/** Whether a typed failure answers 5xx, so it is a server fault and not an expected refusal. */
export function isServerFault(error: ORPCError<string, object>) {
  return statusForCode(error.code) >= 500;
}

/**
 * Whether an error is worth a report: anything that is not a typed oRPC failure, and typed ones
 * only when they answer 5xx. Expected 4xx and business errors (NOT_FOUND, CONFLICT…) are not bugs.
 */
export function shouldReport(error: Error): boolean {
  return !(error instanceof ORPCError) || isServerFault(error);
}

const userByError = new WeakMap<Error, string>();

/** Remembers whose request an error came from, so its report carries the internal user id. */
export function rememberErrorUser(error: Error, userId: string) {
  userByError.set(error, userId);
}

let started = false;

/** Starts Sentry. A no-op without a DSN. Tracing, request bodies and breadcrumbs are off. */
export function initErrorReporting(options: ErrorReportingOptions) {
  if (!options.dsn || started) return;
  started = true;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    // Nothing about the user or the request beyond what `scrubServerEvent` lets through.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: scrubServerEvent,
  });
}

/** Reports an unexpected failure, when Sentry is on and the error is worth it. */
export function reportServerError(error: Error) {
  if (!started || !shouldReport(error)) return;
  const userId = userByError.get(error);
  Sentry.captureException(error, userId ? { user: { id: userId } } : undefined);
}
