/*
 * Camera maths shared by the particle shader, the black hole ray tracer and
 * the cursor ripples, so all three agree on where things are on screen.
 *
 * World space: camera at (0, 0, cam) looking down -z. A model point p is
 * placed with   world = Rz(roll) · Rx(pitch) · Ry(yaw) · (scale · p)
 * and projected with   ndc = world.xy · focal / (cam - world.z)  (x / aspect)
 * plus a screen offset.
 *
 * The black hole lives in its own "disk space", measured in Schwarzschild
 * radii, with the accretion disk in the y = 0 plane:
 *   model = Rz(DISK.roll) · Rx(DISK.tilt) · (DISK.rs · q)
 */

export const DISK = {
  /** Size of one Schwarzschild radius in model units */
  rs: 0.2,
  /** Disk edges, in Schwarzschild radii */
  inner: 2.6,
  outer: 16,
  /** How far the disk is tipped toward the camera, and its lean on screen */
  tilt: 0.15,
  roll: -0.12,
  /** -1 or 1: orbit direction. -1 puts the bright, approaching side on the left. */
  spin: -1,
  /** Keplerian speed: angular velocity = orbit / r^1.5 (radians per second) */
  orbit: 1.3,
} as const

/** ~38° vertical field of view, pulled back on narrow screens so wide shapes still fit */
export const focalFor = (aspect: number) => 2.9 * Math.min(1, Math.max(0.52, aspect / 1.35))

export type View = { yaw: number; pitch: number; roll: number; cam: number; scale: number; x: number; y: number }

type M3 = number[] // row-major 3x3

const mul = (a: M3, b: M3): M3 => {
  const out = new Array(9).fill(0)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c]
  return out
}
const rx = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)]
const ry = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)]
const rz = (a: number): M3 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]
const apply = (m: M3, [x, y, z]: number[]) => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
]

/**
 * Turns camera-space ray directions into disk space, and gives the camera's
 * position in disk space (in Schwarzschild radii).
 */
export function diskCamera(v: View) {
  // Inverse of the model->world chain above, read right to left
  const m = [rx(-DISK.tilt), rz(-DISK.roll), ry(-v.yaw), rx(-v.pitch), rz(-v.roll)].reduce(mul)
  const pos = apply(m, [0, 0, v.cam]).map((c) => c / (v.scale * DISK.rs))
  // GLSL wants column-major
  const columns = new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]])
  return { m, pos, columns }
}

/** Where a screen point lands on the disk plane, ignoring lensing. */
export function diskHit(v: View, aspect: number, ndcX: number, ndcY: number): [number, number] | null {
  const { m, pos } = diskCamera(v)
  const focal = focalFor(aspect)
  const dir = apply(m, [((ndcX - v.x) * aspect) / focal, (ndcY - v.y) / focal, -1])
  if (Math.abs(dir[1]) < 1e-5) return null
  const t = -pos[1] / dir[1]
  if (t <= 0) return null
  return [pos[0] + dir[0] * t, pos[2] + dir[2] * t]
}
