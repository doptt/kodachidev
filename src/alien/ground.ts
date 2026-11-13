import * as THREE from 'three'

/**
 * The ground the actor sits on: a sphere of the moon's radius whose top is the
 * actor's origin, or a plane when the radius is infinite. Everything that
 * touches the ground (cooler, heels, contact shadows, dust) asks this where the
 * ground is, so the set follows the curve of a small moon.
 */
export type Ground = {
  radius: number
  /** Height of the ground at (x, z), in the actor's space. 0 at the origin, falling away from it. */
  height(x: number, z: number): number
  /** Unit normal of the ground at (x, z). Writes into and returns `out`. */
  normal(x: number, z: number, out: THREE.Vector3): THREE.Vector3
  /** Stands `object` on the ground at (x, z), turned by `yaw` about the local up. */
  place(object: THREE.Object3D, x: number, z: number, yaw?: number): void
}

const UP = new THREE.Vector3(0, 1, 0)

export function makeGround(radius: number): Ground {
  const flat = !Number.isFinite(radius) || radius <= 0
  const height = (x: number, z: number) => (flat ? 0 : Math.sqrt(Math.max(radius * radius - x * x - z * z, 0)) - radius)
  const normal = (x: number, z: number, out: THREE.Vector3) => (flat ? out.set(0, 1, 0) : out.set(x, height(x, z) + radius, z).normalize())
  const n = new THREE.Vector3()
  const tilt = new THREE.Quaternion()
  const turn = new THREE.Quaternion()
  return {
    radius: flat ? Infinity : radius,
    height,
    normal,
    place(object, x, z, yaw = 0) {
      object.position.set(x, height(x, z), z)
      tilt.setFromUnitVectors(UP, normal(x, z, n))
      turn.setFromAxisAngle(UP, yaw)
      object.quaternion.copy(tilt).multiply(turn)
    },
  }
}
