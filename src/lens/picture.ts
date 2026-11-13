/**
 * The pictures in the sky, painted for the lens. Pure functions, no DOM and
 * no GL, so the tests can run them directly. (The two imports carry their
 * `.ts` so that node can follow them when it runs the tests.)
 *
 * The lens in this scene is the real one, and a real lens this close bends
 * everything. A screenshot hung on the sky as a plain rectangle would reach
 * the camera fanned out and squeezed. So each picture is painted on the sky
 * already stretched, in exactly the shape that the lens, seen from where the
 * camera rests, bends back into a flat rectangle. Street painters do the same
 * with pictures that only look right from one spot. Nothing in the light's
 * path is adjusted: when a project is settled its picture is flat, and
 * anywhere else it is bent, as it would be.
 *
 * Finding a pixel's place in a picture is three steps (`pictureCoord`, and the
 * shader does the same sum): turn the pixel's sky direction back to where the
 * project rests; ask where the resting camera sees that part of the sky
 * directly, which is the lens run backwards; and read off where that is on the
 * resting screen.
 *
 * Angles are in radians. `psi` is measured from straight down into the hole,
 * sky angles from the zenith. Directions are x right, y up, z ahead.
 */
import { deflectionTable, imageAngle, lookup, shadowAngle } from './geodesic.ts'
import { R_HOVER, framing, type Framing, type Tune } from './timeline.ts'

type Vec3 = [number, number, number]

/** Entries in an inverse table. */
export const INVERSE_SIZE = 256

/**
 * The lens run backwards, for an observer at `r0` whose deflection table is
 * `table`: entry i is the angle from straight down at which the part of the
 * sky PI * i / (INVERSE_SIZE - 1) round from the zenith is seen directly. The
 * last entry is the Einstein ring: what lies exactly behind the hole.
 */
export function inverseTable(table: Float32Array, r0: number, out = new Float32Array(INVERSE_SIZE)) {
  for (let i = 0; i < INVERSE_SIZE; i++) out[i] = imageAngle(table, r0, (Math.PI * i) / (INVERSE_SIZE - 1))
  return out
}

/** Reads an inverse table the way the shader does: straight lines between entries. */
export function inverseLookup(inverse: Float32Array, phi: number) {
  const s = (Math.min(Math.PI, Math.max(0, phi)) / Math.PI) * (INVERSE_SIZE - 1)
  const i = Math.min(INVERSE_SIZE - 2, Math.floor(s))
  return inverse[i] + (inverse[i + 1] - inverse[i]) * (s - i)
}

/** The camera's axes for a yaw and a pitch above level, column-major: right, up, forward. */
export function cameraBasis(yaw: number, pitch: number) {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  return new Float32Array([cy, 0, -sy, -sy * sp, cp, -cy * sp, sy * cp, sp, cy * cp])
}

/** The ray through a point of the screen, given as tangents from the camera's axis (x right, y up). */
export function screenRay(basis: Float32Array, x: number, y: number): Vec3 {
  const d = [0, 1, 2].map((i) => basis[i] * x + basis[3 + i] * y + basis[6 + i])
  const len = Math.hypot(d[0], d[1], d[2])
  return [d[0] / len, d[1] / len, d[2] / len]
}

/** The part of the sky a ray ends up pointing at, through the lens. Null inside the shadow. */
export function lensed(table: Float32Array, r0: number, d: readonly number[]): Vec3 | null {
  const psi = Math.acos(Math.min(1, Math.max(-1, -d[1])))
  if (psi <= shadowAngle(r0)) return null
  const theta = lookup(table, r0, psi)
  const flat = Math.max(Math.hypot(d[0], d[2]), 1e-5)
  return [(Math.sin(theta) * d[0]) / flat, Math.cos(theta), (Math.sin(theta) * d[2]) / flat]
}

/**
 * Where a part of the sky lies in a project's picture: tangents on the plane
 * of the resting screen, measured from the picture's centre. `turn` is how
 * far the project is from where it rests, radians about the x axis (0 when
 * settled, more as it lies further round behind the hole). Null when it would
 * be behind the resting camera.
 */
export function pictureCoord(sky: readonly number[], turn: number, inverse: Float32Array, restBasis: Float32Array, centreY: number): [number, number] | null {
  // Back to where the project rests
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const x = sky[0]
  const y = sky[1] * c + sky[2] * s
  const z = -sky[1] * s + sky[2] * c
  // Where the resting camera sees that part of the sky directly: a ray stays in its plane through
  // the hole, so the direction round the hole is kept and only the angle from straight down changes
  const phi = Math.acos(Math.min(1, Math.max(-1, y)))
  const flat = Math.max(Math.hypot(x, z), 1e-5)
  const psi = inverseLookup(inverse, phi)
  const d = [(Math.sin(psi) * x) / flat, -Math.cos(psi), (Math.sin(psi) * z) / flat]
  // Onto the resting screen
  const q = [0, 1, 2].map((k) => restBasis[k * 3] * d[0] + restBasis[k * 3 + 1] * d[1] + restBasis[k * 3 + 2] * d[2])
  if (q[2] <= 0.02) return null
  return [q[0] / q[2], q[1] / q[2] - centreY]
}

/** Sky left between the patch of one project and the next, radians. */
const STEP_MARGIN = (3 * Math.PI) / 180

/** The view the pictures are painted for: the camera at rest, on a screen of one shape. */
export type Rest = {
  /** The height the camera rests at. */
  radius: number
  framing: Framing
  /** The lens at that height, and the same lens run backwards. */
  table: Float32Array
  inverse: Float32Array
  /** The axes of the resting camera (see cameraBasis). */
  basis: Float32Array
  /** The part of the sky seen at the middle of a settled picture, radians from the zenith. */
  thetaRead: number
  /** How far the sky turns from one project to the next. */
  step: number
}

/**
 * Everything about the resting view for a screen of the given aspect. It
 * works out two tables, so keep the result for as long as its arguments hold.
 *
 * The turn from one project to the next is as deep as the patch of sky a
 * picture is painted on, and a little more. That keeps neighbours from sharing
 * any sky, and it puts the next project round behind the hole while this one
 * is read, where the lens makes a ring of it.
 */
export function rest(aspect: number, radius = R_HOVER, tune: Tune = {}): Rest {
  const table = deflectionTable(radius)
  const inverse = inverseTable(table, radius)
  const frame = framing(aspect, shadowAngle(radius), inverse[INVERSE_SIZE - 1], tune)
  const basis = cameraBasis(0, frame.pitch)
  // The part of the sky seen at a point of the resting screen, radians from the zenith
  const seen = (x: number, y: number) => lookup(table, radius, Math.acos(-screenRay(basis, x, y)[1]))
  const [across, up] = frame.half
  // A patch is deepest from the middle of the bottom edge, nearest the hole, to the top corners
  const depth = seen(0, frame.centreY - up) - seen(across, frame.centreY + up)
  return { radius, framing: frame, table, inverse, basis, thetaRead: seen(0, frame.centreY), step: depth + STEP_MARGIN }
}
