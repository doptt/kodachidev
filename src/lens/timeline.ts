/**
 * Scroll → what the lensed sky is doing. Pure functions, no DOM, no GL and no
 * imports, so the pacing can be tested on its own.
 *
 * The scene is what comes after the fall: the camera hovers just above the
 * black hole, whose shadow fills the bottom of the view like a horizon. The
 * projects are lights in the sky behind it. Each one starts behind the hole,
 * where the lens smears it into a ring of light along the horizon; scrolling
 * swings the sky round, the ring lifts off the horizon and unrolls into the
 * picture, and it holds there while its details are up. The next one is by
 * then already a ring on the horizon. After the last, the camera drops the
 * rest of the way and the sky closes to a point overhead.
 *
 * Angles are in radians. Positions on the sky are measured from the zenith
 * (straight away from the hole) round toward straight ahead and on down
 * behind the hole: a quarter turn is the level horizon ahead, a half turn is
 * directly behind the hole.
 */

/** Length of each part of the pinned stretch, in viewport heights of scroll. */
export const INTRO = 0.8
export const PER_PROJECT = 1.3
export const OUTRO = 1.15
/** Share of a project's stretch spent holding still on it before the sky moves on. */
export const HOLD = 0.46

/** Where the camera hovers while the projects are shown, and where it ends up (the horizon is at 1). */
export const R_HOVER = 1.78
export const R_END = 1.0015

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const smootherstep = (x: number) => {
  const t = clamp01(x)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
const rad = (deg: number) => (deg * Math.PI) / 180

/** Scroll length of the pinned stretch for `count` projects, in viewport heights. */
export function span(count: number) {
  return INTRO + count * PER_PROJECT + OUTRO
}

/** Pinned progress (0..1) at which project `index` has just settled. */
export function settledAt(index: number, count: number) {
  return (INTRO + index * PER_PROJECT) / span(count)
}

export type LensFrame = {
  /**
   * Which project is settled in the sky, as a running number: 2 means the
   * third is up, 2.5 that the sky is halfway from the third to the fourth.
   * Starts below zero, while the first is still on its way up.
   */
  phase: number
  /** 0 → 1 over the last stretch, as the camera drops to the horizon. */
  fall: number
  /** Camera radius (the horizon is at 1). */
  radius: number
  /** Camera pitch above level, radians. */
  pitch: number
  /** Overall brightness, 0 at both ends of the stretch (the screen is black there). */
  fade: number
  /** Brightness of the stars alone: they arrive first and leave last. */
  stars: number
  /**
   * Extra light on the edge of the shadow. It flares once as the scene opens:
   * out of the black at the end of the fall, the first thing to appear is the
   * ring, blooming across the screen, and the sky comes up behind it. It
   * rises again as the sky closes at the end.
   */
  rim: number
  /**
   * 0 → 1 during the fall: how far the settled picture has been carried from
   * where it is read to the zenith, so that it is what the closing sky closes on.
   */
  lift: number
  /** 0 → 1 during the fall: how far the eased lens has been let go toward the real one. */
  squeeze: number
}

/** Everything the scene needs at pinned scroll progress `p` (0..1), for `count` projects. */
export function lensTimeline(p: number, count: number): LensFrame {
  const total = span(count)
  const x = clamp01(p) * total
  const last = Math.max(0, count - 1)

  let phase: number
  if (x < INTRO) {
    // The first project rises from behind the hole
    phase = -1 + smootherstep(x / INTRO)
  } else {
    const y = (x - INTRO) / PER_PROJECT
    const k = Math.min(last, Math.floor(y))
    const within = y - k
    // The last one has nowhere to move on to: it holds until the fall takes it
    phase = k < last ? k + smootherstep((within - HOLD) / (1 - HOLD)) : last
  }

  const fall = clamp01((x - (total - OUTRO)) / OUTRO)
  // Slow to start, so the last picture stands a moment longer; then the horizon comes up fast
  const drop = fall * fall * (3 - 2 * fall)
  const radius = Math.exp(mix(Math.log(R_HOVER - 1), Math.log(R_END - 1), drop ** 1.6)) + 1

  return {
    phase,
    fall,
    radius,
    // The camera tips back to keep the closing sky in view
    pitch: rad(mix(0, 90, smoothstep(0.16, 0.86, fall))),
    fade: smoothstep(0.1, 0.62, x / INTRO) * (1 - smoothstep(0.86, 0.985, fall)),
    stars: smoothstep(0.0, 0.3, x / INTRO) * (1 - smoothstep(0.9, 0.99, fall)),
    rim: Math.max(smoothstep(0.25, 0.8, fall), 1.6 * smoothstep(0.0, 0.2, x / INTRO) * (1 - smoothstep(0.26, 0.8, x / INTRO))),
    lift: smoothstep(0.08, 0.7, fall),
    squeeze: smoothstep(0.3, 0.9, fall),
  }
}

/** How far the sky turns from one project to the next. */
export const THETA_STEP = rad(92)

export type Source = {
  /** Index of the project. */
  index: number
  /** Position on the sky, radians from the zenith round toward straight ahead and beyond. */
  theta: number
  /** Brightness, 0..1. */
  gain: number
}

/** The most that are ever alight at once. */
export const MAX_SOURCES = 4

/**
 * The projects that are alight at `phase`, and where; `thetaRead` is where one
 * sits when it is settled and readable, and `lift` carries that one to the
 * zenith (the last fall). One is up in the sky,
 * the one after it is the ring on the horizon, and the one after that is a
 * thin line under the ring. The rest are dark: the sky only has room for a
 * few, and a full turn would bring an old one round again.
 */
export function sources(phase: number, count: number, thetaRead: number, lift = 0): Source[] {
  const out: Source[] = []
  for (let i = 0; i < count; i++) {
    const ahead = i - phase
    // Gone once it has passed overhead, and not yet lit while it is still far round the back
    const gain = smoothstep(-1.25, -0.9, ahead) * (1 - smoothstep(1.7, 2.3, ahead))
    if (gain <= 0) continue
    out.push({ index: i, theta: thetaRead * (1 - lift) + THETA_STEP * ahead, gain })
  }
  // Nearest to settled first, so that if there are too many the faint ones are dropped
  out.sort((a, b) => Math.abs(a.theta - thetaRead) - Math.abs(b.theta - thetaRead))
  return out.slice(0, MAX_SOURCES)
}

export type Caption = {
  /** The project whose details are showing, or -1 for none. */
  index: number
  /** True while those details should be up. */
  shown: boolean
}

/** Which project's details are up at `phase`: only while its picture is close to settled. */
export function caption(frame: LensFrame, count: number): Caption {
  const index = Math.min(count - 1, Math.max(0, Math.round(frame.phase)))
  const settled = Math.abs(frame.phase - index) < 0.2
  return { index, shown: count > 0 && settled && frame.fall < 0.12 && frame.fade > 0.6 }
}

export type Composition = {
  /** tan(vertical field of view / 2). */
  tanHalfFov: number
  /** Resting camera pitch above level, radians. Chosen to put the horizon where the layout wants it. */
  pitch: number
  /** Height of the top of the shadow on screen, in NDC (-1 bottom .. 1 top). */
  horizon: number
  /** Where the middle of a settled picture is seen, radians above level. */
  centre: number
  /** Half-size of a project's picture on the sky, as tangents: [across, up]. */
  half: [number, number]
  /** How far above the edge of the shadow the lens is felt, radians (see LENS_FLOOR in geodesic.ts). */
  reach: number
}

/**
 * Framing for a viewport of the given aspect (width / height) with the camera
 * at `edge`, the angle from straight down to the edge of the shadow.
 *
 * The horizon sits under the middle of the screen: the sky above it holds the
 * picture, the shadow below it holds the words. Wide screens get a picture
 * about half the screen high; tall ones are limited by their width.
 */
export function composition(aspect: number, edge: number): Composition {
  // 0 for portrait phones, 1 for wide desktops
  const wide = smoothstep(0.7, 1.5, aspect)
  const tanHalfFov = mix(0.78, 0.6, wide)
  const horizon = mix(-0.13, -0.34, wide)
  // The top of the shadow is `edge - PI/2` above level; pitch the camera so it lands on `horizon`
  const pitch = edge - Math.PI / 2 - Math.atan(horizon * tanHalfFov)
  // Picture height as a share of the screen height, and never wider than the screen allows
  const high = Math.min(mix(0.3, 0.44, wide), (0.88 * aspect) / 1.6)
  // The picture stands clear of the horizon by this much of the screen, and of the navigation above it
  const gap = mix(0.16, 0.18, wide)
  const up = high * tanHalfFov
  return {
    tanHalfFov,
    pitch,
    horizon,
    centre: pitch + Math.atan((horizon + gap + high) * tanHalfFov),
    half: [up * 1.6, up],
    reach: Math.atan(gap * tanHalfFov) * 1.15,
  }
}
