import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Small helpers the props share. Each prop is a handful of merged meshes, one
 * per material, so the whole set stays within a few draw calls; where parts of
 * one mesh differ only in colour, the colour rides on the vertices.
 */

/** Gives every vertex of `geometry` one colour (for materials with `vertexColors`). Returns the geometry. */
export function tint(geometry: THREE.BufferGeometry, colour: THREE.ColorRepresentation) {
  const c = new THREE.Color(colour)
  const count = geometry.getAttribute('position').count
  const data = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    data[i * 3] = c.r
    data[i * 3 + 1] = c.g
    data[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3))
  return geometry
}

/** Merges parts into one geometry, disposing the parts. Parts without an index are given one first. */
export function fuse(parts: THREE.BufferGeometry[]) {
  const indexed = parts.map((g) => {
    if (g.index) return g
    const out = mergeVertices(g)
    g.dispose()
    return out
  })
  const merged = mergeGeometries(indexed, false)
  for (const g of indexed) g.dispose()
  if (!merged) throw new Error('prop parts do not share the same attributes')
  return merged
}

/** A mesh that casts and receives shadow, named for the harness and the stats. */
export function solid(geometry: THREE.BufferGeometry, material: THREE.Material, name: string, castShadow = true) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  return mesh
}

/** Moves and turns a geometry in place: turn first (Euler angles, XYZ order), then move. Returns it. */
export function placed(geometry: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  if (rx || ry || rz) geometry.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)))
  geometry.translate(x, y, z)
  return geometry
}
