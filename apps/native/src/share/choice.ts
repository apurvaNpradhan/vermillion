import { CARD_BACKGROUNDS, type CardBackground } from "@workspace/ui/tokens/share-card";
import { z } from "zod";

import type { ShareKind, ShareTemplate, ShareToggle } from "./types";

/** The device-storage key of a kind's remembered choice: `share.session`. */
export function choiceKey(kind: ShareKind): string {
  return `share.${kind}`;
}

export type ShareChoice<Id extends string> = {
  template: string;
  background: CardBackground;
  toggles: Record<Id, boolean>;
};

const storedSchema = z.object({
  template: z.string(),
  background: z.enum(CARD_BACKGROUNDS),
  toggles: z.record(z.string(), z.boolean()),
});

/** One value per toggle id. */
function toggleValues<Id extends string>(
  toggles: readonly ShareToggle<Id>[],
  value: (toggle: ShareToggle<Id>) => boolean,
): Record<Id, boolean> {
  // SAFETY: fromEntries over every toggle yields exactly one entry per toggle id.
  return Object.fromEntries(toggles.map((toggle) => [toggle.id, value(toggle)])) as Record<
    Id,
    boolean
  >;
}

/** The choice of a first visit: the first template, the Theme background, every default toggle. */
export function defaultChoice<Id extends string>(
  templates: readonly Pick<ShareTemplate<Id>, "id">[],
  toggles: readonly ShareToggle<Id>[],
): ShareChoice<Id> {
  return {
    template: templates[0]?.id ?? "",
    background: "theme",
    toggles: toggleValues(toggles, (toggle) => toggle.defaultOn),
  };
}

/**
 * The remembered choice, read defensively: a missing, malformed or outdated value (a template or
 * a toggle that no longer exists) falls back to the defaults field by field. Toggles that are not
 * remembered (Show photo) always take their default.
 */
export function readChoice<Id extends string>(
  raw: string | null,
  templates: readonly Pick<ShareTemplate<Id>, "id">[],
  toggles: readonly ShareToggle<Id>[],
): ShareChoice<Id> {
  const fallback = defaultChoice(templates, toggles);
  if (raw === null) return fallback;
  let parsed: z.infer<typeof storedSchema>;
  try {
    const result = storedSchema.safeParse(JSON.parse(raw));
    if (!result.success) return fallback;
    parsed = result.data;
  } catch {
    return fallback;
  }
  const remembered = new Map(Object.entries(parsed.toggles));
  return {
    template: templates.some((template) => template.id === parsed.template)
      ? parsed.template
      : fallback.template,
    background: parsed.background,
    toggles: toggleValues(toggles, (toggle) =>
      toggle.remember ? (remembered.get(toggle.id) ?? toggle.defaultOn) : toggle.defaultOn,
    ),
  };
}

/** What goes to storage: the choice without the toggles that are never remembered. */
export function writeChoice<Id extends string>(
  choice: ShareChoice<Id>,
  toggles: readonly ShareToggle<Id>[],
): string {
  return JSON.stringify({
    template: choice.template,
    background: choice.background,
    toggles: Object.fromEntries(
      toggles.flatMap((toggle) =>
        toggle.remember ? [[toggle.id, choice.toggles[toggle.id]]] : [],
      ),
    ),
  });
}

/** The templates the toggles allow, in order. */
export function availableTemplates<Id extends string>(
  templates: readonly ShareTemplate<Id>[],
  toggles: Readonly<Record<Id, boolean>>,
): ShareTemplate<Id>[] {
  return templates.filter(
    (template) => template.requires === undefined || toggles[template.requires],
  );
}

/**
 * The backgrounds the swatch row offers: the four palette ones, and Photo only when the card has
 * a picture and its toggle is on.
 */
export function availableBackgrounds<Id extends string>(
  photoToggle: Id | null,
  toggles: Readonly<Record<Id, boolean>>,
): CardBackground[] {
  const base = CARD_BACKGROUNDS.filter((background) => background !== "photo");
  return photoToggle !== null && toggles[photoToggle] ? [...base, "photo"] : base;
}

/**
 * The background a template is drawn on: its fixed one, else the chosen one, else the default
 * when the chosen one is no longer offered (Show photo was turned off after choosing Photo).
 */
export function effectiveBackground(
  chosen: CardBackground,
  template: Pick<ShareTemplate<string>, "fixedBackground">,
  offered: readonly CardBackground[],
): CardBackground {
  if (template.fixedBackground) return template.fixedBackground;
  return offered.includes(chosen) ? chosen : "theme";
}
