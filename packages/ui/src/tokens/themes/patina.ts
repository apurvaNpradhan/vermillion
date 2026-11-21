import type { ThemeDefinition } from "./engine";
import { graphiteDark, graphiteLight } from "./graphite-neutrals";

/**
 * Patina, the default theme (id `patina`), built from the logo's three colours: ink `#19130F`,
 * ivory `#FDF4E6` and olive `#869044`. Dark is the logo as drawn (ivory on ink, olive accent, a
 * olive fill with an ink label). Light is the same palette inverted: ivory paper, ink text and a
 * deeper olive so button labels and tinted chips keep their contrast. The engine moves any value
 * that falls short.
 */
export const patina: ThemeDefinition = {
  light: {
    base: "#FDF4E6",
    accent: "#5C6628",
    onAccent: "#FDF4E6",
    pin: {
      surface: "#FFFBF3",
      control: "#EFE5D2",
      ink: "#19130F",
      muted: "#6A5F52",
      hairline: "#DDD0B9",
    },
  },
  dark: {
    base: "#19130F",
    accent: "#869044",
    onAccent: "#19130F",
    pin: {
      surface: "#221B16",
      control: "#2D2520",
      ink: "#FDF4E6",
      muted: "#B5A998",
      hairline: "#352C25",
    },
  },
  family: { light: graphiteLight, dark: graphiteDark },
};
