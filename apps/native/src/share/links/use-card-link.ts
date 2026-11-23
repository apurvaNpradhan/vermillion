import { useCallback, useRef, useState } from "react";
import { Share } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { type CreatedLink, useCreateShareLink } from "./use-share-link";
import type { ShareTarget } from "./snapshot-source";

/**
 * What a card's Share link points at. `weights` names the privacy toggle that decides whether the
 * link carries planned weights, so the link never shares more than the card shows.
 */
export type CardLinkSource<Id extends string> = {
  target: ShareTarget;
  weights: Id;
  /** A toggle that must be on for the card to carry a link (a link with no content to share). */
  requires?: Id;
};

type Made = { weights: boolean; link: CreatedLink };

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * The Share link of the card being composed. It is made only when the card is shared (or "Share
 * link" is pressed), never while browsing or saving to Photos, and reused until the weights toggle
 * changes. Saving draws a link only when one already exists. It follows the card's privacy toggles:
 * when the `requires` toggle is off there is no link. `prepare` waits for the card to redraw with
 * the link before the capture reads it.
 */
export function useCardLink<Id extends string>(
  source: CardLinkSource<Id> | undefined,
  toggles: Readonly<Record<Id, boolean>>,
) {
  const { t } = useTranslation();
  const { create, isPending } = useCreateShareLink();
  const [enabled, setEnabled] = useState(true);
  const [made, setMade] = useState<Made | null>(null);
  const latest = useRef<Made | null>(null);
  const weights = source ? toggles[source.weights] : false;
  const allowed = source ? !source.requires || toggles[source.requires] : false;
  const fresh = made && made.weights === weights ? made.link : null;

  const ensure = useCallback(async (): Promise<CreatedLink | null> => {
    if (!source || !allowed) return null;
    if (latest.current && latest.current.weights === weights) return latest.current.link;
    const link = await create(source.target, { weights });
    if (!link) return null;
    latest.current = { weights, link };
    setMade(latest.current);
    return link;
  }, [allowed, create, source, weights]);

  /** Makes the link if the card should carry one, then lets the card redraw. Share only. */
  const prepare = useCallback(async () => {
    if (!source || !enabled || !allowed) return;
    const link = await ensure();
    // Two frames: the state change renders the footer, the second lets it settle.
    if (link) {
      await nextFrame();
      await nextFrame();
    }
  }, [allowed, enabled, ensure, source]);

  const shareLink = useCallback(async () => {
    const link = await ensure();
    if (link)
      await Share.share({ message: t("share__link_message", { url: link.url }) }).catch(
        () => undefined,
      );
  }, [ensure, t]);

  return {
    link: enabled && allowed ? fresh : null,
    enabled,
    /** False when a required toggle is off: the link cannot be added. */
    allowed,
    setEnabled,
    busy: isPending,
    prepare,
    shareLink,
  };
}
