/** Hairline golden-ratio construction (circle, golden rectangle, spiral) that draws itself once. */
const PHI = 1.618034;

function spiral(x: number, y: number, w: number, h: number, turns: number) {
  // golden rectangle w x h (w = h * PHI), carve squares clockwise: left, top, right, bottom
  const squares: string[] = [];
  let d = "";
  let rx = x,
    ry = y,
    rw = w,
    rh = h;
  for (let i = 0; i < turns; i++) {
    const dir = i % 4;
    let s: number;
    if (dir === 0) {
      // square on the left
      s = rh;
      squares.push(`M${rx + s} ${ry} V${ry + rh}`);
      d += (i === 0 ? `M${rx} ${ry + rh}` : "") + ` A${s} ${s} 0 0 1 ${rx + s} ${ry}`;
      rx += s;
      rw -= s;
    } else if (dir === 1) {
      // square on top
      s = rw;
      squares.push(`M${rx} ${ry + s} H${rx + rw}`);
      d += ` A${s} ${s} 0 0 1 ${rx + rw} ${ry + s}`;
      ry += s;
      rh -= s;
    } else if (dir === 2) {
      // square on the right
      s = rh;
      squares.push(`M${rx + rw - s} ${ry} V${ry + rh}`);
      d += ` A${s} ${s} 0 0 1 ${rx + rw - s} ${ry + rh}`;
      rw -= s;
    } else {
      // square at the bottom
      s = rw;
      squares.push(`M${rx} ${ry + rh - s} H${rx + rw}`);
      d += ` A${s} ${s} 0 0 1 ${rx} ${ry + rh - s}`;
      rh -= s;
    }
  }
  return { d, squares };
}

export default function Construction({
  className,
  animate = true,
}: {
  className?: string;
  animate?: boolean;
}) {
  const H = 380,
    W = H * PHI;
  const x = 40,
    y = 470;
  const { d, squares } = spiral(x, y, W, H, 7);
  const cx = x + H / 2,
    r = H / 2;
  return (
    <svg
      className={`construction ${animate ? "draw" : ""} ${className ?? ""}`}
      viewBox="0 0 700 900"
      fill="none"
      aria-hidden="true"
    >
      <circle className="ln l1" cx={cx} cy={y - r + 6} r={r} pathLength={1} />
      <rect className="ln l2" x={x} y={y} width={W} height={H} pathLength={1} />
      {squares.map((s, i) => (
        <path
          key={i}
          className="ln l3"
          d={s}
          pathLength={1}
          style={{ animationDelay: `${0.5 + i * 0.08}s` }}
        />
      ))}
      <path className="ln l4" d={d} pathLength={1} />
      <path
        className="ln l5"
        d={`M${x - 24} ${y} H${x + W + 24} M${x} ${y - 24} V${y + H + 24} M${x + W} ${y - 24} V${y + H + 24}`}
        pathLength={1}
      />
      <g className="node" transform={`translate(${x + W} ${y}) scale(0.9) translate(-12 -12)`}>
        <path d="M12 2 C12.7 7 13.5 9 15.5 10 L21 11 C16 12.1 14.3 13.8 13.1 16 L11 22 C10.7 17.5 10 15 8.5 13.8 L3 13 C7.2 11.8 9.3 10.1 10.1 8 Z" />
      </g>
    </svg>
  );
}
