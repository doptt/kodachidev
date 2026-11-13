// Small corrections to the generated shape, applied alike to the dense mesh and to everything made from it.
//
// The generator gives the alien smaller eyes than the reference views it was shown. `reshape` enlarges whatever
// lies round each eye's centre, most at the centre and not at all beyond a radius, so the eye and its rim grow
// and the skin round them gives way. remesh.mjs and bake.mjs both call it on the dense mesh's positions, so the
// low mesh and the surface it is baked from stay the same shape.
import { readFileSync } from 'node:fs'

/** Reads a shape file: { "eyes": [{ "center": [x, y, z], "radius": r, "magnify": m }] }, or nothing for no change. */
export function loadShape(file) {
  return file ? JSON.parse(readFileSync(file, 'utf8')) : { eyes: [] }
}

/** Moves the positions (a flat x, y, z array) in place. */
export function reshape(positions, shape) {
  for (let i = 0; i < positions.length; i += 3) {
    let dx = 0
    let dy = 0
    let dz = 0
    for (const eye of shape.eyes) {
      const rx = positions[i] - eye.center[0]
      const ry = positions[i + 1] - eye.center[1]
      const rz = positions[i + 2] - eye.center[2]
      const r = Math.hypot(rx, ry, rz)
      if (r >= eye.radius) continue
      // 1 at the centre, 0 at the radius, smooth at both ends
      const t = r / eye.radius
      const fall = 1 - t * t * (3 - 2 * t)
      const grow = (eye.magnify - 1) * fall
      dx += rx * grow
      dy += ry * grow
      dz += rz * grow
    }
    positions[i] += dx
    positions[i + 1] += dy
    positions[i + 2] += dz
  }
}

/** Smooth vertex normals for a mesh whose vertices are split along UV seams: vertices at one position share one. */
export function smoothNormals(positions, indices) {
  const count = positions.length / 3
  const weldOf = new Uint32Array(count)
  const seen = new Map()
  let unique = 0
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(positions[i * 3] * 1e5)},${Math.round(positions[i * 3 + 1] * 1e5)},${Math.round(positions[i * 3 + 2] * 1e5)}`
    let index = seen.get(key)
    if (index === undefined) {
      index = unique++
      seen.set(key, index)
    }
    weldOf[i] = index
  }
  // Each face adds its cross product, so larger faces count for more
  const sums = new Float64Array(unique * 3)
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3]
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    for (const vertex of [indices[i], indices[i + 1], indices[i + 2]]) for (let k = 0; k < 3; k++) sums[weldOf[vertex] * 3 + k] += n[k]
  }
  const normals = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const w = weldOf[i] * 3
    const length = Math.hypot(sums[w], sums[w + 1], sums[w + 2]) || 1
    for (let k = 0; k < 3; k++) normals[i * 3 + k] = sums[w + k] / length
  }
  return normals
}
