import type { ThemeDefinition } from "./engine";

/**
 * Cinnabar, the brand: paper and coral. Used by the site and email; not an app theme yet.
 * Its surfaces and ink are pinned to the brand's hand-picked values.
 */
export const cinnabar: ThemeDefinition = {
  light: {
    base: "#F3F0EA",
    accent: "#F95C4B",
    onAccent: "#FFFFFF",
    pin: { surface: "#FDFCFA", ink: "#1B1717" },
  },
  dark: {
    base: "#141111",
    accent: "#F95C4B",
    onAccent: "#1B1717",
    pin: { surface: "#1D1919", ink: "#EDEBDD" },
  },
  family: {
    light: {
      danger: "#C2364E",
      success: "#4FA77A",
      warning: "#D6A234",
      protein: "#4B86B8",
      carbs: "#BE9233",
      fat: "#A9618F",
      "set-warmup": "#3F79A6",
      "set-drop": "#8C6A1F",
      "set-failure": "#94507C",
      "set-top": "#6F5A9E",
      "set-backoff": "#35796A",
      "set-myo": "#9C5A32",
      chart: ["#4FA77A", "#6F5A9E", "#3F79A6", "#D6A234"],
    },
    dark: {
      danger: "#EE7C8E",
      success: "#74C79C",
      warning: "#E6BF62",
      protein: "#83B8E0",
      carbs: "#E0BE6C",
      fat: "#CF9DC0",
      "set-warmup": "#83B8E0",
      "set-drop": "#E0BE6C",
      "set-failure": "#CF9DC0",
      "set-top": "#B3A6E6",
      "set-backoff": "#85CBB3",
      "set-myo": "#E5AB89",
      chart: ["#74C79C", "#B3A6E6", "#83B8E0", "#E6BF62"],
    },
  },
};
