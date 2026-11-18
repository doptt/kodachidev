/**
 * Scroll → what the lensed sky is doing. Pure functions, no DOM, no GL and no
 * imports, so the pacing can be tested on its own.
 *
 * The scene is what comes after the fall: the camera hovers just above the
 * black hole, whose shadow fills the bottom of the view like a horizon. The
 * projects are lights in the sky behind it. Each one starts dark behind the
 * hole. When the page has been scrolled far enough the sky sets off: the
 * settled picture is carried up and out over the top, and the next comes up
 * over the horizon, first a bright sliver pressed flat against it by the lens,
 * then unrolling into the picture, where it holds while its details are up.
 * After the last, the camera drops toward the hole and the shadow closes up
 * round the sky; then the view lets the sky go and sinks into the dark, the
 * horizon rising out over the top of the screen, and the stars of the page
 * that follows come up in the black.
 *
 * Scroll only says which project is wanted. The move from one to the next is
 * played out in time (see `glide`), so it is the same unhurried move however
 * the page was scrolled, and it never stops half way.
 *
 * Angles are in radians. Positions on the sky are measured from the zenith
 * (straight away from the hole) round toward straight ahead and on down
 * behind the hole: a quarter turn is the level horizon ahead, a half turn is
 * directly behind the hole.
 */

/** Length of each part of the pinned stretch, in viewport heights of scroll. */
export const INTRO = 0.8
export const PER_PROJECT = 1.0
export const OUTRO = 1.15
/** How far into a project's stretch the sky sets off for the next one, as a share of the stretch. */
export const HOLD = 0.6

/**
 * Where the camera hovers while the projects are shown, and where its drop is
 * headed (the horizon is at 1). It does not get there: the view lets go of the
 * sky part way down (`SINK_FROM`), and the drop coasts to a stop soon after.
 */
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

/**
 * A finger's scroll, as opposed to a wheel's. A wheel turns in small notches,
 * and the stretches above are sized for that; a flick of a finger throws the
 * page several screens, which ran straight through two or three projects. So
 * under a finger the stage is paged: one swipe, however hard, is one project.
 *
 * It works because the stage is pinned and the move between projects is played
 * in time: nothing on screen says where the page really is. While a swipe and
 * its momentum last, the scene is told the page is at rest on a project (its
 * `homeAt`), one on from where the swipe began once the page has moved
 * `SWIPE_STEP`; when the page has come to rest it is quietly put there. The
 * way in (the first picture rising) and the way out (the fall) still follow
 * the finger, as they follow the wheel.
 *
 * All in screens of pinned scroll, like the stretches above.
 */

/** Where the page rests while project `index` is up: just inside its stretch. */
export function homeAt(index: number) {
  return INTRO + (index + 0.08) * PER_PROJECT
}

/** How far a swipe has to carry the page before the sky sets off for the next project. */
export const SWIPE_STEP = 0.16
/** This close to either end of the stretch the page is on its way out of it, and is followed as it is. */
const SWIPE_FREE = [0.2, 0.3] as const

/** What a swipe began on: -1 the way in, `count` the way out, otherwise the project that was up. */
export function swipeBase(x: number, count: number) {
  if (x < INTRO) return -1
  if (x >= INTRO + count * PER_PROJECT) return count
  return Math.round(lensTimeline(x / span(count), count).phase)
}

/**
 * Where the scene is told the page is, for a swipe that began on `base` with
 * the page at `from` and has carried it to `x`.
 */
