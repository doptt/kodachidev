/**
 * The site's one motion language, for the DOM and the 3D scenes alike.
 *
 * The same curves, and the fast, base and slow durations, are in CSS as
 * --ease-* and --duration-* (see the @theme block in styles/index.css). Keep
 * the two in step: anything that moves, whether a button, a word or a camera,
 * takes its timing from here.
 */

/** Cubic-bezier control points, in the form CSS and Motion take. */
export const EASE = {
  /** Things arriving: quick off the mark, long soft landing. The default. */
  out: [0.22, 1, 0.36, 1],
  /** Things travelling from one place to another: cameras, the sky turning. */
  inOut: [0.65, 0, 0.35, 1],
  /** UI answering a press or a hover. */
  glass: [0.32, 0.72, 0, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>

/** Durations in seconds. */
export const DURATION = {
  fast: 0.16,
  base: 0.32,
  slow: 0.64,
  /** A line of text arriving. */
  reveal: 0.9,
  /** A camera move between two framings. */
  scene: 1.6,
} as const

/**
 * A cubic-bezier easing as a function of t (0..1), for use outside CSS: the
 * same curve a transition with these control points would follow.
 */
export function bezier([x1, y1, x2, y2]: readonly [number, number, number, number]) {
  const ax = 3 * x1 - 3 * x2 + 1
  const bx = 3 * x2 - 6 * x1
  const cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1
  const by = 3 * y2 - 6 * y1
  const cy = 3 * y1
  return (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    // Solve x(s) = t for s by Newton's method, then read off y(s)
    let s = t
    for (let i = 0; i < 6; i++) {
      const x = ((ax * s + bx) * s + cx) * s - t
      const dx = (3 * ax * s + 2 * bx) * s + cx
      if (Math.abs(dx) < 1e-6) break
      s = Math.min(1, Math.max(0, s - x / dx))
    }
    return ((ay * s + by) * s + cy) * s
  }
}

export const easeOut = bezier(EASE.out)
export const easeInOut = bezier(EASE.inOut)

/**
 * Moves `current` toward `target` so that it covers all but 1/e of the gap
 * every `tau` seconds, whatever the frame rate. For anything that follows a
 * moving target: pointer parallax, look-at, drag inertia.
 */
export function damp(current: number, target: number, tau: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)))
}

/** Time constants for `damp`, in seconds. */
export const DAMP = {
  /** Scroll position catching up with the scrollbar. */
  scroll: 0.17,
  /** Camera parallax from the pointer: heavy. */
  parallax: 0.35,
  /** A head or an eye turning to look. */
  look: 0.22,
} as const
