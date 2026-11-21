import type { ThemeDefinition } from "./engine";
import {
  graphiteDark,
  graphiteLight,
  graphiteNeutralsDark,
  graphiteNeutralsLight,
} from "./graphite-neutrals";

/** Oxide: graphite neutrals with a dark rust accent. */
export const oxide: ThemeDefinition = {
  light: { ...graphiteNeutralsLight, accent: "#7A3B2E", onAccent: "#F4F2ED" },
  dark: {
    ...graphiteNeutralsDark,
    accent: "#D79A86",
    onAccent: "#F0D2C8",
    pin: { ...graphiteNeutralsDark.pin, action: "#5A2E24" },
  },
  family: { light: graphiteLight, dark: graphiteDark },
};
