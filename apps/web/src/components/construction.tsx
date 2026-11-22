/**
 * The brand's construction drawing: a circle over a golden rectangle, the rectangle carved into
 * squares and a golden spiral, drawn as hairlines. It draws itself once when `animate` is set.
 * Coordinates are in the hero photograph's pixel space (1080 x 1456) so the circle frames the figure.
 */
const PHI = 1.618034;

interface Spiral {
  arc: string;
  cuts: string[];
}

/** Carves a golden rectangle (height `h`, width h * PHI) clockwise into squares, with its spiral. */
function goldenSpiral(x: number, y: number, h: number, turns: number): Spiral {
  const cuts: string[] = [];
  let arc = `M${x} ${y + h}`;
  let left = x;
  let top = y;
  let width = h * PHI;
  let height = h;
  for (let turn = 0; turn < turns; turn++) {
    const side = turn % 4;
    if (side === 0) {
      cuts.push(`M${left + height} ${top} V${top + height}`);
      arc += ` A${height} ${height} 0 0 1 ${left + height} ${top}`;
      left += height;
      width -= height;
    } else if (side === 1) {
      cuts.push(`M${left} ${top + width} H${left + width}`);
      arc += ` A${width} ${width} 0 0 1 ${left + width} ${top + width}`;
      top += width;
      height -= width;
    } else if (side === 2) {
      cuts.push(`M${left + width - height} ${top} V${top + height}`);
      arc += ` A${height} ${height} 0 0 1 ${left + width - height} ${top + height}`;
      width -= height;
    } else {
      cuts.push(`M${left} ${top + height - width} H${left + width}`);
      arc += ` A${width} ${width} 0 0 1 ${left} ${top + height - width}`;
      height -= width;
    }
  }
  return { arc, cuts };
}

export function Construction({
  animate,
  className,
  frame,
}: {
  animate: boolean;
  className: string;
  /** Photo-space layout of the drawing: the rectangle's left edge, top edge and height. */
  frame: { x: number; y: number; h: number; viewBox: string };
}) {
  const { x, y, h, viewBox } = frame;
  const width = h * PHI;
  const radius = h / 2;
  const { arc, cuts } = goldenSpiral(x, y, h, 7);
  const tick = h * 0.06;
  return (
    <svg
      className={`construction${animate ? " is-drawing" : ""} ${className}`}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMin slice"
      fill="none"
      aria-hidden="true"
    >
      <circle className="line" cx={x + radius} cy={y - radius} r={radius} pathLength={1} />
      <rect className="line" x={x} y={y} width={width} height={h} pathLength={1} />
      {cuts.map((cut, index) => (
        <path
          key={cut}
          className="line cut"
          d={cut}
          pathLength={1}
          style={{ animationDelay: `${0.55 + index * 0.08}s` }}
        />
      ))}
      <path className="line spiral" d={arc} pathLength={1} />
      <path
        className="line guide"
        d={`M${x - tick} ${y} H${x + width + tick} M${x} ${y - tick} V${y + h + tick} M${x + width} ${y - tick} V${y + h + tick}`}
        pathLength={1}
      />
    </svg>
  );
}
