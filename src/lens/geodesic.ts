/**
 * How light bends around a Schwarzschild black hole, for an observer hovering
 * close to it. Pure functions, no DOM, no GL and no imports, so the tests can
 * run them directly.
 *
 * Units: the event horizon is at r = 1. The observer hovers at radius `r0` and
 * looks along a ray that makes the angle `psi` with the direction straight
 * down into the hole (0 is straight in, PI is straight out).
 *
 * A ray stays in the plane through the hole that contains it, so the whole
 * lens comes down to one function per radius: how far round the hole a ray
 * has travelled, `phi`, by the time it is back out among the stars. Flat space
 * would give PI - psi. Near the hole it is more, and it grows without limit as
 * the ray approaches the edge of the shadow, where light circles the hole any
 * number of times before leaving: every extra half turn is another, thinner
 * image of the same sky.
 */

/** Impact parameter of the photon orbit: rays inside it are captured. */
export const CRITICAL_B = (3 * Math.sqrt(3)) / 2

/** Entries in a deflection table. */
export const TABLE_SIZE = 384
/**
 * The table is spaced logarithmically toward the edge of the shadow, where the
 * deflection diverges like a logarithm: entry 0 sits exp(-TABLE_LOG) of the
 * way from the edge to straight up.
 */
const TABLE_LOG = 13
/** Deflection is cut off here (three full turns): past it the images are thinner than any pixel. */
export const PHI_MAX = 6 * Math.PI

const STEP = 0.03

/**
 * Angle from straight down to the edge of the shadow, for an observer hovering
 * at `r0`. A quarter turn at the photon sphere (r0 = 1.5), where the shadow is
 * exactly the lower half of the sky; more than that inside it.
 */
export function shadowAngle(r0: number) {
  const s = Math.min(1, (CRITICAL_B * Math.sqrt(Math.max(0, 1 - 1 / r0))) / r0)
  return r0 >= 1.5 ? Math.asin(s) : Math.PI - Math.asin(s)
}

/**
 * Angle swept round the hole by a ray leaving `r0` at `psi`, by the time it
 * reaches infinity. Returns PHI_MAX for rays that are captured or wind further
 * than that.
 *
 * Integrates the orbit equation u'' = 1.5 u^2 - u for u = 1 / r, with the
 * swept angle as the independent variable (fourth-order Runge-Kutta).
 */
export function deflection(r0: number, psi: number) {
  if (psi >= Math.PI - 1e-9) return 0
  let u = 1 / r0
  // Positive when the ray starts out heading inward
  let du = (u * Math.sqrt(Math.max(0, 1 - u)) * Math.cos(psi)) / Math.max(Math.sin(psi), 1e-12)
  let phi = 0
  while (phi < PHI_MAX) {
    // Rays heading almost straight out cover very little angle: shorten the step to match
    const h = du < 0 ? Math.min(STEP, (0.5 * u) / -du) : STEP
    const k1u = du
    const k1v = 1.5 * u * u - u
    const u2 = u + 0.5 * h * k1u
    const k2u = du + 0.5 * h * k1v
    const k2v = 1.5 * u2 * u2 - u2
    const u3 = u + 0.5 * h * k2u
    const k3u = du + 0.5 * h * k2v
    const k3v = 1.5 * u3 * u3 - u3
    const u4 = u + h * k3u
    const k4u = du + h * k3v
    const k4v = 1.5 * u4 * u4 - u4
    const next = u + (h / 6) * (k1u + 2 * k2u + 2 * k3u + k4u)
    const dnext = du + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)
    if (next <= 0) return phi + (h * u) / (u - next)
    if (next >= 1) return PHI_MAX
    if (h < 1e-7) return phi
    u = next
    du = dnext
    phi += h
  }
  return PHI_MAX
}

/** Where table entry `i` sits: its angle from straight down. */
function tableAngle(r0: number, i: number) {
  const edge = shadowAngle(r0)
  return edge + (Math.PI - edge) * Math.exp(-TABLE_LOG * (1 - i / (TABLE_SIZE - 1)))
}

/**
 * Entries below this one are not integrated. They lie within a ten-thousandth
 * of the way from the edge of the shadow, where light winds round the hole
 * many times (the slowest rays to follow) and where the deflection has settled
 * into its logarithm: a straight line on the table's scale. They are continued
 * along that line instead. On screen they cover a fraction of a pixel.
 */
const FIRST_INTEGRATED = Math.round((1 - Math.log(10000) / TABLE_LOG) * (TABLE_SIZE - 1))

/**
 * The deflection of every table entry for an observer at `r0`. Written into
 * `out` when given. It is worked out afresh on every frame of the climb at the
 * start and of the last fall (about a fifth of the stretch), so it has to be
 * cheap: a little under a millisecond on a laptop.
 */
export function deflectionTable(r0: number, out = new Float32Array(TABLE_SIZE)) {
  for (let i = FIRST_INTEGRATED; i < TABLE_SIZE; i++) out[i] = deflection(r0, tableAngle(r0, i))
  // This close to the edge the deflection grows by one radian for every e-fold nearer, whatever the
  // observer's height, and an entry is TABLE_LOG / (TABLE_SIZE - 1) of an e-fold. (Measuring the
  // slope off the last integrated entries instead undershoots it, more so the higher the observer.)
  const slope = TABLE_LOG / (TABLE_SIZE - 1)
  for (let i = FIRST_INTEGRATED - 1; i >= 0; i--) out[i] = Math.min(PHI_MAX, out[FIRST_INTEGRATED] + slope * (FIRST_INTEGRATED - i))
  return out
}

/** Reads a table the way the shader does: deflection at `psi`, or PHI_MAX inside the shadow. */
export function lookup(table: Float32Array, r0: number, psi: number) {
  const edge = shadowAngle(r0)
  const x = (psi - edge) / (Math.PI - edge)
  if (x <= 0) return PHI_MAX
  const s = Math.max(0, 1 + Math.log(x) / TABLE_LOG) * (TABLE_SIZE - 1)
  const i = Math.min(TABLE_SIZE - 2, Math.floor(s))
  return table[i] + (table[i + 1] - table[i]) * (s - i)
}

/**
 * The inverse: the angle from straight down at which the observer sees the
 * part of the sky that lies `phi` round from the zenith. With `phi` under PI
 * this is the direct image; add whole turns for the thinner ones.
 */
export function imageAngle(table: Float32Array, r0: number, phi: number) {
  let lo = shadowAngle(r0)
  let hi = Math.PI
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi)
    // Deflection falls as the ray points further from the hole
    if (lookup(table, r0, mid) > phi) lo = mid
    else hi = mid
  }
  return 0.5 * (lo + hi)
}
