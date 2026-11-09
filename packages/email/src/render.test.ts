import { describe, expect, it } from "vitest";

import { sendEmail, type EmailInput, type RenderedEmail } from "./index";

const base = { to: "ada@example.com", name: "Ada", appName: "Acme", locale: "en" as const };
const inputs: EmailInput[] = [
  { ...base, template: "sign-in-code", otp: "482913" },
  { ...base, template: "change-email-code", otp: "730256" },
  { ...base, template: "delete-account", url: "https://app.example.com/delete?t=1" },
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
    expect(email.text.length).toBeGreaterThan(0);
    if ("url" in input) expect(email.text).toContain(input.url);
    if ("otp" in input) expect(email.text).toContain(input.otp);
  });

  it("puts the code and the app name in the subject, in the recipient's language", async () => {
    const en = await render({ ...base, template: "sign-in-code", otp: "482913" });
    expect(en.subject).toBe("482913 is your Acme code");
    expect(en.html).toContain('lang="en"');
    expect(en.text).toContain("This code expires in 5 minutes.");
  });

  it("says how long the code works", async () => {
    const email = await render({ ...base, template: "change-email-code", otp: "730256" });
    expect(email.text).toContain("This code expires in 5 minutes.");
    expect(email.subject).toBe("730256 confirms your new Acme email");
  });

  it("tells an existing account that the code signs it in", async () => {
    const known = await render({
      ...base,
      template: "sign-in-code",
      otp: "482913",
      existingAccount: true,
    });
    const unknown = await render({ ...base, template: "sign-in-code", otp: "482913" });
    expect(known.text).toContain("already has an account");
    expect(unknown.text).not.toContain("already has an account");
  });

  it("sends codes without any link", async () => {
    for (const template of ["sign-in-code", "change-email-code"] as const) {
      const email = await render({ ...base, template, otp: "482913" });
      expect(email.text).not.toMatch(/https?:\/\//);
      expect(email.html).not.toMatch(/<a\s/);
    }
  });

  it("carries the dark scheme and the brand fonts", async () => {
    const email = await render({ ...base, template: "sign-in-code", otp: "482913" });
    expect(email.html).toContain("prefers-color-scheme: dark");
    expect(email.html).toContain("Inter");
  });

  it("uses the primary button for the one link email", async () => {
    const email = await render(inputs[2]!);
    expect(email.html).toContain('href="https://app.example.com/delete?t=1"');
    expect(email.text).toContain("Delete my account");
  });

  it("does not tell users to ignore a sign-in they do not recognize", async () => {
    const email = await render({ ...base, template: "sign-in-notice" });
    expect(email.text).toContain("If this was not you");
    expect(email.text).not.toContain("you can ignore");
  });

  it("states where the request came from", async () => {
    const email = await render({
      ...base,
      template: "sign-in-code",
      otp: "482913",
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
