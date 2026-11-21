import type { ThemeDefinition } from "./engine";
import { graphiteDark, graphiteLight } from "./graphite-neutrals";

/** Blue-gray surfaces and a fog-blue accent. */
export const slate: ThemeDefinition = {
  light: {
    base: "#E8EDF2",
    accent: "#315E83",
    onAccent: "#FFFFFF",
    pin: {
      surface: "#F6F8FB",
      control: "#DEE5EC",
      ink: "#172633",
      muted: "#506272",
      hairline: "#C8D2DC",
    },
  },
  dark: {
    base: "#06080B",
    accent: "#7F9BB4",
    pin: {
      surface: "#10151B",
      control: "#182027",
      ink: "#E1E7EC",
      muted: "#9BA9B5",
      hairline: "#283541",
      action: "#4B667B",
    },
  },
  family: {
    light: { ...graphiteLight, success: "#315E56" },
    dark: { ...graphiteDark, success: "#86AE9B" },
  },
};
