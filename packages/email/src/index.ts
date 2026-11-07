import { renderEmail } from "./render";
import type { EmailTransport } from "./transport";
import type { EmailInput } from "./types";

export { renderEmail } from "./render";
export {
  createEmailTransport,
  createLogTransport,
  LOG_EMAIL_MARKER,
  type EmailTransport,
  type EmailTransportConfig,
} from "./transport";
export type { EmailInput, RenderedEmail, RequestDetails } from "./types";

/** Renders an email in the recipient's language and hands it to the transport. */
export async function sendEmail(transport: EmailTransport, input: EmailInput): Promise<void> {
  await transport.send(await renderEmail(input));
}
