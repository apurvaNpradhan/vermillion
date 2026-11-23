import type { Family } from "./engine";

/** Base data and status colours used by Sigil. */
export const graphiteDark: Family = {
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

/** Light fills sit on near-white cards, so the done fill takes a deeper green. */
export const graphiteLight: Family = {
  ...graphiteDark,
  success: "#719477",
  danger: "#A52F2F",
  chart: ["#6B6862", "#77746E", "#4F4C46", "#827D74"],
};
