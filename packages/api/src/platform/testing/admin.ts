import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";

import { cookieFrom, signIn, type TestApp } from "./harness";

/** The current code of an authenticator set up from this `otpauth://` URI. */
export async function totpCode(totpUri: string) {
  const secret = new URL(totpUri).searchParams.get("secret");
  if (!secret) throw new Error("No secret in the TOTP URI");
  return createOTP(base32.decode(secret)).totp();
}

/** Enrols the signed-in account's authenticator; returns its URI and the backup codes. */
export async function enrolTwoFactor(app: TestApp, headers: Headers) {
  const result = await app.services.auth.api.enableTwoFactor({ headers, body: {} });
  if (!("totpURI" in result) || !result.totpURI) throw new Error("No TOTP URI");
  return { totpUri: result.totpURI, backupCodes: result.backupCodes ?? [] };
}

/** Passes the authenticator step; returns headers of the (possibly rotated) session. */
export async function passTwoFactor(
  app: TestApp,
  headers: Headers,
  totpUri: string,
): Promise<Headers> {
  const response = await app.services.auth.api.verifyTOTP({
    headers,
    body: { code: await totpCode(totpUri) },
    asResponse: true,
  });
  if (!response.ok) throw new Error(`Two-factor step failed: ${response.status}`);
  const rotated = cookieFrom(response);
  return rotated.includes("session_token=") ? new Headers({ cookie: rotated }) : headers;
}

/**
 * An allow-listed admin signed in with the email code, enrolled and past the authenticator step.
 * The app's `adminEmails` must list the address.
 */
export async function createFullAdmin(
  app: TestApp,
  email: string,
): Promise<{ headers: Headers; totpUri: string; backupCodes: string[] }> {
  const signedIn = await signIn(app, email, { name: "Owner" });
  const { totpUri, backupCodes } = await enrolTwoFactor(app, signedIn);
  const headers = await passTwoFactor(app, signedIn, totpUri);
  return { headers, totpUri, backupCodes };
}

/**
 * The network boundary of the admin tests: GitHub Releases and the exercise-media
 * bucket's HEAD check. `objects` lists the keys the fake bucket holds.
 */
export function fakeNetwork(options: {
  objects?: Set<string>;
  release?: { tag: string; publishedAt: string } | null | "fail";
}) {
  const calls = { github: 0 };
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.hostname === "api.github.com") {
      calls.github += 1;
      const release = options.release;
      if (release === "fail") return new Response("down", { status: 503 });
      if (!release) return new Response("{}", { status: 404 });
      return Response.json({
        tag_name: release.tag,
        html_url: "https://github.com/example/patina/releases/tag/" + release.tag,
        published_at: release.publishedAt,
        assets: [
          {
            name: `patina-${release.tag}-arm64-v8a.apk`,
            browser_download_url: `https://github.com/example/patina/releases/download/${release.tag}/app.apk`,
          },
        ],
      });
    }
    if (url.port === "9000" && init?.method === "HEAD") {
      const key = decodeURIComponent(url.pathname.split("/").slice(2).join("/"));
      return new Response(null, { status: options.objects?.has(key) ? 200 : 404 });
    }
    throw new Error(`Unexpected network call to ${url.hostname}`);
  };
  return { fetch, calls };
}
