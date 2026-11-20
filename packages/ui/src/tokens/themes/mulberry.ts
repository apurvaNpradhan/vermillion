import type { ThemeDefinition } from "./engine";
import { nord } from "./nord";

/** Parchment and plum surfaces with a mulberry accent. */
export const mulberry: ThemeDefinition = {
  light: {
    base: "#F2EBE9",
    accent: "#703957",
    onAccent: "#FFFFFF",
    pin: {
      surface: "#FCF6F4",
      control: "#E9DDE0",
      ink: "#2F202B",
      muted: "#67545F",
      hairline: "#D7C6CB",
    },
  },
  dark: {
    base: "#0A070A",
    accent: "#AD819D",
    pin: {
      surface: "#160F15",
      control: "#201820",
      ink: "#EEE5EC",
      muted: "#B4A1AE",
      hairline: "#372B36",
      action: "#745A6E",
    },
  },
  family: {
    light: { ...nord.family.light, success: "#315E56" },
    dark: { ...nord.family.dark, success: "#86AE9B" },
  },
};
