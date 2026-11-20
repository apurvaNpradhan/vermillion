import type { Family, ThemeDefinition } from "./engine";

/** Graphite and chalk neutrals with a lavender accent and restrained data colours. */
const aurora: Family = {
  success: "#9CB7A1",
  warning: "#EBCB8B",
  danger: "#BF616A",
  protein: "#81A1C1",
  carbs: "#EBCB8B",
  fat: "#B48EAD",
  "set-warmup": "#81A1C1",
  "set-drop": "#EBCB8B",
  "set-failure": "#BF616A",
  "set-top": "#B48EAD",
  "set-backoff": "#8FBCBB",
  "set-myo": "#D08770",
  chart: ["#AAA8A2", "#898781", "#C0BDB5", "#77756E"],
};

/** Light fills sit on near-white cards, so the done fill takes a deeper Aurora green. */
const auroraLight: Family = {
  ...aurora,
  success: "#719477",
  danger: "#A52F2F",
  chart: ["#6B6862", "#77746E", "#4F4C46", "#827D74"],
};

export const nord: ThemeDefinition = {
  light: {
    base: "#F4F2ED",
    accent: "#6A4FA3",
    onAccent: "#F4F2ED",
    pin: {
      surface: "#FBFAF7",
      control: "#EAE7E0",
      ink: "#191918",
      muted: "#5E5C56",
      hairline: "#D4D0C7",
    },
  },
  dark: {
    base: "#070707",
    accent: "#B3A1E3",
    pin: {
      surface: "#121212",
      control: "#1C1C1C",
      ink: "#EFEEE9",
      muted: "#AAA8A2",
      hairline: "#2B2B2B",
      action: "#6A5B92",
    },
  },
  family: { light: auroraLight, dark: aurora },
};
