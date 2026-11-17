/**
 * The ring of cards round a settled project. Pure functions and one small
 * state holder, no DOM and no GL, so all of it can be tested on its own.
 *
 * A project's picture is the card straight ahead. Its further views are more
 * cards at the same height, spaced round the viewer to the right, on the same
 * sky: a curved wall of panels seen from inside. The visitor turns the ring by
 * dragging across the sky. It follows the pointer angle for angle while held,
 * keeps its speed when let go, and settles on a card through the same kind of
 * critically damped spring as the move between projects (`glide`). It does not
 * go round: past either end it resists, and springs back.
 *
 * A ring's position is a number of cards: 0 is the first picture in the
 * middle, 1 the first further view, 1.5 half way from that to the next.
 * Angles are radians; times are milliseconds on any one clock.
 */
import { glide, smoothstep, type Composition, type Glide, type Source } from './timeline.ts'

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

// ------------------------------------------------------------ where the cards are ----

/** A card beside the middle one is this much of its size. */
export const SIDE_SCALE = 0.9
/** How bright a card is one place from the middle, and two. It is dimmed, not thinned: the sky does not show through it. */
export const SIDE_SHADE = 0.62
export const FAR_SHADE = 0.34
/** The space between two cards, as a share of the middle card's width. */
export const GAP_SHARE = 0.11
/**
 * On a narrow screen the picture nearly fills the width. The space is then
 * this share of what is left beside it, so that the next card still shows at
 * the edge.
 */
export const PEEK_SHARE = 0.4
/** How far past the edge of the screen, in half-widths of it, a card beside the middle one would have faded right out. */
export const FADE_PAST = 1.14

export type RingLayout = {
  /** The angle round the viewer from one card to the next. */
  step: number
  /** A card turned further from straight ahead than this cannot be seen. */
  reach: number
  /** Where across the screen the cards beside the middle one begin to fade, and where they would be gone: |x|, 0 the middle, 1 the edge. */
  fade: [number, number]
}

/** How the ring is laid out for a screen framed by `comp`, `aspect` wide for its height. */
export function ringLayout(comp: Composition, aspect: number): RingLayout {
  const tanX = comp.tanHalfFov * aspect
  // Half the middle card and half a side card, as angles round the viewer, and what is left of the screen beside the middle one
  const wide = Math.atan(comp.half[0])
  const side = Math.atan(comp.half[0] * SIDE_SCALE)
  const room = Math.atan(tanX) - wide
  const gap = Math.min(GAP_SHARE * 2 * wide, Math.max(PEEK_SHARE * room, 0.008))
  return {
    step: wide + side + gap,
    // The corners of the screen see a little further round than its sides
    reach: Math.atan(tanX) * 1.25 + side + 0.1,
    fade: [Math.min(0.94, Math.tan(wide + 0.5 * gap) / tanX), FADE_PAST],
  }
}

export type CardLook = {
  /** Brightness, 0..1. */
  shade: number
  /** How much of it is there at all, 0..1: a card three places from the middle is gone. */
  show: number
  /** Size, as a share of the middle card's. */
  scale: number
  /** How much of the fade toward the sides of the screen it takes: none in the middle, all of it one place away. */
  edge: number
}

/** How a card looks when it is `away` cards from the middle (either way). The middle one is full size and fully bright. */
export function cardLook(away: number): CardLook {
  const a = Math.abs(away)
  const out = smoothstep(0, 1, a)
  const shade = a <= 1 ? mix(1, SIDE_SHADE, out) : mix(SIDE_SHADE, FAR_SHADE, smoothstep(1, 2, a))
  return { shade, show: 1 - smoothstep(2, 3, a), scale: mix(1, SIDE_SCALE, out), edge: out }
}

/** How far from settled, in projects, the cards beside a picture have gone, and how far into the last fall. */
export const SIDES_GONE = 0.16
export const SIDES_FALL = 0.04

/**
 * How much of the cards beside the middle one shows, 0..1, at the drawn
 * `phase`: all of them while a project is settled, none once the sky has
 * begun to move on, back as the next arrives. None during the last fall, and
 * none before the first project is up.
 */
export function sideCards(phase: number, fall: number): number {
  const off = phase <= 0 ? -phase : Math.abs(phase - Math.round(phase))
  return (1 - smoothstep(0.015, SIDES_GONE, off)) * (1 - smoothstep(0, SIDES_FALL, fall))
}

/** How far from settled a project is, in projects, before its ring is put back to its first picture: it is out of sight by then. */
export const RING_KEEP = 0.72

/** The most cards ever drawn at once: the middle one, its neighbours, and a project arriving or leaving. */
export const MAX_CARDS = 6

