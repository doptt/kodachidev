/**
 * Fitting simple shapes to clouds of points: the middle of a patch of
 * vertices and the directions it is longest, widest and thinnest in. Used to
 * find the plane and outline of each painted eye and the lie of each finger
 * on a mesh nobody modelled by hand. Pure arithmetic on flat arrays.
 */
export type Axes = {
  centre: [number, number, number]
  /** Three unit vectors at right angles, from the direction the points spread most in to the one they spread least in. */
  axes: [[number, number, number], [number, number, number], [number, number, number]]
  /** Standard deviation of the points along each axis. */
  spread: [number, number, number]
}

/**
 * Principal axes of a set of points given as [x0, y0, z0, x1, y1, z1, …]:
 * the eigenvectors of their covariance, found by Jacobi rotations (a 3 by 3
 * symmetric matrix settles in a handful of sweeps).
 */
export function principalAxes(points: ArrayLike<number>): Axes {
  const count = Math.floor(points.length / 3)
  const centre: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) centre[k] += points[i * 3 + k] / Math.max(count, 1)

  // Covariance, as a full symmetric matrix
  const a = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < count; i++) {
    const d = [points[i * 3] - centre[0], points[i * 3 + 1] - centre[1], points[i * 3 + 2] - centre[2]]
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a[r][c] += (d[r] * d[c]) / Math.max(count, 1)
  }
  // Eigenvectors accumulate in the columns of v
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 24; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2])
    if (off < 1e-18) break
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-30) continue
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p]
        const akq = a[k][q]
        a[k][p] = c * akp - s * akq
        a[k][q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k]
        const aqk = a[q][k]
        a[p][k] = c * apk - s * aqk
        a[q][k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p]
        const vkq = v[k][q]
        v[k][p] = c * vkp - s * vkq
        v[k][q] = s * vkp + c * vkq
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i])
  const axis = (i: number): [number, number, number] => [v[0][order[i]], v[1][order[i]], v[2][order[i]]]
  return {
    centre,
    axes: [axis(0), axis(1), axis(2)],
    spread: [Math.sqrt(Math.max(a[order[0]][order[0]], 0)), Math.sqrt(Math.max(a[order[1]][order[1]], 0)), Math.sqrt(Math.max(a[order[2]][order[2]], 0))],
  }
}
