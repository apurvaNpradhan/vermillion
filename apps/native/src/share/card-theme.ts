import {
  cardPalette,
  type CardPalette,
  type CardPaletteKind,
} from "@workspace/ui/tokens/share-card";
import { useMemo } from "react";

import { useAppliedVariant } from "@/platform/theme";

/** A palette function for several backgrounds at once (the swatch row). */
export function useCardPalettes() {
  const mode = useAppliedVariant();
  return useMemo(
    () => ({
      palettes: (kind: CardPaletteKind): CardPalette => cardPalette(mode, kind),
    }),
    [mode],
  );
}
