import {
  cardPalette,
  type CardPalette,
  type CardPaletteKind,
} from "@workspace/ui/tokens/share-card";
import { useMemo } from "react";

import { useThemeChoice, useThemeMode } from "@/platform/theme";

/** A palette function for several backgrounds at once (the swatch row). */
export function useCardPalettes(): (kind: CardPaletteKind) => CardPalette {
  const { choice } = useThemeChoice();
  const mode = useThemeMode();
  return useMemo(() => (kind) => cardPalette(choice.theme, mode, kind), [choice.theme, mode]);
}
