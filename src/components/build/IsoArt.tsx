import { cn } from '@/lib/cn'

type V3 = readonly [number, number, number]
/** A cuboid in isometric space: back-bottom corner and width / depth / height. */
export type IsoBox = { at: V3; size: V3; accent?: boolean }

type Pt = readonly [number, number]
/** Isometric projection. Larger x + y sits lower on screen, i.e. nearer the viewer. */
const project = (x: number, y: number, z: number): Pt => [(x - y) * 0.866, (x + y) * 0.5 - z]

function boxGeometry({ at: [x, y, z], size: [w, d, h] }: IsoBox) {
  const x1 = x + w, y1 = y + d, z1 = z + h
  const A = project(x, y, z1), B = project(x1, y, z1), C = project(x1, y1, z1), D = project(x, y1, z1)
  const E = project(x, y, z), F = project(x1, y, z), G = project(x1, y1, z), H = project(x, y1, z)
  const line = (...pts: Pt[]) => 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')
  return {
    points: [A, B, C, D, E, F, G, H],
    // Silhouette, filled so nearer boxes cover the ones behind
    fill: line(A, B, F, G, H, D) + 'Z',
    // The nine edges facing the viewer
    solid: line(A, B, C, D) + 'Z' + line(B, F, G, H, D) + line(C, G),
    // The three edges on the far side, drawn dotted
    hidden: line(F, E, H) + line(E, A),
  }
}

const W = 320
const H = 200

/**
 * Isometric wireframe drawing: pale outlines with dotted far edges, and one
 * glowing periwinkle box that floats and lifts when its bento cell is hovered.
 * Boxes are drawn in the order given, so list them back to front.
 */
export function IsoArt({ boxes, floatDelay = 0, className }: { boxes: readonly IsoBox[]; floatDelay?: number; className?: string }) {
  const shapes = boxes.map((b) => ({ ...boxGeometry(b), accent: b.accent }))
  const xs = shapes.flatMap((s) => s.points.map((p) => p[0]))
  const ys = shapes.flatMap((s) => s.points.map((p) => p[1]))
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2

  return (
    <svg
      viewBox={`${(cx - W / 2).toFixed(1)} ${(cy - H / 2).toFixed(1)} ${W} ${H}`}
      className={cn('h-44 w-auto max-w-none shrink-0 overflow-visible sm:h-48', className)}
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {shapes.map((s, i) =>
        s.accent ? (
          <g
            key={i}
            className="transition-[translate] duration-(--duration-slow) ease-(--ease-glass) group-hover/cell:-translate-y-2"
          >
            <g
              className="animate-float"
              style={{
                animationDelay: `${-floatDelay}s`,
                filter: 'drop-shadow(0 0 5px rgb(124 120 255 / 0.95)) drop-shadow(0 0 16px rgb(98 92 255 / 0.6))',
              }}
            >
              <path d={s.fill} fill="rgb(22 22 74 / 0.92)" />
              <path d={s.hidden} stroke="rgb(183 188 255 / 0.5)" strokeWidth="1" strokeDasharray="1.5 3.5" />
              <path d={s.solid} stroke="#b7bcff" strokeWidth="1.3" />
            </g>
          </g>
        ) : (
          <g key={i}>
            <path d={s.fill} fill="rgb(5 6 22 / 0.88)" />
            <path d={s.hidden} stroke="rgb(214 218 255 / 0.3)" strokeWidth="1" strokeDasharray="1.5 3.5" />
            <path d={s.solid} stroke="rgb(214 218 255 / 0.62)" strokeWidth="1" />
          </g>
        ),
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Drawings, one per "What I build" item                                */
/* ------------------------------------------------------------------ */

const tiles: IsoBox[] = []
for (let sum = -2; sum <= 2; sum++) {
  for (let i = -1; i <= 1; i++) {
    const j = sum - i
    if (j < -1 || j > 1) continue
    tiles.push(
      i === 0 && j === 0
        ? { at: [-15, -15, 0], size: [30, 30, 30], accent: true }
        : { at: [i * 36 - 15, j * 36 - 15, 0], size: [30, 30, 4] },
    )
  }
}

export const ISO_ART = {
  /** Three slabs with a block set on the middle one: pieces assembled into a design. */
  design: [
    { at: [-74, 26, 0], size: [48, 48, 22] },
    { at: [-24, -24, 0], size: [48, 48, 8] },
    { at: [-13, -13, 8], size: [26, 26, 26], accent: true },
    { at: [26, -74, 0], size: [48, 48, 10] },
  ],
  /** Desktop, tablet and phone screens standing in a row. */
  responsive: [
    { at: [-78, 30, 0], size: [64, 5, 44] },
    { at: [-6, -8, 0], size: [32, 5, 42] },
    { at: [36, -38, 0], size: [18, 5, 32], accent: true },
  ],
  /** A core block ringed by tiles. */
  secure: tiles,
  /** Stacked layers: database, server, interface. */
  backend: [
    { at: [-40, -40, 0], size: [80, 80, 8] },
    { at: [-40, -40, 18], size: [80, 80, 8] },
    { at: [-40, -40, 36], size: [80, 80, 8], accent: true },
  ],
  /** A run of cards with the next one picked out: orders and bookings. */
  payments: Array.from({ length: 7 }, (_, i): IsoBox => ({ at: [-56 + i * 16, -23, 0], size: [4, 46, 54], accent: i === 6 })),
  /** Steps climbing to launch. */
  launch: [-54, -18, 18, 54].map((c, k): IsoBox => ({ at: [c - 15, -c - 15, 0], size: [30, 30, [10, 22, 34, 48][k]], accent: k === 3 })),
} satisfies Record<string, readonly IsoBox[]>
