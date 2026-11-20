import type { ThemeDefinition } from "./engine";
import { nord } from "./nord";

/** Limestone and forest surfaces with a yellow-olive accent. */
export const olive: ThemeDefinition = {
  light: {
    base: "#EEEEE2",
    accent: "#4E5B2A",
    onAccent: "#FFFFFF",
    pin: {
      surface: "#F8F8F1",
      control: "#E3E6D6",
      ink: "#252A1E",
      muted: "#535B46",
      hairline: "#CDD2BE",
    },
  },
  dark: {
    base: "#070906",
    accent: "#A4AD7B",
    pin: {
      surface: "#11150E",
      control: "#1A2015",
      ink: "#E6E9DE",
      muted: "#A6AB99",
      hairline: "#2D3525",
      action: "#5A6745",
    },
  },
  family: {
    light: { ...nord.family.light, success: "#2D5E59" },
    dark: { ...nord.family.dark, success: "#7FABA5" },
  },
};
