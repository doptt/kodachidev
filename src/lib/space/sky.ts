/*
 * Tiny bits shared by the hero scene and the background sky.
 *
 * `sky` is a plain mutable object rather than React state: the hero writes
 * to it every animation frame and the starfield reads it every frame, so
 * routing it through React would re-render for nothing.
 */
export const sky = {
  /** 0..1, how hard the background stars streak outward (hero warp dive) */
  warp: 0,
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Small, fast, seeded PRNG so the scene looks the same on every visit */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (t: number) => t * t * (3 - 2 * t)