export function swipeTarget(base: number, from: number, x: number, count: number) {
  const last = count - 1
  if (x < SWIPE_FREE[0] || x > span(count) - SWIPE_FREE[1]) return x
  // Coming in: the first picture rises with the finger, and stops when it is up
  if (base < 0) return Math.min(x, homeAt(0))
  // Going out, or coming back up out of the fall: the last picture is as far back as this swipe goes
  if (base > last) return Math.max(x, homeAt(last))
  const moved = x - from
  if (moved > SWIPE_STEP) return base < last ? homeAt(base + 1) : Math.max(x, homeAt(last))
  // On from the last project is the fall, which follows the finger from the start
  if (base === last && moved > 0) return Math.max(x, homeAt(last))
  if (moved < -SWIPE_STEP) return base > 0 ? homeAt(base - 1) : Math.min(x, homeAt(0))
  return homeAt(base)
}

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
   * Starts below zero, while the first is still on its way up. From
   * `lensTimeline` this is where the sky is headed: it steps from one project
   * to the next. What is drawn is that number followed through `glide`.
   */
  phase: number
  /** 0 → 1 over the last stretch: the camera drops toward the horizon, then sinks into the dark under it. */
  fall: number
  /** Camera radius (the horizon is at 1). */
  radius: number
  /**
   * How far the camera has tipped back from where it rests, radians: a quarter
   * turn is straight up. Below zero it has tipped forward, down into the hole.
   */
  pitch: number
  /** Overall brightness, 0 at both ends of the stretch (the screen is black there). */
  fade: number
  /** Brightness of the stars alone: they arrive first and leave last. */
  stars: number
  /**
   * Extra light on the edge of the shadow. It flares as the scene opens: out
   * of the black at the end of the fall, the first thing to appear is the
   * ring, blooming across the screen, and the sky comes up behind it. The
   * flare settles to `RIM_SETTLED`, the glow every project is read by, and
   * rises again as the sky closes at the end. What is drawn is this times
   * `horizonGlow` of the drawn phase, which dims it while the sky is moving.
   */
  rim: number
  /**
   * 0 → 1 during the fall: how far the settled picture has been carried from
   * where it is read toward the zenith. It goes up and out over the top of the
   * screen before the view lets go of the sky.
   */
  lift: number
  /**
   * 0 → 1 during the fall: how far the stars have turned the same way, as a
   * share of the same angle. They follow the picture up at the pace the sky
   * has always turned at in the fall; the picture goes on ahead of them.
   */
  roll: number
  /** 0 → 1 during the fall: how far the eased lens has been let go toward the real one. */
  squeeze: number
  /**
   * 0 → 1 at the end of the fall, once the sky has gone out over the top: the
   * stars of the page that follows, coming up in the black it leaves. They are
   * not drawn by the scene; the section lays them over it.
   */
  beyond: number
}

/**
 * How far through the fall the view lets go of the sky. Up to here the camera
 * drops toward the horizon and tips back, and the shadow closes round the sky.
 * From here it stops following it: the drop and the tipping back coast to a
 * stop, and the camera tips forward and down into the hole, so the horizon and
 * the sky above it rise out through the top of the screen and leave it black.
 */
export const SINK_FROM = 0.46
/** How much further through the fall the sky's own course gets before it has coasted to a stop. */
export const SINK_COAST = 0.05
/** By when the camera has finished tipping forward, as `fall`, and how far it tips, in degrees. */
export const SINK_TO = 0.92
export const SINK_DIVE = 56
/** The fall by which the last picture would have been carried all the way to the zenith; it has left the screen well before. */
export const LIFT_BY = 0.56
/** The stretch of the fall over which the next page's stars come up in the black. */
export const BEYOND_FROM = 0.64
export const BEYOND_TO = 0.98

/**
 * The fall as the sky follows it: the fall itself up to `SINK_FROM`, then
 * slowing to a stop `SINK_COAST` further on. The join is smooth in position,
 * speed and acceleration, so nothing on screen changes pace there.
 */
export function closing(fall: number) {
  return fall <= SINK_FROM ? fall : SINK_FROM + SINK_COAST * Math.tanh((fall - SINK_FROM) / SINK_COAST)
}

/**
 * The camera's pitch above level, radians, for a frame's `pitch`: that is
 * measured from where the camera rests (`composition().pitch`, a little below
 * level) as a share of the way from there to straight up.
 */
export function cameraPitch(tipped: number, rest: number) {
  return rest + (Math.PI / 2 - rest) * (tipped / (Math.PI / 2))
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
    // Past the hold the sky is headed for the next one, all the way: `glide` makes a move of the step.
    // The last one has nowhere to move on to: it holds until the fall takes it.
    phase = k < last && within >= HOLD ? k + 1 : k
  }

  const fall = clamp01((x - (total - OUTRO)) / OUTRO)
  // What the sky is doing follows the fall up to the moment the view lets go of it, then coasts to a stop
  const course = closing(fall)
  // Slow to start, so the last picture stands a moment longer; then the horizon comes up fast
  const drop = course * course * (3 - 2 * course)
  const radius = Math.exp(mix(Math.log(R_HOVER - 1), Math.log(R_END - 1), drop ** 1.6)) + 1

  return {
    phase,
    fall,
    radius,
    // The camera tips back with the closing sky, and then lets it go: forward and down, into the dark
    pitch: rad(mix(0, 90, smoothstep(0.16, 0.86, course)) - SINK_DIVE * smootherstep((fall - SINK_FROM) / (SINK_TO - SINK_FROM))),
    // By the time the view lets go there is no picture left for this to dim, only the horizon's light,
    // which eases down as it is left behind overhead (the stars hold it at six tenths until they go too)
    fade: smoothstep(0.1, 0.62, x / INTRO) * (1 - smoothstep(SINK_FROM, 0.9, fall)),
    // The sky has gone out over the top well before these go; after them the scene draws plain black
    stars: smoothstep(0.0, 0.3, x / INTRO) * (1 - smoothstep(0.9, 0.99, fall)),
    // The opening flare does not go out: it eases down to the glow a settled project is read by, over the
    // stretch in which the scene's own light (`fade`) comes up, so the horizon holds its strength and then settles
    rim: Math.max(smoothstep(0.25, 0.8, fall), smoothstep(0.0, 0.2, x / INTRO) * mix(RIM_FLARE, RIM_SETTLED, smoothstep(0.33, 0.62, x / INTRO))),
    // Up and out over the top by the time the view lets go: nothing is left in the sky then but stars
    lift: smoothstep(0.08, LIFT_BY, course),
    roll: smoothstep(0.08, 0.7, course),
    squeeze: smoothstep(0.3, 0.9, course),
    beyond: smoothstep(BEYOND_FROM, BEYOND_TO, fall),
  }
}