export type Card = {
  /** Index of the project, and which of its views (0 is its first picture). */
  project: number
  view: number
  /** Position on the sky: radians from the zenith, and radians round the viewer to the right of straight ahead. */
  theta: number
  turn: number
  /** How much of it is there, 0..1: it covers the sky behind it by this much. */
  gain: number
  /** How bright it is, 0..1. */
  shade: number
  /** Size, as a share of the settled picture's. */
  scale: number
  /** How much of the fade toward the sides of the screen it takes, 0..1. */
  edge: number
}

/**
 * The cards to draw: for every lit project (`lit`, from `sources`) the card in
 * the middle of its ring, and for the settled one the cards either side as
 * well. `ring(i)` is where project i's ring is, `count(i)` how many views it
 * has. Nearest the middle first, so that if there are too many the far ones
 * are dropped.
 */
export function cards(
  lit: readonly Source[],
  phase: number,
  fall: number,
  ring: (project: number) => number,
  count: (project: number) => number,
  layout: RingLayout,
): Card[] {
  const settled = Math.max(0, Math.round(phase))
  const sides = sideCards(phase, fall)
  const out: Card[] = []
  for (const s of lit) {
    const n = Math.max(1, count(s.index))
    const at = n > 1 ? ring(s.index) : 0
    const beside = s.index === settled ? sides : 0
    const mine: Card[] = []
    for (let view = 0; view < n; view++) {
      const away = view - at
      const look = cardLook(away)
      // Only the card in the middle belongs to the move between projects; the rest come and go with `sides`
      const gain = s.gain * look.show * mix(beside, 1, 1 - look.edge)
      const turn = away * layout.step
      if (gain < 0.004 || Math.abs(turn) > layout.reach) continue
      mine.push({ project: s.index, view, theta: s.theta, turn, gain, shade: look.shade, scale: look.scale, edge: look.edge })
    }
    mine.sort((a, b) => Math.abs(a.turn) - Math.abs(b.turn))
    out.push(...mine)
  }
  return out.slice(0, MAX_CARDS)
}

// ------------------------------------------------------------ the screen ----

/**
 * How far round to the right of straight ahead the sky under a point of the
 * screen is, radians. `x` and `y` are -1..1 across and up the screen. The lens
 * bends light toward and away from the hole, never round it, so this is the
 * same before the lens and after. The camera's small sway with the pointer is
 * left out.
 */
export function azimuthAt(x: number, y: number, comp: Composition, aspect: number): number {
  return Math.atan2(x * comp.tanHalfFov * aspect, Math.cos(comp.pitch) - y * comp.tanHalfFov * Math.sin(comp.pitch))
}

export type PictureBox = {
  /** The settled picture's top and bottom edge at its middle, up the screen: -1 the bottom, 1 the top. */
  top: number
  bottom: number
  /** Its right-hand edge at its middle, across the screen: 0 the middle, 1 the edge. */
  side: number
}

/**
 * Where the settled picture is on screen. `thetaRead` is where its middle is
 * on the sky, and `see(theta)` the angle from straight down at which that part
 * of the sky is seen through the lens (`viewAngle` in geodesic.ts).
 */
export function pictureBox(comp: Composition, aspect: number, thetaRead: number, see: (theta: number) => number): PictureBox {
  const tall = Math.atan(comp.half[1])
  const up = (theta: number) => Math.tan(see(theta) - Math.PI / 2 - comp.pitch) / comp.tanHalfFov
  // The edge of the picture at its middle height: this far round, and as high as its middle is seen
  const round = Math.atan(comp.half[0] / Math.max(Math.sin(thetaRead), 1e-6))
  const rise = see(thetaRead) - Math.PI / 2
  const ahead = Math.sin(rise) * Math.sin(comp.pitch) + Math.cos(rise) * Math.cos(round) * Math.cos(comp.pitch)
  return {
    top: up(thetaRead - tall),
    bottom: up(thetaRead + tall),
    side: (Math.cos(rise) * Math.sin(round)) / (ahead * comp.tanHalfFov * aspect),
  }
}

// ------------------------------------------------------------ turning it ----

/** How quickly the ring settles on a card, per second (see `glide`): there in about two thirds of a second. */
export const RING_RATE = 7.5
/** The most a hard fling may stiffen that spring, so that it keeps its speed and still lands on the card without passing it. */
export const RING_STIFFEST = 4
/** How quickly the ring follows a wheel or a trackpad, per second. */
export const WHEEL_RATE = 18
/** How far ahead a release looks, seconds: the ring goes to the card nearest where it would be by then at the speed it was let go at. */
export const FLING_REACH = 0.28
/** The fastest a release is taken to be, cards a second. */
export const FLING_MAX = 9
/** How far past an end the ring can be pulled at the very most, in cards. */
export const RUBBER = 0.35
/** A pointer that has not moved for this long before it lifts has stopped: no fling. Milliseconds. */
export const FLICK_STALE = 80
/** The stretch of the drag a fling's speed is read from, milliseconds. */
export const FLICK_WINDOW = 100

