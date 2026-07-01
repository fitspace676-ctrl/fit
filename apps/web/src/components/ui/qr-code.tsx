// @fit/web — decorative deterministic QR placeholder.
//
// The member check-in QR. The real scannable token comes from the API's
// `GET /me/qr` (a short-lived check-in code); until that is wired this renders a
// stable, seed-derived 25×25 grid so the same member always sees the same glyph
// and the surrounding layout is real. Pass the API payload as `seed` to swap in
// the live code without touching the visual.

export interface QRCodeProps {
  /** Stable string the grid is derived from (e.g. the member id or check-in token). */
  seed: string;
  /** Pixel size of the rendered square. */
  size?: number;
  className?: string;
}

const GRID = 25;

/** A tiny deterministic hash → pseudo-random bit stream from the seed. */
function bitAt(seed: string, index: number): boolean {
  let h = 2166136261 ^ index;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return ((h >>> 7) & 1) === 1;
}

/** Is this cell part of one of the three finder squares (corners)? */
function isFinder(row: number, col: number): boolean {
  const inBox = (r0: number, c0: number) => row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7;
  return inBox(0, 0) || inBox(0, GRID - 7) || inBox(GRID - 7, 0);
}

export function QRCode({ seed, size = 200, className = '' }: QRCodeProps) {
  const cells: { x: number; y: number; finder: boolean }[] = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const finder = isFinder(row, col);
      const ring = (r0: number, c0: number) => {
        const lr = row - r0;
        const lc = col - c0;
        const edge = lr === 0 || lr === 6 || lc === 0 || lc === 6;
        const core = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
        return edge || core;
      };
      if (finder) {
        const on =
          (row < 7 && col < 7 && ring(0, 0)) ||
          (row < 7 && col >= GRID - 7 && ring(0, GRID - 7)) ||
          (row >= GRID - 7 && col < 7 && ring(GRID - 7, 0));
        if (on) cells.push({ x: col, y: row, finder: true });
      } else if (bitAt(seed, row * GRID + col)) {
        cells.push({ x: col, y: row, finder: false });
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={size}
      height={size}
      className={`rounded-xl bg-white p-1 ${className}`}
      role="img"
      aria-label="Check-in QR code"
    >
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x + 0.1}
          y={c.y + 0.1}
          width={0.8}
          height={0.8}
          rx={0.28}
          className={c.finder ? 'fill-brand-600' : 'fill-ink-900'}
        />
      ))}
    </svg>
  );
}
