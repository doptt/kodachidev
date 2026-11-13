/**
 * Looking round the alien by hand. Pure functions over a plain object, no DOM,
 * no GL and no imports, so the feel can be tested on their own.
 *
 * The camera swings a little way round the chair (`yaw`) and rides up and
 * down a very little (`tilt`). Both have limits: the moon's edge is where the
 * owner drew it, and a swing round the moon's own axis leaves it there, while
 * the tilt is kept small enough that it hardly lifts. A drag moves both
 * directly, giving grudgingly past a limit; letting go leaves the view
 * drifting on, and the drift dies away and eases back inside. Left alone for a
 * moment the camera sways slowly from side to side. Asking it to face
 * somewhere (`face`) takes over from all of that until the next drag.
 *
 * Angles are radians, times seconds.
 */

export type Orbit = {
  /** Swing of the camera round the chair. Positive carries the scene to the right. */
  yaw: number
  /** Camera elevation, as an offset from where the timeline puts it. */
  tilt: number
  vYaw: number
  vTilt: number
  dragging: boolean
  /** How long since anyone touched it. */
  idle: number
  /** A yaw being turned to, or null. */
  goal: number | null
  /** Where the idle sway swings about, and how far through it is. */
  rest: number
  swayed: number
  /** What the drag has moved it by since the last step, for measuring the speed of the hand. */
  moved: [number, number]
}

/** How far the camera may swing either way, and ride down and up. */
export const YAW_MAX = 0.44
export const TILT_MIN = -0.045
export const TILT_MAX = 0.07
/** Share of a drag that still gets through past a limit. */
export const RUBBER = 0.25
/** Time constant of the drift dying away after a throw. */
export const INERTIA = 0.7
/** Time constant of easing back inside a limit. */
const SPRING = 0.18
/** The idle sway: how far each way, how long a full swing takes, and how long it waits before starting. */
export const SWAY = 0.075
const SWAY_PERIOD = 44
export const SWAY_DELAY = 2.4
/** The fastest a throw can leave it moving. */
export const MAX_SPIN = 3

const decay = (dt: number, tau: number) => Math.exp(-dt / Math.max(tau, 1e-4))
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function createOrbit(): Orbit {
  return { yaw: 0, tilt: 0, vYaw: 0, vTilt: 0, dragging: false, idle: 0, goal: null, rest: 0, swayed: 0, moved: [0, 0] }
}

/** A hand takes hold: everything stops where it is. */
export function grab(o: Orbit) {
  o.dragging = true
  o.vYaw = 0
  o.vTilt = 0
  o.goal = null
  o.idle = 0
  o.moved = [0, 0]
}

/** The hand moves by (dYaw, dTilt). Past a limit the view gives, but grudgingly. */
export function drag(o: Orbit, dYaw: number, dTilt: number) {
  if (!o.dragging) return
  const yaw = dYaw * ((o.yaw >= YAW_MAX && dYaw > 0) || (o.yaw <= -YAW_MAX && dYaw < 0) ? RUBBER : 1)
  const tilt = dTilt * ((o.tilt >= TILT_MAX && dTilt > 0) || (o.tilt <= TILT_MIN && dTilt < 0) ? RUBBER : 1)
  o.yaw += yaw
  o.tilt += tilt
  o.moved[0] += yaw
  o.moved[1] += tilt
}

/** The hand lets go: whatever speed it had carries on. */
export function release(o: Orbit) {
  o.dragging = false
  o.idle = 0
  o.vYaw = clamp(o.vYaw, -MAX_SPIN, MAX_SPIN)
}

/** Swing to `yaw`, or as near as the limits allow, and hold there. */
export function face(o: Orbit, yaw: number) {
  o.goal = clamp(yaw, -YAW_MAX, YAW_MAX)
  o.vYaw = 0
}

/** Stop holding a facing; the view is its own again. */
export function unface(o: Orbit) {
  if (o.goal === null) return
  o.goal = null
  o.idle = 0
}

/** Eases `value` back inside [lo, hi] if it is outside, and stops it going further out. Returns the new value and speed. */
function contain(value: number, speed: number, lo: number, hi: number, dt: number): [number, number] {
  const limit = value > hi ? hi : value < lo ? lo : null
  if (limit === null) return [value, speed]
  let next = limit + (value - limit) * decay(dt, SPRING)
  if (Math.abs(next - limit) < 1e-4) next = limit
  return [next, (value - limit) * speed > 0 ? 0 : speed]
}

/**
 * Advances the orbit by `dt`. `auto` allows the idle sway; `tau` is the time
 * constant of a swing toward a facing (0 swings at once).
 */
export function step(o: Orbit, dt: number, opts: { auto: boolean; tau: number }) {
  if (dt <= 0) return
  if (o.dragging) {
    // The speed of the hand, smoothed over a few frames so that one jittery sample is not the throw
    const k = 1 - decay(dt, 0.06)
    o.vYaw += (o.moved[0] / dt - o.vYaw) * k
    o.vTilt += (o.moved[1] / dt - o.vTilt) * k
    o.moved = [0, 0]
    o.idle = 0
    return
  }

  if (o.goal !== null) {
    o.yaw = opts.tau > 0 ? o.goal + (o.yaw - o.goal) * decay(dt, opts.tau) : o.goal
    o.vYaw = 0
    o.idle = 0
  } else {
    const was = o.idle
    o.idle += dt
    o.yaw += o.vYaw * dt
    o.vYaw *= decay(dt, INERTIA)
    ;[o.yaw, o.vYaw] = contain(o.yaw, o.vYaw, -YAW_MAX, YAW_MAX, dt)
    if (opts.auto && o.idle > SWAY_DELAY) {
      // The sway starts from wherever the view was left, and from the middle of its swing, so it starts without a jolt
      if (was <= SWAY_DELAY) {
        o.rest = clamp(o.yaw, -YAW_MAX + SWAY, YAW_MAX - SWAY)
        o.swayed = 0
      }
      o.swayed += dt
      const target = o.rest + SWAY * Math.sin((o.swayed / SWAY_PERIOD) * 2 * Math.PI)
      o.yaw = target + (o.yaw - target) * decay(dt, 1.2)
    }
  }

  o.tilt += o.vTilt * dt
  o.vTilt *= decay(dt, INERTIA * 0.4)
  ;[o.tilt, o.vTilt] = contain(o.tilt, o.vTilt, TILT_MIN, TILT_MAX, dt)
}
