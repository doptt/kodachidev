/**
 * Per-section "scene" settings for the animated background.
 *
 * Any element with `data-bg-scene="<name>"` contributes its scene, weighted by
 * how much of the viewport it covers. The weighted mix is eased over time, so
 * scrolling from one section into the next blends the look smoothly.
 */
export type BgScene = {
  /** Strength of the flowing UV warp, in world units (image width = 1). Calm: 0.02, lively: 0.06. */
  waveAmp: number
  /** Spatial frequency of the warp noise. Lower = broad slow swells, higher = finer ripples. */
  warpScale: number
  /** Speed multiplier for the flow animation. 1 = base speed (very slow). */
  flowSpeed: number
  /** Camera zoom. 1 = the still covers the viewport exactly ("object-fit: cover"). */
  zoom: number
  /** Base direction (radians) of the light that glides along the ridges. */
  highlightAngle: number
  /** Strength of the sliding specular highlight. 0 = off, 1 = pronounced. */
  highlight: number
  /** Star density multiplier for the three procedural star layers. 0 = none, 1 = default. */
  stars: number
  /** Overall darkening toward the base navy. 0 = source brightness, 1 = very dark. */
  darkness: number
  /** Contrast of the ridges around their mean. 1 = source, 1.25 = punchier. */
  contrast: number
  /** Tiny hue rotation in radians (keep within ±0.12). */
  hueShift: number
}

export const SCENES: Record<string, BgScene> = {
  /** Calm and brightest. Faithful to the source still; soft light, delicate stars. */
  hero: {
    waveAmp: 0.022,
    warpScale: 2.2,
    flowSpeed: 1,
    zoom: 1,
    highlightAngle: 0.6,
    highlight: 0.55,
    stars: 0.9,
    darkness: 0.1,
    contrast: 1.0,
    hueShift: 0,
  },
  /** A touch closer, waves breathe a bit more, warm-ish light from the top right. */
  build: {
    waveAmp: 0.032,
    warpScale: 2.6,
    flowSpeed: 1.15,
    zoom: 1.12,
    highlightAngle: 1.3,
    highlight: 0.7,
    stars: 0.8,
    darkness: 0.3,
    contrast: 1.08,
    hueShift: 0.03,
  },
  /** Interlude: dark and quiet so the bright statement panel carries the screen. */
  statement: {
    waveAmp: 0.024,
    warpScale: 2.4,
    flowSpeed: 0.85,
    zoom: 1.18,
    highlightAngle: 1.8,
    highlight: 0.5,
    stars: 1.0,
    darkness: 0.52,
    contrast: 1.04,
    hueShift: 0,
  },
  /** The centrepiece: pronounced ridges, stronger sliding light, more stars. */
  work: {
    waveAmp: 0.048,
    warpScale: 3.0,
    flowSpeed: 1.3,
    zoom: 1.22,
    highlightAngle: 2.3,
    highlight: 0.85,
    stars: 1.15,
    darkness: 0.26,
    contrast: 1.12,
    hueShift: -0.02,
  },
  /**
   * On the way into the black hole: the field slows, widens and darkens as it
   * fades out, and its stars thin away. By the time the hole is up it is black.
   */
  blackhole: {
    waveAmp: 0.02,
    warpScale: 1.9,
    flowSpeed: 0.6,
    zoom: 1.32,
    highlightAngle: 2.7,
    highlight: 0.42,
    stars: 0.15,
    darkness: 0.6,
    contrast: 1.02,
    hueShift: 0.02,
  },
  /** Wider, quieter; light from the left; a hint more violet. */
  about: {
    waveAmp: 0.03,
    warpScale: 2.0,
    flowSpeed: 0.9,
    zoom: 0.94,
    highlightAngle: 3.4,
    highlight: 0.6,
    stars: 0.7,
    darkness: 0.4,
    contrast: 1.05,
    hueShift: 0.06,
  },
  /** Darker and calmest, almost still water, few stars. */
  contact: {
    waveAmp: 0.016,
    warpScale: 1.8,
    flowSpeed: 0.7,
    zoom: 1.05,
    highlightAngle: 4.2,
    highlight: 0.4,
    stars: 0.45,
    darkness: 0.6,
    contrast: 0.98,
    hueShift: 0.02,
  },
}

export const DEFAULT_SCENE = 'hero'

export const SCENE_KEYS = Object.keys(SCENES.hero) as (keyof BgScene)[]

export function sceneFrom(name: string | null | undefined): BgScene {
  return (name && SCENES[name]) || SCENES[DEFAULT_SCENE]
}

export function cloneScene(s: BgScene): BgScene {
  return { ...s }
}

/** Weighted sum of scenes. `weights` must sum to 1 (or be empty, giving `fallback`). */
export function mixScenes(parts: { scene: BgScene; weight: number }[], fallback: BgScene): BgScene {
  const out: BgScene = { ...fallback }
  let total = 0
  for (const p of parts) total += p.weight
  if (total <= 0) return out
  for (const k of SCENE_KEYS) {
    let v = 0
    for (const p of parts) v += p.scene[k] * (p.weight / total)
    out[k] = v
  }
  return out
}

/** Exponential ease of every field of `current` toward `target`. `k` in [0,1] is the per-frame blend. */
export function easeScene(current: BgScene, target: BgScene, k: number): void {
  for (const key of SCENE_KEYS) current[key] += (target[key] - current[key]) * k
}
