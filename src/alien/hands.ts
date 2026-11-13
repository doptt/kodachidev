import * as THREE from 'three'
import type { Cloud, Hand } from './measure'
import { BEER } from './props/beer'
import type { Rig } from './rig'

/**
 * Closing his hands. The hands of the model are open and have no bones of
 * their own (the rig stops at the wrist), so a bottle parented to the hand
 * would lie against a flat palm with the fingers sticking straight past it.
 * Instead the mesh itself is bent, once, at load: the fingers are rolled
 * round a cylinder, the way a sheet of paper is rolled round a tube, and
 * drawn together a little as a closing hand does. Rolled round a cylinder
 * the size of the body of the beer bottle they are a hand holding it; rolled
 * loosely they are the hang of a hand at rest. The thumb stands apart from
 * the fingers and is left where it is: it ends up lying up the side of the
 * bottle. The bottle is then parented to the hand bone exactly where that
 * cylinder was, so it sits in the fist with the fingers on its surface.
 *
 * The bending is done in the bind pose, in model space, on the vertices that
 * follow the hand bone, and written back into the geometry.
 */
export type Curl = {
  /** Radius of the thing the fingers roll round (the roll itself is this plus half a finger). */
  radius: number
  /** Furthest the fingers roll, radians. Past it they run on straight. */
  angle: number
  /** How much the fingers draw together as they close, 0..1 of their spread at the tips. */
  gather: number
}

/** A hand round the body of the beer bottle. */
export const GRIP: Curl = { radius: BEER.radius, angle: 2.7, gather: 0.5 }
/** A hand hanging at rest off the end of the arm of the chair: fingers loosely curled. */
export const DROOP: Curl = { radius: 0.045, angle: 1.1, gather: 0.35 }

/** Gives the geometry plain float positions and normals that can be edited (the file stores them quantised). */
export function unpackGeometry(geometry: THREE.BufferGeometry) {
  for (const name of ['position', 'normal']) {
    const packed = geometry.getAttribute(name)
    if (packed.array instanceof Float32Array && !packed.normalized) continue
    const plain = new Float32Array(packed.count * 3)
    for (let i = 0; i < packed.count; i++) {
      plain[i * 3] = packed.getX(i)
      plain[i * 3 + 1] = packed.getY(i)
      plain[i * 3 + 2] = packed.getZ(i)
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(plain, 3))
  }
}

/**
 * Bends one hand to `curl`. Call `unpackGeometry` first. The cloud's copy of
 * the positions is updated too, so later measurements see the closed hand.
 */
export function curlHand(rig: Rig, cloud: Cloud, hand: Hand, curl: Curl) {
  const geometry = rig.mesh.geometry
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const toGeometry = new THREE.Matrix4().copy(rig.geometryToModel).invert()

  const { wrist, fingers, palm, thumbSide } = hand
  // The cylinder's axis runs across the palm at the knuckles, its own radius plus half a finger above the palm
  const toAxis = curl.radius + hand.fingerRadius
  const reach = hand.length - hand.knuckles
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const fromWrist = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const radial = new THREE.Vector3()

  for (const i of hand.vertices) {
    if (hand.thumb.has(i)) continue
    fromWrist.fromArray(cloud.positions, i * 3).sub(wrist)
    const beyond = fromWrist.dot(fingers) - hand.knuckles
    if (beyond <= 0) continue
    n.fromBufferAttribute(normal, i)
    const h = fromWrist.dot(palm)
    const l = fromWrist.dot(thumbSide) * (1 - curl.gather * THREE.MathUtils.smoothstep(beyond, 0, reach))
    // Everything past the knuckles rolls round the cylinder, then runs on straight once it has rolled as far as it goes
    const angle = Math.min(beyond / toAxis, curl.angle)
    const straight = beyond - angle * toAxis
    radial.copy(palm).multiplyScalar(-Math.cos(angle)).addScaledVector(fingers, Math.sin(angle))
    tangent.copy(fingers).multiplyScalar(Math.cos(angle)).addScaledVector(palm, Math.sin(angle))
    p.copy(wrist)
      .addScaledVector(fingers, hand.knuckles)
      .addScaledVector(palm, toAxis)
      .addScaledVector(thumbSide, l)
      .addScaledVector(radial, toAxis - h)
      .addScaledVector(tangent, straight)
    const nl = n.dot(thumbSide)
    const nf = n.dot(fingers)
    const np = n.dot(palm)
    n.copy(thumbSide).multiplyScalar(nl).addScaledVector(tangent, nf).addScaledVector(radial, -np)

    p.toArray(cloud.positions, i * 3)
    p.applyMatrix4(toGeometry)
    position.setXYZ(i, p.x, p.y, p.z)
    normal.setXYZ(i, n.x, n.y, n.z)
  }
  position.needsUpdate = true
  normal.needsUpdate = true
}

/**
 * Where the beer bottle sits in a hand closed to `GRIP`, as the transform of
 * the bottle in model space in the bind pose: its axis along the cylinder the
 * fingers were rolled round, its neck toward the thumb, the fist round its
 * body at the height a bottle is held, and its label turned to the side the
 * fingertips come round to, away from the palm. Also returns the direction,
 * in the bottle's own space and level with its base, from its axis to the
 * wrist: which way round the bottle the arm is.
 */
export function beerInHand(hand: Hand, cloud: Cloud) {
  const toAxis = GRIP.radius + hand.fingerRadius
  const axis = hand.wrist.clone().addScaledVector(hand.fingers, hand.knuckles).addScaledVector(hand.palm, toAxis)
  // The middle of the fist along the bottle: halfway between the outermost of the vertices that lie on the cylinder
  let lo = Infinity
  let hi = -Infinity
  const p = new THREE.Vector3()
  for (const i of hand.vertices) {
    if (hand.thumb.has(i)) continue
    p.fromArray(cloud.positions, i * 3).sub(axis)
    const l = p.dot(hand.thumbSide)
    if (Math.abs(p.addScaledVector(hand.thumbSide, -l).length() - toAxis) > hand.fingerRadius * 1.6) continue
    lo = Math.min(lo, l)
    hi = Math.max(hi, l)
  }
  const middle = Number.isFinite(lo) ? (lo + hi) / 2 : 0
  const y = hand.thumbSide.clone()
  const z = hand.palm.clone().multiplyScalar(0.8).addScaledVector(hand.fingers, 0.6)
  z.addScaledVector(y, -z.dot(y)).normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  const base = axis.clone().addScaledVector(y, middle - BEER.grip)
  const toWrist = hand.wrist.clone().sub(axis)
  return {
    matrix: new THREE.Matrix4().makeBasis(x, y, z).setPosition(base),
    wrist: new THREE.Vector3(toWrist.dot(x), 0, toWrist.dot(z)).normalize(),
  }
}
