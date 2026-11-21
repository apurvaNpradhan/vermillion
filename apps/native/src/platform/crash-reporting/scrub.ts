import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";
import { redactEmails, scrubUrl } from "@workspace/shared";
import { z } from "zod";

const text = z.string();
/** Breadcrumb data fields that hold a URL or a route. */
const URL_FIELDS = new Set(["url", "from", "to"]);

/**
 * A breadcrumb without query strings or tokens in its URLs and without email addresses in its
 * message (console logs, navigation, network requests).
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const { message, data } = breadcrumb;
  return {
    ...breadcrumb,
    ...(message === undefined ? {} : { message: redactEmails(scrubUrlLike(message)) }),
    ...(data === undefined
      ? {}
      : {
          data: Object.fromEntries(
            Object.entries(data).map(([key, value]) => {
              const asText = text.safeParse(value);
              if (!asText.success) return [key, value];
              return [key, URL_FIELDS.has(key) ? scrubUrl(asText.data) : redactEmails(asText.data)];
            }),
          ),
        }),
  };
}

/** A message that is a bare URL ("GET https://…?token=…") loses its query strings. */
function scrubUrlLike(message: string): string {
  return message.replace(/https?:\/\/\S+/g, (url) => scrubUrl(url));
}

/**
 * The event as it may leave the device: only the anonymous id identifies the user (no IP address,
 * email or account id), the request is reduced to a scrubbed URL, breadcrumbs and error messages
 * lose emails, and the device's user-given name is dropped.
 */
export function scrubEvent(event: ErrorEvent, anonymousId: string): ErrorEvent {
  const device = event.contexts?.device;
  return {
    ...event,
    user: { id: anonymousId },
    ...(event.request?.url === undefined ? {} : { request: { url: scrubUrl(event.request.url) } }),
    ...(event.message === undefined ? {} : { message: redactEmails(event.message) }),
    ...(event.exception?.values
      ? {
          exception: {
            ...event.exception,
            values: event.exception.values.map((value) => ({
              ...value,
              ...(value.value === undefined ? {} : { value: redactEmails(value.value) }),
            })),
          },
        }
      : {}),
    ...(event.breadcrumbs ? { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) } : {}),
    ...(event.contexts && device
      ? { contexts: { ...event.contexts, device: { ...device, name: undefined } } }
      : {}),
  };
}
