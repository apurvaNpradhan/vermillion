/** Cover photos live in `documentDirectory/program-covers/<programId>.jpg` (ADR 0036). */
export const COVER_DIRECTORY = "program-covers";
export const COVER_SIZE_PX = 1024;
export const COVER_QUALITY = 0.85;

const SUFFIX = ".jpg";

export function coverFileName(programId: string): string {
  return `${programId}${SUFFIX}`;
}

/** The Program id a file in the cover directory belongs to, or null for a file that is not a cover. */
export function programIdOfCoverFile(name: string): string | null {
  return name.endsWith(SUFFIX) && name.length > SUFFIX.length
    ? name.slice(0, -SUFFIX.length)
    : null;
}

/** The files of the cover directory whose Program is no longer one that has a cover. */
export function orphanedCoverFiles(names: readonly string[], keepProgramIds: readonly string[]) {
  const keep = new Set(keepProgramIds);
  return names.filter((name) => {
    const id = programIdOfCoverFile(name);
    return id === null || !keep.has(id);
  });
}

/**
 * A square the picked image can be cut to: the centred largest square, for a picker that ignored
 * the 1:1 crop. Null when the image already is one.
 */
export function centredSquare(
  width: number,
  height: number,
): { originX: number; originY: number; width: number; height: number } | null {
  if (width === height) return null;
  const side = Math.min(width, height);
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

/** The side to resize a square to: down to {@link COVER_SIZE_PX}, never up. */
export function coverSide(side: number): number {
  return Math.min(side, COVER_SIZE_PX);
}
