/**
 * Scroll → what the camera, the grade and the page are doing. Pure functions,
 * no DOM, no GL and no imports, so the pacing can be tested on its own and
 * reused by whatever scene follows.
 *
 * Distances are in Schwarzschild radii (the event horizon sits at r = 1).
 */

/** Pinned progress at which the fall starts; before it the scene idles. */
export const IDLE_END = 0.13
/** Pinned progress at which the camera has reached the horizon. */
export const FALL_END = 0.9
/** From here to 1 the screen is held fully black. */
export const BLACK_AT = 0.935
/** `entered` fires at this progress and clears again below EXIT_AT (hysteresis). */
export const ENTER_AT = 0.95
export const EXIT_AT = 0.925

/**
 * How far ahead of the pinned stage its approach is tracked, in viewport
 * heights: `enter` starts counting when the top of the stage is this far below
 * the top of the viewport.
 */
export const LEAD = 2
/** Where the top of the stage is, in viewport heights, when the scene starts to come up. */
export const ARRIVE_FROM = 0.95

/** Camera distance at idle and at the end of the fall. */
export const DIST_FAR = 62
export const DIST_NEAR = 3
/** Critical impact parameter: the apparent radius of the shadow, in Schwarzschild radii. */
export const SHADOW_B = 2.598

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const rad = (deg: number) => (deg * Math.PI) / 180

export type Frame = {
  /** 0 at idle → 1 at the horizon, linear in scroll. */
  fall: number
  /** Eased fall: slow start, accelerating. Drives distance. */
  travel: number
  /** Camera distance from the hole. */
  dist: number
  /** Camera elevation above the disk plane, radians. */
  elev: number
  /** Extra orbit around the hole picked up on the way in, radians. */
  azim: number
  /** Camera roll, radians. Positive tilts the disk down to the right. */
  roll: number
  /** How far the framing has moved from "hole off-centre" (0) to "dead ahead" (1). */
  aim: number
  /** Multiplier on the idle field of view (widens on approach). */
  fovScale: number
  /** Camera shake amplitude, radians. */
  shake: number
  /** Exposure multiplier. Closes down on approach, because the inner disk is far hotter than the rim. */
  exposure: number
  /** Radial smear strength, 0..1. */
  smear: number
  /** Edge darkness closing in toward the centre, 0..1. */
  iris: number
  /** Final multiply toward black: 1 means the frame is exactly black. */
  blackout: number
  /** "Scroll to enter" cue opacity. */
  cue: number
}

/**
 * Easing for the fall. Distance is interpolated in log space, so the apparent
 * size of the hole already grows exponentially; the power curve on top gives
 * the slow start.
 */
export function travel(fall: number) {
  const s = clamp01(fall)
  return s * s
}

/**
 * Everything the scene needs at pinned scroll progress `p` (0..1).
 * `arrive` (0..1) is how far the scene has faded up while scrolling in: it
 * starts a little further back and eases forward as it appears.
 */
export function timeline(p: number, arrive = 1): Frame {
  const fall = clamp01((p - IDLE_END) / (FALL_END - IDLE_END))
  const e = travel(fall)
  const settle = 1 - smoothstep(0, 1, arrive)
  const dist = Math.exp(mix(Math.log(DIST_FAR), Math.log(DIST_NEAR), e)) * (1 + 0.22 * settle)
  // Black arrives a little before the camera stops, and is exact from BLACK_AT on
  const blackout = smoothstep(FALL_END - 0.085, BLACK_AT, p)
  return {
    fall,
    travel: e,
    dist,
    elev: rad(mix(22, 54, smoothstep(0.12, 1, fall))),
    azim: rad(mix(0, 38, e * e)),
    roll: rad(mix(37, 4, smoothstep(0.1, 1, fall))),
    aim: smoothstep(0.05, 0.72, fall),
    fovScale: mix(1, 1.9, smoothstep(0.3, 1, fall) ** 1.5),
    shake: rad(0.5) * smoothstep(0.35, 0.95, fall) ** 2,
    // The inner disk is far hotter than the rim, so the exposure closes down on the way in
    exposure: mix(1, 0.5, smoothstep(0.25, 0.85, fall)),
    smear: smoothstep(0.55, 1, fall) ** 1.4,
    iris: smoothstep(0.84, 1, fall),
    blackout,
    cue: (1 - smoothstep(0.004, 0.035, p)) * smoothstep(0.9, 1, arrive),
  }
}