/** How quickly the drawn sky follows where it is headed, per second: a move takes about a second. */
export const GLIDE_RATE = 5.6

export type Glide = {
  /** The phase as drawn. */
  value: number
  /** How fast it is changing, per second. */
  velocity: number
}

/**
 * One step of the sky following where it is headed: a critically damped
 * spring, so a move starts gently, never overshoots and eases to a stop, and
 * a change of mind half way is taken up without a jolt. Exact for any `dt`.
 */
export function glide(state: Glide, target: number, dt: number, rate = GLIDE_RATE): Glide {
  const off = state.value - target
  const pull = state.velocity + rate * off
  const decay = Math.exp(-rate * dt)
  return { value: target + (off + pull * dt) * decay, velocity: (state.velocity - pull * rate * dt) * decay }
}

/**
 * `rim` at the height of the opening flare, and while a project is settled.
 * The flare is drawn while the scene is still coming up out of the black, at
 * about six tenths of its light, so on screen the settled glow is some four
 * fifths as strong as the flare at its height: as much as the words in the
 * shadow under the horizon can sit in for a whole project.
 */
export const RIM_FLARE = 1.6
export const RIM_SETTLED = 0.6
/** How far from settled, in projects, the horizon's glow has gone out altogether. */
export const GLOW_GONE = 0.42

/**
 * How much of the horizon's glow shows at the drawn `phase`, 0..1: all of it
 * while a project is settled, none in the middle of the move to the next, and
 * back as the next one arrives. It is level where it meets a settled project
 * and across the middle of a move, so the glow never jumps, whichever way the
 * sky is turning and wherever a move is turned back. Up to the first project
 * it is all there: the opening flare (`rim`) settles straight into the glow.
 */
export function horizonGlow(phase: number): number {
  if (phase <= 0) return 1
  return 1 - smoothstep(0, GLOW_GONE, Math.abs(phase - Math.round(phase)))
}

/** How far the sky turns from one project to the next. */
export const THETA_STEP = rad(92)

/** How far ahead of settled a project begins to be lit, in projects: 1 is the one waiting behind the hole. */
export const LIT_FROM = 0.7

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
 * sits when it is settled and readable, and `lift` carries that one toward
 * the zenith (the last fall). One is up in the sky. The one after it is round
 * behind the hole, where the lens would make a ring of it right across the
 * screen; it is kept dark there, and lit as the sky brings it round, so that
 * what comes up over the horizon is a sliver of light that gathers into a
 * picture. The rest are dark.
 */
export function sources(phase: number, count: number, thetaRead: number, lift = 0): Source[] {
  const out: Source[] = []
  for (let i = 0; i < count; i++) {
    const ahead = i - phase
    // Gone once it has passed overhead, and not yet lit while it is still round the back
    const gain = smoothstep(-1.25, -0.9, ahead) * (1 - smoothstep(LIT_FROM - 0.2, LIT_FROM, ahead))
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
 * picture, the shadow below it holds the glow of the horizon and, under that,
 * the words. Wide screens get a picture a little over a third of the screen
 * high, clear of the navigation; tall ones are limited by their width.
 */
export function composition(aspect: number, edge: number): Composition {
  // 0 for portrait phones, 1 for wide desktops
  const wide = smoothstep(0.7, 1.5, aspect)
  const tanHalfFov = mix(0.78, 0.6, wide)
  // Phones held upright: the whole picture stands higher, so the words have the dark under the horizon
  // to themselves, clear of its glow. Gone by the time the screen is as wide as it is tall and a half.
  const tall = 1 - smoothstep(0.5, 0.68, aspect)
  const horizon = mix(-0.13, -0.27, wide) + 0.095 * tall
  // The top of the shadow is `edge - PI/2` above level; pitch the camera so it lands on `horizon`
  const pitch = edge - Math.PI / 2 - Math.atan(horizon * tanHalfFov)
  // Picture height as a share of the screen height, and never wider than the screen allows
  const high = Math.min(mix(0.3, 0.415, wide), (0.88 * aspect) / 1.6)
  // The picture stands clear of the horizon by this much of the screen, and of the navigation above it
  const gap = mix(0.16, 0.1, wide)
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
