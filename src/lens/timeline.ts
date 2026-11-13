/**
 * Scroll → what the lensed sky is doing. Pure functions, no DOM, no GL and no
 * imports, so the pacing can be tested on its own.
 *
 * The scene is what comes after the fall: the camera hovers above the black
 * hole, whose shadow is the dark dome at the bottom of the view. The projects
 * are pictures painted on the sky behind it, and the lens is the real one.
 * Each project starts behind the hole, where the lens makes a ring of it, some
 * way above the shadow; scrolling swings the sky round, the ring breaks, its
 * upper part swells into an arc and unrolls into the picture, which comes to
 * rest flat (see picture.ts for why it is flat) and holds there while its
 * details are up. The next one is by then already the ring. After the last,
 * the camera drops the rest of the way and the sky closes to a point overhead.
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

/**
 * The camera's height (the horizon is at 1). The scene opens low, at R_OPEN,
 * where the shadow is nearly half the sky and its edge a nearly flat horizon:
 * that is the view the fall into the black hole ends on. It climbs to R_HOVER
 * as the sky comes up, and rests there while the projects are shown, with the
 * shadow's limb visibly round. At the end it drops to R_END.
 */
export const R_OPEN = 1.78
export const R_HOVER = 2.5
export const R_END = 1.0015
/** Share of the intro by which the camera has finished climbing. */
const CLIMB = 0.85

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
}

/**
 * Everything the scene needs at pinned scroll progress `p` (0..1), for `count`
 * projects. `rest` is the height the camera rests at (the harness tries others).
 */
export function lensTimeline(p: number, count: number, rest = R_HOVER): LensFrame {
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
  // Heights are eased along their logarithm above the horizon, which is how the view changes evenly
  const climbed = mix(Math.log(R_OPEN - 1), Math.log(rest - 1), smootherstep(x / (CLIMB * INTRO)))
  const radius = Math.exp(mix(climbed, Math.log(R_END - 1), drop ** 1.6)) + 1

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
  }
}

export type Source = {
  /** Index of the project. */
  index: number
  /** Position on the sky, radians from the zenith round toward straight ahead and beyond. */
  theta: number
  /** Brightness, 0..1. */
  gain: number
  /** How brightly its picture is lit, 0..1: full when it is the one being read, less while it waits. */
  light: number
}

/**
 * How brightly a project is lit while it waits behind the hole. The lens makes
 * a wide band of it there, and a band of full brightness outshines the picture
 * that is being read. It comes up to full as it unrolls.
 */
const WAITING = 0.45

/** The most that are ever alight at once. */
export const MAX_SOURCES = 4

/**
 * The projects that are alight at `phase`, and where; `thetaRead` is where one
 * sits when it is settled and readable, `step` how far the sky turns from one
 * to the next (both come from the framing, see `rest` in picture.ts), and
 * `lift` carries the settled one to the zenith (the last fall). One is up in
 * the sky, the one after it is the ring, and the one after that is a thin
 * sliver under the ring. The rest are dark: the sky only has room for a few,
 * and a full turn would bring an old one round again.
 */
