import { SHADOW_B, type Composition, type Frame } from './timeline'

type Vec3 = [number, number, number]

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const add = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]

export type Camera = {
  pos: Vec3
  /** Column-major mat3: right, up, forward. */
  basis: Float32Array
  /** tan(half fov) for x and y. */
  tan: [number, number]
  /** Hole centre in NDC (-1..1, y up). */
  holeNdc: [number, number]
  /** Radius of the shadow as a fraction of the viewport height. */
  ring: number
}

/** Where the disk sits relative to the camera at idle; chosen so the bright side faces the viewer's right. */
const AZIMUTH0 = -0.35
/** How far the pointer swings the camera, radians. */
const ORBIT_X = (2.6 * Math.PI) / 180
const ORBIT_Y = (1.5 * Math.PI) / 180

/**
 * Builds the camera for one frame.
 * `pointer` is the eased pointer position (-1..1 on both axes, y up);
 * `shakeTime` advances the shake noise (pass a frozen value to hold it still).
 */
export function buildCamera(frame: Frame, comp: Composition, aspect: number, pointer: [number, number], shakeTime: number): Camera {
  const az = AZIMUTH0 + frame.azim + pointer[0] * ORBIT_X
  const el = Math.max(0.05, frame.elev + pointer[1] * ORBIT_Y)
  const d = frame.dist
  const pos: Vec3 = [d * Math.cos(el) * Math.cos(az), d * Math.sin(el), d * Math.cos(el) * Math.sin(az)]

  // Look straight at the hole, then roll
  const f0 = norm([-pos[0], -pos[1], -pos[2]])
  const r0 = norm(cross(f0, [0, 1, 0]))
  const u0 = cross(r0, f0)
  const cr = Math.cos(frame.roll)
  const sr = Math.sin(frame.roll)
  let right: Vec3 = [r0[0] * cr + u0[0] * sr, r0[1] * cr + u0[1] * sr, r0[2] * cr + u0[2] * sr]
  let up: Vec3 = [-r0[0] * sr + u0[0] * cr, -r0[1] * sr + u0[1] * cr, -r0[2] * sr + u0[2] * cr]

  const tanY = comp.tanHalfFov * frame.fovScale
  const tanX = tanY * aspect

  // Turn the camera so the hole lands off-centre; the offset eases to zero during the fall
  const hx = comp.hole[0] * (1 - frame.aim)
  const hy = comp.hole[1] * (1 - frame.aim)
  // Shake: a few incommensurate sines, so it never visibly loops
  const t = shakeTime
  const sx = (Math.sin(t * 31.7) + 0.6 * Math.sin(t * 17.3 + 1.3) + 0.4 * Math.sin(t * 53.1 + 0.7)) / 2
  const sy = (Math.sin(t * 27.1 + 2.1) + 0.6 * Math.sin(t * 13.9 + 0.4) + 0.4 * Math.sin(t * 47.3 + 1.9)) / 2
  let fwd = norm(add(add(f0, right, -hx * tanX + sx * frame.shake), up, -hy * tanY + sy * frame.shake))
  right = norm(add(right, fwd, -dot(right, fwd)))
  up = cross(right, fwd)

  // Where the hole actually ended up on screen
  const toHole: Vec3 = f0
  const z = Math.max(dot(toHole, fwd), 1e-4)
  const holeNdc: [number, number] = [dot(toHole, right) / z / tanX, dot(toHole, up) / z / tanY]

  // Apparent size of the shadow for an observer hovering at this radius
  const sinA = Math.min(1, (SHADOW_B / d) * Math.sqrt(Math.max(0, 1 - 1 / d)))
  const ring = d <= 1.5 ? 4 : Math.min(4, Math.tan(Math.asin(Math.min(sinA, 0.9999))) / (2 * tanY))

  return {
    pos,
    basis: new Float32Array([...right, ...up, ...fwd]),
    tan: [tanX, tanY],
    holeNdc,
    ring,
  }
}