export type Composition = {
  /** Where the hole sits at idle, in NDC (x right, y up, -1..1). */
  hole: [number, number]
  /** tan(vertical field of view / 2) at idle. */
  tanHalfFov: number
}

/**
 * Idle framing for a viewport of the given aspect (width / height). The
 * reference image is 9:16 with the hole right of centre and above the middle;
 * wide viewports keep that offset and let more of the disk in at the sides.
 */
export function composition(aspect: number): Composition {
  // 0 for portrait phones, 1 for wide desktops
  const wide = smoothstep(0.7, 1.6, aspect)
  // Shadow radius as a fraction of the viewport height
  const shadow = mix(0.056, 0.08, wide)
  const angular = Math.asin(Math.min(0.99, (SHADOW_B / DIST_FAR) * Math.sqrt(1 - 1 / DIST_FAR)))
  return {
    hole: [mix(0.074, 0.17, wide), mix(0.175, 0.12, wide)],
    tanHalfFov: Math.tan(angular) / (2 * shadow),
  }
}

// ------------------------------------------------------------ scroll ----

export type ScrollPosition = {
  /**
   * 0..1 through the run-in, the empty stretch of page where the background
   * fades to black: 0 until its top edge is halfway up the viewport, 1 when
   * its bottom edge is about to scroll into view.
   */
  fade: number
  /** 0 when the top of the stage is LEAD viewports below the top of the viewport, 1 when it reaches the top. */
  enter: number
  /** 0..1 through the pinned stretch. */
  pin: number
  /** 0 until the bottom of the section reaches the bottom of the viewport, 1 when it leaves through the top. */
  exit: number
}

/**
 * Where the sequence sits in a viewport: `top` and `height` are the pinned
 * section's, `fadeTop` and `fadeHeight` the run-in's (which comes earlier on
 * the page, with other content allowed between the two).
 */
export function scrollPosition(top: number, height: number, viewport: number, fadeTop: number, fadeHeight: number): ScrollPosition {
  const span = Math.max(1, height - viewport)
  return {
    fade: clamp01((0.5 * viewport - fadeTop) / Math.max(1, fadeHeight - 0.45 * viewport)),
    enter: clamp01((LEAD * viewport - top) / (LEAD * viewport)),
    pin: clamp01(-top / span),
    exit: clamp01((viewport - (top + height)) / viewport),
  }
}

export type Published = {
  /** 0..1 through the pinned sequence. */
  progress: number
  /** 0 site palette .. 1 the black hole's palette. */
  theme: number
  /** 0 .. 1 as the UI fades to black with the scene. */
  dim: number
  /** 0 .. 1 as the scene fades up while it scrolls in. */
  arrive: number
  /** Opacity of the caption and button over the idle scene: up once it has settled, gone as the fall begins. */
  intro: number
  /** Opacity of the plain black cover used by the still-image and reduced-motion versions. */
  fade: number
  /** Opacity of the "scroll to enter" cue. */
  cue: number
}

/**
 * The page-level values for a scroll position. With `release`, theme and dim
 * let go again as the section scrolls away; without it they are held.
 */
export function derive(pos: ScrollPosition, release: boolean): Published {
  const hold = release ? 1 - smoothstep(0, 0.85, pos.exit) : 1
  // The scene comes up out of the dark as the stage scrolls into view, and finishes just after it pins
  const arrive = 0.82 * smoothstep(1 - ARRIVE_FROM / LEAD, 1, pos.enter) + 0.18 * smoothstep(0, 0.02, pos.pin)
  return {
    progress: pos.pin,
    // The page fades to black over the run-in, and stays black through everything after it
    theme: smoothstep(0, 1, pos.fade) * hold,
    // The UI goes down with the scene and is gone just before the screen is black
    dim: smoothstep(0.42, BLACK_AT - 0.03, pos.pin) * hold,
    arrive,
    // Up as the scene settles, held through the idle, and gone a little way into the fall
    intro: smoothstep(0.84, 1, arrive) * (1 - smoothstep(IDLE_END * 0.9, IDLE_END * 1.5, pos.pin)),
    fade: smoothstep(IDLE_END + 0.05, BLACK_AT, pos.pin),
    cue: timeline(pos.pin, arrive).cue,
  }
}

/** `entered` flips on at ENTER_AT and only flips back below EXIT_AT, so it can't chatter at the edge. */
export function nextEntered(entered: boolean, progress: number) {
  return entered ? progress > EXIT_AT : progress >= ENTER_AT
}
