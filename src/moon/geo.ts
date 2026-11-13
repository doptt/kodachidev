/**
 * Where things are on the little moon. Pure functions, no DOM, no GL and no
 * imports, so they can be tested on their own.
 *
 * Two frames are used:
 *
 *  - Moon-fixed: the frame of NASA's maps. +Y is the north pole, +Z is the
 *    middle of the near side (0° N, 0° E) and +X is east. Latitude and
 *    longitude are in degrees, east positive, as on any map of the Moon.
 *  - Stand: the frame the scene is built in. The alien's spot is straight up
 *    (+Y) and he faces +Z. `standFrame` gives the rotation from the first to
 *    the second.
 *
 * Vectors are [x, y, z] tuples.
 */

export type Vec3 = [number, number, number]
/** A rotation, as its three rows: the stand frame's x, y and z axes written in moon-fixed coordinates. */
export type Frame = [Vec3, Vec3, Vec3]

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Unit vector, moon-fixed, of the point at a latitude and longitude. */
export function latLonToVec3(lat: number, lon: number): Vec3 {
  const cl = Math.cos(rad(lat))
  return [cl * Math.sin(rad(lon)), Math.sin(rad(lat)), cl * Math.cos(rad(lon))]
}

/** Latitude and longitude, in degrees, of a moon-fixed direction. */
export function vec3ToLatLon(v: Vec3): { lat: number; lon: number } {
  const [x, y, z] = normalize(v)
  return { lat: deg(Math.asin(Math.min(1, Math.max(-1, y)))), lon: deg(Math.atan2(x, z)) }
}

/** Where a latitude and longitude fall on NASA's maps: u from the left edge (180° W), v from the top edge (the north pole). */
export function latLonToUv(lat: number, lon: number): [number, number] {
  return [(lon + 180) / 360, (90 - lat) / 180]
}

/**
 * The stand frame for a spot at (lat, lon) with the alien facing along the
 * compass bearing `heading` (degrees clockwise from north).
 */
export function standFrame(lat: number, lon: number, heading: number): Frame {
  const up = latLonToVec3(lat, lon)
  const pole: Vec3 = [0, 1, 0]
  const k = dot(pole, up)
  const north = normalize([pole[0] - k * up[0], pole[1] - k * up[1], pole[2] - k * up[2]])
  const east = cross(north, up)
  const c = Math.cos(rad(heading))
  const s = Math.sin(rad(heading))
  const forward: Vec3 = [north[0] * c + east[0] * s, north[1] * c + east[1] * s, north[2] * c + east[2] * s]
  return [cross(up, forward), up, forward]
}

/** A moon-fixed vector, in the stand frame. */
export function toStand(frame: Frame, v: Vec3): Vec3 {
  return [dot(frame[0], v), dot(frame[1], v), dot(frame[2], v)]
}

/** Angle between two unit vectors, radians. */
export function arc(a: Vec3, b: Vec3) {
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b))))
}

/** Which way round the stand a direction is: 0 straight ahead of the alien (+Z), growing toward +X. Radians. */
export function azimuth(v: Vec3) {
  return Math.atan2(v[0], v[2])
}

/**
 * How much of a point the camera can see past a ball of `radius` at the
 * origin: 0 when the ball is in the way, 1 when the line of sight clears it by
 * `margin` or more, and a smooth ramp between, so that something going round
 * the back fades rather than winks out.
 */
export function visibility(camera: Vec3, point: Vec3, radius: number, margin: number) {
  const d: Vec3 = [point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]]
  const len2 = dot(d, d)
  // Nearest the line of sight comes to the centre, between the camera and the point
  const t = len2 > 0 ? clamp01(-dot(camera, d) / len2) : 0
  const near = Math.hypot(camera[0] + d[0] * t, camera[1] + d[1] * t, camera[2] + d[2] * t)
  const x = clamp01((near - radius) / Math.max(margin, 1e-6))
  return x * x * (3 - 2 * x)
}