/**
 * Where a ring of `count` cards shows itself when it has been pulled to `raw`:
 * the same place between its ends, and past either end less and less the
 * further it is pulled, never more than `RUBBER`. It leaves the end at the
 * pointer's own pace, so there is no catch as the end is crossed.
 */
export function rubber(raw: number, count: number): number {
  const last = Math.max(0, count - 1)
  if (raw < 0) return -(RUBBER * -raw) / (RUBBER - raw)
  if (raw > last) return last + (RUBBER * (raw - last)) / (RUBBER + raw - last)
  return raw
}

/** The inverse of `rubber`: how far a ring showing itself at `value` has been pulled. */
export function unrubber(value: number, count: number): number {
  const last = Math.max(0, count - 1)
  const pull = (over: number) => (RUBBER * Math.min(over, RUBBER * 0.98)) / (RUBBER - Math.min(over, RUBBER * 0.98))
  if (value < 0) return -pull(-value)
  if (value > last) return last + pull(value - last)
  return value
}

export type Trail = readonly { t: number; value: number }[]

/**
 * The speed a drag was let go at, cards a second, from where the ring was at
 * each of its last moves (`trail`, oldest first) and the time of the release.
 * A pointer that stopped before it lifted gives none.
 */
export function flick(trail: Trail, now: number): number {
  const last = trail[trail.length - 1]
  if (!last || now - last.t > FLICK_STALE) return 0
  const first = trail.find((s) => last.t - s.t <= FLICK_WINDOW) ?? last
  const dt = (last.t - first.t) / 1000
  if (dt < 0.008) return 0
  return clamp((last.value - first.value) / dt, -FLING_MAX, FLING_MAX)
}

/** The card a ring of `count` let go at `value`, moving at `velocity`, comes to rest on. */
export function landing(value: number, velocity: number, count: number): number {
  return clamp(Math.round(value + velocity * FLING_REACH), 0, Math.max(0, count - 1))
}

/**
 * The spring that takes a ring from `value`, moving at `velocity`, to
 * `target` without ever passing it. A critically damped spring runs past its
 * target when it starts out toward it faster than its own rate times the
 * distance left. So a ring let go fast and close is given a stiffer spring,
 * which keeps its speed and simply arrives sooner; only beyond the stiffest
 * allowed is the speed itself cut.
 */
export function approach(value: number, velocity: number, target: number): { rate: number; velocity: number } {
  const off = target - value
  const toward = velocity * Math.sign(off)
  if (toward <= RING_RATE * Math.abs(off)) return { rate: RING_RATE, velocity }
  const rate = Math.min(RING_RATE * RING_STIFFEST, toward / Math.max(Math.abs(off), 1e-9))
  return { rate, velocity: Math.sign(off) * Math.min(toward, rate * Math.abs(off)) }
}

export type Ring = {
  /** Where the ring was, in cards, and how fast it was turning, at time `at`. */
  value: number
  velocity: number
  /** Where it is headed: a card, or while a wheel is turning it, wherever the wheel has put it. */
  target: number
  /** The rate of the spring taking it there, per second. */
  rate: number
  at: number
  /** True while a pointer has hold of it: it is where the pointer put it. */
  held: boolean
}

/** Where a ring is at time `now`, and how fast it is turning. */
export function ringAt(ring: Ring, now: number): Glide {
  if (ring.held) return { value: ring.value, velocity: 0 }
  const g = glide(ring, ring.target, Math.max(0, now - ring.at) / 1000, ring.rate)
  return Math.abs(g.value - ring.target) < 2e-4 && Math.abs(g.velocity) < 2e-3 ? { value: ring.target, velocity: 0 } : g
}

const rest = (card = 0): Ring => ({ value: card, velocity: 0, target: card, rate: RING_RATE, at: 0, held: false })

/**
 * The rings of every project, one each: `counts[i]` is how many cards project
 * i has. Whoever handles the pointer calls `press`, `drag` and `release` (or
 * `goTo`, `step`, `push` and `settle`) with the time of the event; whoever
 * draws calls `read` with the time of the frame. Nothing here runs on its own:
 * a ring in motion is worked out from where it was let go and how long ago.
 */
