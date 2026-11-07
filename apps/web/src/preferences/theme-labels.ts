import type { TranslationKey } from "@workspace/i18n";
import type { Theme } from "@/platform/theme";

export const THEME_LABEL_KEYS: Record<Theme, TranslationKey> = {
  light: "theme__light",
  dark: "theme__dark",
  system: "theme__system",
};