export function sources(phase: number, count: number, thetaRead: number, step: number, lift = 0): Source[] {
  const out: Source[] = []
  for (let i = 0; i < count; i++) {
    const ahead = i - phase
    // Dark by the time the next one has settled, and not yet lit while it is still far round the back
    const gain = smoothstep(-1, -0.55, ahead) * (1 - smoothstep(1.7, 2.3, ahead))
    if (gain <= 0) continue
    const light = mix(1, WAITING, smoothstep(0.2, 0.85, ahead))
    out.push({ index: i, theta: thetaRead * (1 - lift) + step * ahead, gain, light })
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

/** What the harness may change about the framing. */
export type Tune = {
  /** Gap between the Einstein ring and the bottom edge of the picture, radians. */
  gap?: number
  /** Height of the picture as a share of the height of the screen. */
  high?: number
  /** Top edge of the picture on screen, in NDC. */
  top?: number
  /** How far right of the middle of the screen the scene stands, in NDC. */
  shift?: number
  /**
   * The highest the top edge of the picture may be, in NDC. The page works it
   * out from the navigation, which is so many pixels deep whatever the height
   * of the screen: a share of the height cannot be relied on to clear it.
   */
  ceiling?: number
  /**
   * The least of the screen's height the shadow must fill on the middle line,
   * 0..1. Where the words go in the shadow the page asks for as much as they
   * are tall; they are so many pixels whatever the height of the screen.
   */
  shadow?: number
}

export type Framing = {
  /** tan(vertical field of view / 2). */
  tanHalfFov: number
  /** Resting camera pitch above level, radians. Below zero: the camera looks down past the limb. */
  pitch: number
  /** Height of the top of the shadow on the middle line of the screen, in NDC (-1 bottom .. 1 top). */
  horizon: number
  /** Height at which the Einstein ring crosses the middle line of the screen, in NDC. */
  ring: number
  /** Middle of a settled picture, as a tangent above the axis of the camera. */
  centreY: number
  /** Half-size of a settled picture on the plane of the screen, as tangents: [across, up]. */
  half: [number, number]
  /**
   * How far right of the middle of the screen the hole and the picture stand,
   * in NDC (0 is the middle, 1 the right edge). The view is slid sideways, as
   * a view camera's lens is: nothing in it is turned or bent.
   */
  shift: number
}

/**
 * Framing for a viewport of the given aspect (width / height), with the lens
 * as it really is. `edge` and `ring` are the angles from straight down to the
 * edge of the shadow and to the Einstein ring, at the height the camera rests.
 *
 * From the bottom of the screen up: the shadow, with the words in it; the
 * band between the shadow and the ring, where the sky is seen a second time,
 * mirrored and squeezed; the ring; a small gap; the picture. The picture has
 * to stand wholly above the ring, because below it no painting can come out
 * flat. So the screen is laid out from the top down: the picture is given its
 * size and its place under the navigation, and the camera is pitched to put
 * the ring just under it. Where the limb of the shadow then falls is whatever
 * is left, which is less than the old framing gave it: too little, on a wide
 * screen, for the words. So there the whole scene stands right of centre and
 * the words go beside the picture, on the left. A phone has no room beside the
 * picture and plenty below it: the scene stays in the middle and the words go
 * in the shadow.
 */
export function framing(aspect: number, edge: number, ring: number, tune: Tune = {}): Framing {
  const { tanHalfFov, high, top, shift, gap } = layout(aspect, tune, ring - edge)
  const bottom = top - 2 * high
  const pitch = ring + gap - Math.PI / 2 - Math.atan(bottom * tanHalfFov)
  const seen = (psi: number) => Math.tan(psi - Math.PI / 2 - pitch) / tanHalfFov
  const up = high * tanHalfFov
  return { tanHalfFov, pitch, horizon: seen(edge), ring: seen(ring), centreY: (top - high) * tanHalfFov, half: [up * 1.6, up], shift }
}

/**
 * Screens at least this wide for their height have the words beside the
 * picture and the scene right of centre. Narrower ones have the scene in the
 * middle and the words under it. It is one or the other: a scene a little off
 * centre with the words underneath would look like a mistake.
 */
export const SIDE_BY_SIDE = 1.15

/**
 * How far the Einstein ring stands clear of the edge of the shadow at R_HOVER,
 * radians. The page lays the words out with it, without working out the lens
 * (a test checks it against the lens).
 */
export const RING_CLEAR = 0.2845

/**
 * The smallest a picture is ever made, as a share of the screen's height. The
 * work is what the section is for: past this the page has to make do with
 * less shadow, and shortens the words instead.
 */
const HIGH_MIN = 0.2

/**
 * How big a settled picture is and where on the screen it goes. `clear` is how
 * far the ring stands above the edge of the shadow, which is all of the lens
 * this needs.
 */
function layout(aspect: number, tune: Tune, clear: number) {
  // 0 for portrait phones, 1 for wide desktops
  const wide = smoothstep(0.7, 1.5, aspect)
  const tanHalfFov = mix(0.78, 0.6, wide)
  const gap = tune.gap ?? rad(4)
  // Picture height as a share of the screen height, and never wider than the screen allows
  let high = tune.high ?? Math.min(mix(0.3, 0.44, wide), (0.88 * aspect) / 1.6)
  // Under the navigation, which is taller on a phone for its size
  let top = tune.top ?? Math.min(mix(0.68, 0.8, wide), tune.ceiling ?? 1)
  if (tune.shadow !== undefined && tune.top === undefined && tune.high === undefined) {
    // The limb is as far under the bottom of the picture as the ring's clearance and the gap put
    // it. So a shadow of a given depth means the bottom of the picture may come no lower than this.
    const floor = Math.tan(Math.atan((2 * tune.shadow - 1) * tanHalfFov) + clear + gap) / tanHalfFov
    if (top - 2 * high < floor) {
      // First move the picture up, as far as the navigation lets it; then make it smaller
      top = Math.min(Math.max(top, floor + 2 * high), tune.ceiling ?? top)
      high = Math.min(high, Math.max(HIGH_MIN, (top - floor) / 2))
    }
  }
  // As far right as leaves the picture a margin, and no further than looks deliberate
  const shift = tune.shift ?? (aspect >= SIDE_BY_SIDE ? Math.max(0, Math.min(0.3, 1 - 2 * 0.07 - (1.6 * high) / aspect)) : 0)
  return { tanHalfFov, high, top, shift, gap }
}

/**
 * Where a settled picture is on the screen, in NDC (-1..1, y up), given the
 * same `tune` the scene is given, and how much of the screen's height the
 * shadow fills on the middle line (0..1). The page lays the words out with these.
 */
export function pictureBox(aspect: number, tune: Tune = {}) {
  const { tanHalfFov, high, top, shift, gap } = layout(aspect, tune, RING_CLEAR)
  const across = (1.6 * high) / aspect
  const bottom = top - 2 * high
  const limb = Math.tan(Math.atan(bottom * tanHalfFov) - RING_CLEAR - gap) / tanHalfFov
  return { left: shift - across, right: shift + across, top, bottom, shadow: (1 + limb) / 2 }
}