export function createRings(counts: readonly number[]) {
  const rings = counts.map(() => rest())
  const trails: { t: number; value: number }[][] = counts.map(() => [])
  /** Where each hold began, before the ends' resistance; and where a wheel has pushed each ring to. */
  const origins = counts.map(() => 0)
  const pushed: (number | null)[] = counts.map(() => null)
  const last = (i: number) => Math.max(0, (counts[i] ?? 1) - 1)
  /** Lets go of the spring and starts from where the ring is now. */
  const rebase = (i: number, now: number) => {
    const g = ringAt(rings[i], now)
    rings[i] = { ...rings[i], value: g.value, velocity: g.velocity, at: now, held: false }
    return rings[i]
  }

  const api = {
    /** How many cards project `i` has. */
    count: (i: number) => counts[i] ?? 1,
    /** Where project `i`'s ring is at time `now`, in cards. */
    read: (i: number, now: number) => (rings[i] ? ringAt(rings[i], now).value : 0),
    /** The card in the middle of project `i`'s ring: the nearest while it is held, the one it is headed for otherwise. */
    card: (i: number) => (rings[i] ? clamp(Math.round(rings[i].held ? rings[i].value : rings[i].target), 0, last(i)) : 0),
    /** True while a pointer has hold of any ring. */
    holding: () => rings.some((r) => r.held),
    /** True if project `i`'s ring is anywhere but at rest on its first picture. */
    away: (i: number) => !!rings[i] && (rings[i].held || rings[i].value !== 0 || rings[i].target !== 0),
    /** True if project `i`'s ring is at rest at time `now`. */
    resting: (i: number, now: number) => !rings[i] || (!rings[i].held && ringAt(rings[i], now).value === rings[i].target && pushed[i] === null),

    /** A pointer takes hold of the ring, wherever it is and however fast it was turning. */
    press(i: number, now: number) {
      if (!rings[i]) return
      const ring = rebase(i, now)
      pushed[i] = null
      origins[i] = unrubber(ring.value, counts[i])
      rings[i] = { ...ring, velocity: 0, held: true }
      trails[i] = [{ t: now, value: ring.value }]
    },
    /** The pointer has carried the ring `by` cards from where it took hold. */
    drag(i: number, by: number, now: number) {
      const ring = rings[i]
      if (!ring?.held) return
      const value = rubber(origins[i] + by, counts[i])
      rings[i] = { ...ring, value, at: now }
      const trail = trails[i]
      trail.push({ t: now, value })
      while (trail.length > 2 && now - trail[0].t > FLICK_WINDOW * 2) trail.shift()
    },
    /** The pointer lets go: the ring keeps the speed it had and settles on a card. */
    release(i: number, now: number) {
      const ring = rings[i]
      if (!ring?.held) return
      const speed = flick(trails[i], now)
      const target = landing(ring.value, speed, counts[i])
      rings[i] = { ...ring, ...approach(ring.value, speed, target), target, at: now, held: false }
      trails[i] = []
    },
    /** Lets go of every ring that is held. */
    releaseAll(now: number) {
      rings.forEach((r, i) => r.held && api.release(i, now))
    },
    /** Sends the ring to `card`, from wherever it is. */
    goTo(i: number, card: number, now: number) {
      if (!rings[i]) return
      const ring = rebase(i, now)
      pushed[i] = null
      const target = clamp(Math.round(card), 0, last(i))
      rings[i] = { ...ring, ...approach(ring.value, ring.velocity, target), target }
    },
    /** Sends the ring `by` cards on from the one it is headed for. */
    step(i: number, by: number, now: number) {
      api.goTo(i, api.card(i) + by, now)
    },
    /** A wheel or a trackpad turns the ring `by` cards. It follows closely; call `settle` when the wheel has stopped. */
    push(i: number, by: number, now: number) {
      if (!rings[i] || rings[i].held) return
      const ring = rebase(i, now)
      const from = pushed[i] ?? unrubber(ring.value, counts[i])
      const to = clamp(from + by, -1, last(i) + 1)
      pushed[i] = to
      rings[i] = { ...ring, target: rubber(to, counts[i]), rate: WHEEL_RATE }
    },
    /** The wheel has stopped: the ring settles on the card nearest where it was pushed to. */
    settle(i: number, now: number) {
      if (!rings[i] || pushed[i] === null) return
      const ring = rebase(i, now)
      const target = clamp(Math.round(rubber(pushed[i]!, counts[i])), 0, last(i))
      pushed[i] = null
      rings[i] = { ...ring, ...approach(ring.value, ring.velocity, target), target }
    },
    /** Puts the ring at `value` and leaves it there, between cards if need be: for stills. */
    set(i: number, value: number) {
      if (!rings[i]) return
      pushed[i] = null
      rings[i] = rest(value)
    },
    /** Back to the first picture, at once: for a project that is out of sight. */
    reset(i: number) {
      api.set(i, 0)
    },
  }
  return api
}

export type Rings = ReturnType<typeof createRings>
