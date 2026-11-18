import {
  cardPalette,
  type CardPalette,
  type CardPaletteKind,
} from "@workspace/ui/tokens/share-card";
import { useMemo } from "react";

import { useAppliedVariant } from "@/platform/theme";

/** A palette function for several backgrounds at once (the swatch row). */
export function useCardPalettes(): (kind: CardPaletteKind) => CardPalette {
  const mode = useAppliedVariant();
  return useMemo(() => (kind) => cardPalette(mode, kind), [mode]);
}
