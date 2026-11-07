import { describe, expect, it } from "vitest";

import { sendEmail, type EmailInput, type RenderedEmail } from "./index";

const base = { to: "ada@example.com", name: "Ada", appName: "Acme", locale: "en" as const };
const inputs: EmailInput[] = [
  { ...base, template: "verification", url: "https://app.example.com/verify?t=1" },
  { ...base, template: "reset-password", url: "https://app.example.com/reset?t=1" },
  {
    ...base,
    template: "change-email",
    url: "https://app.example.com/change?t=1",
    newEmail: "new@example.com",
  },
  { ...base, template: "delete-account", url: "https://app.example.com/delete?t=1" },
  { ...base, template: "existing-account", url: "https://app.example.com/login" },
  { ...base, template: "security-notice" },
  { ...base, template: "sign-in-notice" },
];

async function render(input: EmailInput) {
  const sent: RenderedEmail[] = [];
  await sendEmail({ send: async (email) => void sent.push(email) }, input);
  return sent[0] as RenderedEmail;
}

describe("email templates", () => {
  it.each(inputs)("renders $template with a subject, html and text", async (input) => {
    const email = await render(input);
    expect(email.to).toBe("ada@example.com");
    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.html).toContain("<html");
    if ("url" in input) expect(email.text).toContain(input.url);
  });

  it("does not tell users to ignore a successful sign-in they do not recognize", async () => {
    const email = await render({ ...base, template: "sign-in-notice" });
    expect(email.text).toContain("reset your password");
    expect(email.text).not.toContain("you can ignore");
  });

  it("renders in the recipient's language", async () => {
    const email = await render({ ...inputs[0]!, locale: "de" });
    expect(email.subject).toBe("Bestätige deine E-Mail-Adresse für Acme");
    expect(email.html).toContain('lang="de"');
    expect(email.text).toContain("E-Mail bestätigen");
  });

  it("states where the request came from", async () => {
    const email = await render({
      ...inputs[1]!,
      request: {
        ip: "203.0.113.9",
        browser: "Firefox",
        os: "Linux",
        requestedAt: "2026-01-02T03:04:05.000Z",
      },
    });
    expect(email.text).toContain("203.0.113.9");
    expect(email.text).toContain("Firefox on Linux");
    expect(email.text).toContain("2026-01-02 03:04:05");
  });
});
