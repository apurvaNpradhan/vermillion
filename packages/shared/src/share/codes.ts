import { z } from "zod";

/** Digits and capitals without the look-alikes 0/O and 1/I/L, so a code survives being read aloud. */
export const SHARE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SHARE_CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${SHARE_CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

/** What a Share link points at; the URL path says which. */
export const SHARE_LINK_KINDS = ["program", "workout"] as const;
export type ShareLinkKind = (typeof SHARE_LINK_KINDS)[number];
export const shareLinkKindSchema = z.enum(SHARE_LINK_KINDS);

/** The path segment of each kind: `/p/<code>` is a Program, `/w/<code>` a Workout. */
export const SHARE_PATH_PREFIX = { program: "p", workout: "w" } as const satisfies Record<
  ShareLinkKind,
  string
>;

/** A code as stored and shown: exactly six characters of {@link SHARE_CODE_ALPHABET}. */
export const shareCodeSchema = z.string().regex(CODE_PATTERN, { error: "Not a share code" });

/**
 * A code typed or pasted by a person: case and spaces or dashes between characters do not
 * matter. Null when what is left is not a valid code.
 */
export function normalizeShareCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE_PATTERN.test(code) ? code : null;
}

/** `https://<site>/p/<code>`: the link a Program or Workout is shared as. */
export function shareLinkUrl(site: string, kind: ShareLinkKind, code: string): string {
  return `${site.replace(/\/+$/, "")}/${SHARE_PATH_PREFIX[kind]}/${code}`;
}

/**
 * The code in whatever a person pastes: a bare code, or a Share link on any host (the path is
 * all that counts). Null when there is none.
 */
export function parseShareInput(input: string): string | null {
  const text = input.trim();
  const path = /\/[pw]\/([^/?#\s]+)/i.exec(text);
  return normalizeShareCode(path?.[1] ?? text);
}
