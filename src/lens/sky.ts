/**
 * How the night sky lies in the scene: which way a direction in the scene
 * points on the star map. Pure functions, no DOM and no GL, so the tests can
 * run them directly.
 *
 * Three turns, one after another. The scroll turns the whole sky about the
 * axis across the view, carrying the projects round. The stars then drift a
 * little on their own, about an axis that leans away from the scene's
 * vertical. And the result is laid onto the map's own axes (x the galaxy's
 * centre, y its pole, z along the band), with the galaxy's centre straight
 * ahead and `rise` above level, so that its band runs across the view.
 *
 * Why the drift's axis leans: before any scrolling the scene's vertical is the
 * hole's own axis, and stars turning about that would slide along the ring
 * the lens makes round the hole and never cross it. Crossing it is when a
 * star flares.
 *
 * The scene's axes are x right, y up, z ahead. Angles are in radians.
 */

/** How far the axis the stars drift about leans from the scene's vertical, toward its x axis. */
export const DRIFT_TILT = (25 * Math.PI) / 180

type Mat3 = number[][]

const mul = (a: Mat3, b: Mat3): Mat3 => a.map((row) => [0, 1, 2].map((c) => row[0] * b[0][c] + row[1] * b[1][c] + row[2] * b[2][c]))

/**
 * The matrix that takes a scene direction to a star-map direction, column-major
 * (as WebGL wants it), and the axis the stars drift about as a direction on the map.
 */
export function skyMatrix(turn: number, drift: number, rise: number, tilt = DRIFT_TILT): { matrix: Float32Array; axis: [number, number, number] } {
  const ct = Math.cos(turn)
  const st = Math.sin(turn)
  const cd = Math.cos(drift)
  const sd = Math.sin(drift)
  const cg = Math.cos(rise)
  const sg = Math.sin(rise)
  const cl = Math.cos(tilt)
  const sl = Math.sin(tilt)
  // The scroll's turn, about x
  const scroll: Mat3 = [
    [1, 0, 0],
    [0, ct, -st],
    [0, st, ct],
  ]
  // The drift, about y...
  const about: Mat3 = [
    [cd, 0, sd],
    [0, 1, 0],
    [-sd, 0, cd],
  ]
  // ...leant over, so that it is about (sin tilt, cos tilt, 0)
  const lean: Mat3 = [
    [cl, sl, 0],
    [-sl, cl, 0],
    [0, 0, 1],
  ]
  const unlean: Mat3 = [
    [cl, -sl, 0],
    [sl, cl, 0],
    [0, 0, 1],
  ]
  // Onto the map: its x axis is the galaxy's centre, ahead and `rise` up; its z axis the scene's x
  const map: Mat3 = [
    [0, sg, cg],
    [0, cg, -sg],
    [1, 0, 0],
  ]
  const m = mul(map, mul(lean, mul(about, mul(unlean, scroll))))
  return {
    matrix: new Float32Array([m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]]),
    axis: [sg * cl, cg * cl, sl],
  }
}
