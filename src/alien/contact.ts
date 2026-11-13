import * as THREE from 'three'
import type { Ground } from './ground'

/**
 * Contact shadows: soft dark blobs laid on the ground exactly where something
 * touches it (the bars under the chair, his heels, the cooler). The sun's
 * shadow map gives the long cast shadows; these give the tight darkening at
 * the point of contact that makes a thing sit on the ground rather than hover
 * over it, in sun and in shade alike.
 *
 * They are one mesh of quads that follow the curve of the ground a few
 * millimetres above it.
 */
export type Stamp = {
  x: number
  z: number
  /** Half-size across and along, before turning. */
  halfWidth: number
  halfLength: number
  /** Turn about the vertical, radians. */
  yaw?: number
  /** Darkness at the middle, 0..1. */
  strength: number
}

const LIFT = 0.004

export function buildContactShadows(ground: Ground, stamps: Stamp[], material: THREE.Material) {
  const positions: number[] = []
  const uvs: number[] = []
  const colours: number[] = []
  const indices: number[] = []
  const normal = new THREE.Vector3()

  for (const s of stamps) {
    // Long stamps are cut into slices so they bend with the ground
    const slices = Math.max(1, Math.ceil(s.halfLength / 0.1))
    const cos = Math.cos(s.yaw ?? 0)
    const sin = Math.sin(s.yaw ?? 0)
    const base = positions.length / 3
    for (let i = 0; i <= slices; i++) {
      const v = i / slices
      for (const u of [0, 1]) {
        const lx = (u * 2 - 1) * s.halfWidth
        const lz = (v * 2 - 1) * s.halfLength
        const x = s.x + lx * cos + lz * sin
        const z = s.z - lx * sin + lz * cos
        ground.normal(x, z, normal)
        positions.push(x + normal.x * LIFT, ground.height(x, z) + normal.y * LIFT, z + normal.z * LIFT)
        uvs.push(u, v)
        colours.push(1, 1, 1, s.strength)
      }
    }
    for (let i = 0; i < slices; i++) {
      const a = base + i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4))
  geometry.setIndex(indices)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'contact-shadows'
  mesh.renderOrder = 1
  return { mesh, dispose: () => geometry.dispose() }
}
