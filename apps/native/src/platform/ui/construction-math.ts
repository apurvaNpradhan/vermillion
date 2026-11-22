/**
 * Geometry of the Sigil construction drawing (secondary motif G): a circle, a golden rectangle
 * and the golden spiral built by carving squares from it. Ported from
 * docs/design/sigil/construction-reference.tsx; pure so it can be tested.
 */
export const PHI = 1.618034;

/** Rectangle height in drawing units; the width is `height * PHI`. */
const RECT_HEIGHT = 380;
const ORIGIN = { x: 40, y: 470 };
/** Squares carved from the rectangle; the spiral is one quarter arc per square. */
const TURNS = 7;

export interface Construction {
  /** The viewBox the drawing fits, with a small margin. */
  viewBox: { x: number; y: number; width: number; height: number };
  circle: { cx: number; cy: number; r: number };
  rect: { x: number; y: number; width: number; height: number };
  /** The dividing line of each carved square, as path data. */
  squares: string[];
  /** The spiral, as path data. */
  spiral: string;
}

/** Carves `turns` squares clockwise from a golden rectangle and returns the spiral through them. */
export function spiralPaths(x: number, y: number, width: number, height: number, turns: number) {
  const squares: string[] = [];
  let spiral = "";
  let [rx, ry, rw, rh] = [x, y, width, height];
  for (let i = 0; i < turns; i++) {
    const side = i % 4;
    if (side === 0) {
      // A square on the left.
      squares.push(`M${rx + rh} ${ry} V${ry + rh}`);
      spiral += `${i === 0 ? `M${rx} ${ry + rh}` : ""} A${rh} ${rh} 0 0 1 ${rx + rh} ${ry}`;
      rx += rh;
      rw -= rh;
    } else if (side === 1) {
      // A square on top.
      squares.push(`M${rx} ${ry + rw} H${rx + rw}`);
      spiral += ` A${rw} ${rw} 0 0 1 ${rx + rw} ${ry + rw}`;
      ry += rw;
      rh -= rw;
    } else if (side === 2) {
      // A square on the right.
      squares.push(`M${rx + rw - rh} ${ry} V${ry + rh}`);
      spiral += ` A${rh} ${rh} 0 0 1 ${rx + rw - rh} ${ry + rh}`;
      rw -= rh;
    } else {
      // A square at the bottom.
      squares.push(`M${rx} ${ry + rh - rw} H${rx + rw}`);
      spiral += ` A${rw} ${rw} 0 0 1 ${rx} ${ry + rh - rw}`;
      rh -= rw;
    }
  }
  return { squares, spiral: spiral.trim() };
}

export function construction(): Construction {
  const height = RECT_HEIGHT;
  const width = height * PHI;
  const { x, y } = ORIGIN;
  const r = height / 2;
  const circle = { cx: x + r, cy: y - r + 6, r };
  const { squares, spiral } = spiralPaths(x, y, width, height, TURNS);
  const margin = 6;
  const top = circle.cy - r;
  return {
    viewBox: {
      x: x - margin,
      y: top - margin,
      width: width + margin * 2,
      height: y + height - top + margin * 2,
    },
    circle,
    rect: { x, y, width, height },
    squares,
    spiral,
  };
}
