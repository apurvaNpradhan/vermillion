import { mixHex } from "@workspace/ui/tokens/mix";

/** Map the artwork's luminance between two colours while keeping its alpha channel. */
export function shadingMatrix(shadow: string, highlight: string): number[] {
  const channel = (hex: string, offset: number) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;

  return [
    ...[1, 3, 5].flatMap((offset) => {
      const low = channel(shadow, offset);
      const range = channel(highlight, offset) - low;
      return [0.2126 * range, 0.7152 * range, 0.0722 * range, 0, low];
    }),
    0,
    0,
    0,
    1,
    0,
  ];
}

export function muscleArtTint(accent: string, dark: boolean) {
  const bodyHighlight = dark ? "#454545" : "#F3F3F3";
  const muscleShadow = mixHex(accent, "#000000", dark ? 0.12 : 0.28);
  const muscleHighlight = mixHex(accent, "#FFFFFF", dark ? 0.4 : 0.22);
  const bodyMidtone = mixHex("#000000", bodyHighlight, 0.8);
  const muscleMidtone = mixHex(muscleShadow, muscleHighlight, 0.45);

  return {
    body: shadingMatrix("#000000", bodyHighlight),
    muscle: shadingMatrix(muscleShadow, muscleHighlight),
    legend: {
      untrained: bodyMidtone,
      low: mixHex(bodyMidtone, muscleMidtone, tintOpacity(0.2)),
      mid: mixHex(bodyMidtone, muscleMidtone, tintOpacity(0.6)),
      high: muscleMidtone,
    },
  };
}

/** Separate low, mid and high volume while preserving the artwork's shading. */
export function tintOpacity(intensity: number): number {
  if (intensity <= 0) return 0;
  if (intensity < 0.4) return 0.28;
  if (intensity < 0.8) return 0.64;
  return 1;
}
