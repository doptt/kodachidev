import * as THREE from 'three'

/**
 * Bent tube, the way a tube bender leaves it: straight runs joined by arcs of
 * one radius. The frame of the chair is built from these rather than from a
 * modelled or generated mesh, so every bend is a true arc and every straight
 * is straight.
 */

/**
 * Rounds each inner corner of a polyline into an arc of `radius`, returning a
 * denser polyline. Corners too tight for the radius get the largest arc that
 * fits. Straight runs stay two points long, so a swept tube spends its rings
 * on the bends.
 */
function fillet(points: THREE.Vector3[], radius: number, steps = 8): THREE.Vector3[] {
  const out: THREE.Vector3[] = [points[0].clone()]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const toPrev = points[i - 1].clone().sub(p)
    const toNext = points[i + 1].clone().sub(p)
    const lenPrev = toPrev.length()
    const lenNext = toNext.length()
    toPrev.divideScalar(lenPrev)
    toNext.divideScalar(lenNext)
    const angle = Math.acos(THREE.MathUtils.clamp(toPrev.dot(toNext), -1, 1))
    if (angle > Math.PI - 1e-3) {
      out.push(p.clone())
      continue
    }
    // Distance from the corner to where the arc meets each leg
    const reach = Math.min(radius / Math.tan(angle / 2), lenPrev * 0.49, lenNext * 0.49)
    const r = reach * Math.tan(angle / 2)
    const bisector = toPrev.clone().add(toNext).normalize()
    const centre = p.clone().addScaledVector(bisector, r / Math.sin(angle / 2))
    const start = p.clone().addScaledVector(toPrev, reach).sub(centre)
    const end = p.clone().addScaledVector(toNext, reach).sub(centre)
    const axis = start.clone().cross(end).normalize()
    const sweep = Math.PI - angle
    const count = Math.max(2, Math.ceil((steps * sweep) / (Math.PI / 2)))
    for (let s = 0; s <= count; s++) out.push(start.clone().applyAxisAngle(axis, (sweep * s) / count).add(centre))
  }
  out.push(points[points.length - 1].clone())
  return out
}

/**
 * Sweeps a circle of `radius` along a polyline. UVs: u once round the tube, v
 * the distance along it in metres (so a brushed finish runs the right way and
 * at the right scale). `caps` closes the two ends with flat discs.
 */
export function sweep(path: THREE.Vector3[], radius: number, radial = 10, caps = false): THREE.BufferGeometry {
  const rings = path.length
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const tangent = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const binormal = new THREE.Vector3()
  const previous = new THREE.Vector3()
  const turn = new THREE.Quaternion()
  const radialDir = new THREE.Vector3()
  let along = 0

  for (let i = 0; i < rings; i++) {
    // Tangent: the bisector of the two segments meeting here
    tangent.set(0, 0, 0)
    if (i > 0) tangent.add(path[i].clone().sub(path[i - 1]).normalize())
    if (i < rings - 1) tangent.add(path[i + 1].clone().sub(path[i]).normalize())
    tangent.normalize()
    if (i === 0) {
      // Any normal will do to start; it is carried along the path without twisting from here
      normal.set(0, 1, 0)
      if (Math.abs(tangent.y) > 0.9) normal.set(1, 0, 0)
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize()
    } else {
      turn.setFromUnitVectors(previous, tangent)
      normal.applyQuaternion(turn).normalize()
      along += path[i].distanceTo(path[i - 1])
    }
    previous.copy(tangent)
    binormal.crossVectors(tangent, normal)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      radialDir.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a))
      positions.push(path[i].x + radialDir.x * radius, path[i].y + radialDir.y * radius, path[i].z + radialDir.z * radius)
      normals.push(radialDir.x, radialDir.y, radialDir.z)
      uvs.push(j / radial, along)
    }
  }
  const row = radial + 1
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j
      const b = a + row
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  if (caps) {
    for (const end of [0, rings - 1]) {
      const outward = end === 0 ? -1 : 1
      const dir = end === 0 ? path[1].clone().sub(path[0]).normalize() : path[rings - 1].clone().sub(path[rings - 2]).normalize()
      const centre = positions.length / 3
      positions.push(path[end].x, path[end].y, path[end].z)
      normals.push(dir.x * outward, dir.y * outward, dir.z * outward)
      uvs.push(0.5, end === 0 ? 0 : along)
      for (let j = 0; j <= radial; j++) {
        const src = (end * row + j) * 3
        positions.push(positions[src], positions[src + 1], positions[src + 2])
        normals.push(dir.x * outward, dir.y * outward, dir.z * outward)
        uvs.push(j / radial, end === 0 ? 0 : along)
      }
      for (let j = 0; j < radial; j++) {
        if (end === 0) indices.push(centre, centre + 2 + j, centre + 1 + j)
        else indices.push(centre, centre + 1 + j, centre + 2 + j)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/** A bent tube in one call: corners rounded to `bend`, then swept. */
export function bentTube(points: THREE.Vector3[], radius: number, bend: number, radial = 10, caps = false) {
  return sweep(fillet(points, bend), radius, radial, caps)
}

/** Shorthand for the many places a point is written out. */
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
