import type { ThemeDefinition } from "./engine";
import {
  graphiteDark,
  graphiteLight,
  graphiteNeutralsDark,
  graphiteNeutralsLight,
} from "./graphite-neutrals";

/**
 * Basalt, the default theme (stored id `nord`, kept so saved choices still apply): graphite
 * neutrals with a deep moss accent and pale lichen text on the filled button.
 */
export const nord: ThemeDefinition = {
  light: {
    ...graphiteNeutralsLight,
    accent: "#2E4A35",
    onAccent: "#F4F2ED",
  },
  dark: {
    ...graphiteNeutralsDark,
    accent: "#86A487",
    onAccent: "#CFE3D2",
    pin: { ...graphiteNeutralsDark.pin, action: "#2C4231" },
  },
  family: { light: graphiteLight, dark: graphiteDark },
};
