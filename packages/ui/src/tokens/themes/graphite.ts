import type { ThemeDefinition } from "./engine";
import {
  graphiteDark,
  graphiteLight,
  graphiteNeutralsDark,
  graphiteNeutralsLight,
} from "./graphite-neutrals";

/** Graphite: monochrome. The accent is ink, so "you / now" is simply the strongest text colour. */
export const graphite: ThemeDefinition = {
  light: { ...graphiteNeutralsLight, accent: "#191918", onAccent: "#F4F2ED" },
  dark: { ...graphiteNeutralsDark, accent: "#EFEEE9", onAccent: "#111111" },
  family: { light: graphiteLight, dark: graphiteDark },
};
