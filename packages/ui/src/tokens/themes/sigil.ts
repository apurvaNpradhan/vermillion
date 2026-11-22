import { graphiteDark, graphiteLight } from "./graphite-neutrals";
import type { Family, ThemeDefinition } from "./engine";

/**
 * Sigil (docs/design/sigil/SPEC.md): two inks and one rare ember. The action, focus ring, toggles,
 * progress and timers are ink; ember (`identity`) means "you / now / earned" and nothing else.
 * Completed sets are lichen; danger is a cooler rose, never ember. The spec's exact values are
 * pinned or overridden so the engine only derives what the spec leaves open.
 */
const darkFamily: Family = {
  ...graphiteDark,
  success: "#A9BC9A",
  warning: "#D9B66A",
  danger: "#F28BA3",
  // Series are inks and neutral stones; the ember stays out of charts.
  chart: ["#A9BC9A", "#D9B66A", "#A39D90", "#C9A0A8"],
};

const lightFamily: Family = {
  ...graphiteLight,
  success: "#4A6541",
  warning: "#765810",
  danger: "#83193E",
  chart: ["#4A6541", "#765810", "#5F5A52", "#8A5460"],
};

export const sigil: ThemeDefinition = {
  dark: {
    base: "#0B0A09",
    accent: "#ECE6D8",
    onAccent: "#0B0A09",
    pin: {
      surface: "#161412",
      control: "#201E1B",
      ink: "#ECE6D8",
      muted: "#A39D90",
      hairline: "#2B2824",
    },
    override: {
      "text-secondary": "#CFC8BA",
      identity: "#F06A4E",
      "identity-soft": "#321C16",
      "brand-detail": "#E04A2F",
      "focus-ring": "#ECE6D8",
      "set-done": "#A9BC9A",
      "set-done-soft": "#22261E",
      "set-done-soft-foreground": "#ECE6D8",
      success: "#A9BC9A",
    },
  },
  light: {
    base: "#EFEBE2",
    accent: "#141210",
    onAccent: "#F7F4EE",
    pin: {
      surface: "#F7F4EE",
      control: "#E3DED3",
      ink: "#141210",
      muted: "#5F5A52",
      hairline: "#D6CFC2",
    },
    override: {
      "text-secondary": "#3A3631",
      identity: "#B5321A",
      "identity-soft": "#EFDDD5",
      "brand-detail": "#B5321A",
      "focus-ring": "#141210",
      "set-done": "#4A6541",
      "set-done-soft": "#DCE0D2",
      "set-done-soft-foreground": "#141210",
      success: "#4A6541",
    },
  },
  family: { light: lightFamily, dark: darkFamily },
};
