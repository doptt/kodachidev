import * as THREE from 'three'
import { lagUnderAcceleration, stepSpring, type Spring } from './maths/spring'
import type { Antenna } from './measure'
import type { Rig } from './rig'

/**
 * The antennae: two springs on his head. Nothing animates them directly.
 * Each frame the actor works out how the head has just accelerated where an
 * antenna stands, and the antenna, having mass, hangs back from that and
 * then wobbles to rest (maths/spring.ts). So they whip when he turns to look
 * at something, nod as he tips his head back to drink, and tremble as he
 * breathes, without a single keyframe.
 *
 * Each antenna is a short chain of bones; the bend is shared along the chain
 * so it curves like a stalk rather than hinging at its root. A second,
 * quicker spring bends only the outer end, which is what makes the tip flick.
 */
const SWAY = { frequency: 2.4, damping: 0.11 }
const FLICK = { frequency: 5.2, damping: 0.16 }
/** How much lag an acceleration produces, over what physics would give: a cartoon's antennae are heavier at the tip than a real stalk. */
const GAIN = 2.2
/** Furthest an antenna bends, radians. */
const LIMIT = 0.7
/** No acceleration larger than this is believed (metres per second squared): a camera cut or a dropped frame is not a blow to the head. */
const MAX_ACCELERATION = 30

type State = {
  antenna: Antenna
  /** Two directions at right angles to the antenna, in the head's space: the bend is tracked along each. */
  side: THREE.Vector3
  fore: THREE.Vector3
  sway: [Spring, Spring]
  flick: [Spring, Spring]
  /** Where the tip was, and how fast it was going, in world space. */
  at: THREE.Vector3
  velocity: THREE.Vector3
  primed: boolean
}

export function makeAntennae(rig: Rig, antennae: Antenna[]) {
  const head = rig.bones.head
  const states: State[] = antennae.map((antenna) => {
    const side = new THREE.Vector3(1, 0, 0).addScaledVector(antenna.axis, -antenna.axis.x).normalize()
    return {
      antenna,
      side,
      fore: new THREE.Vector3().crossVectors(antenna.axis, side),
      sway: [
        { x: 0, v: 0 },
        { x: 0, v: 0 },
      ],
      flick: [
        { x: 0, v: 0 },
        { x: 0, v: 0 },
      ],
      at: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      primed: false,
    }
  })

  const tip = new THREE.Vector3()
  const velocity = new THREE.Vector3()
  const acceleration = new THREE.Vector3()
  const headTurn = new THREE.Quaternion()
  const bend = new THREE.Vector3()
  const axis = new THREE.Vector3()

  const pose = (state: State) => {
    const { bones } = state.antenna
    // The whole stalk leans with the slow spring; the outer end adds the quick one
    for (let i = 0; i < bones.length; i++) {
      const outer = (i + 1) / bones.length
      const share = 1 / bones.length
      bend
        .copy(state.side)
        .multiplyScalar((state.sway[0].x * share + state.flick[0].x * share * outer * 2) / state.antenna.length)
        .addScaledVector(state.fore, (state.sway[1].x * share + state.flick[1].x * share * outer * 2) / state.antenna.length)
      // Leaning the stalk toward `bend` is a turn about the direction at right angles to both
      axis.crossVectors(state.antenna.axis, bend)
      const angle = Math.min(axis.length(), LIMIT / bones.length)
      if (angle < 1e-6) bones[i].quaternion.identity()
      else bones[i].quaternion.setFromAxisAngle(axis.normalize(), angle)
    }
  }

  return {
    /** Call after the head has been posed for the frame. */
    update(dt: number) {
      if (dt <= 0) return
      head.updateWorldMatrix(true, false)
      head.getWorldQuaternion(headTurn).invert()
      for (const state of states) {
        tip.copy(state.antenna.tip).applyMatrix4(head.matrixWorld)
        if (!state.primed) {
          state.at.copy(tip)
          state.velocity.set(0, 0, 0)
          state.primed = true
        }
        velocity.copy(tip).sub(state.at).divideScalar(Math.max(dt, 1 / 240))
        acceleration.copy(velocity).sub(state.velocity).divideScalar(Math.max(dt, 1 / 240)).clampLength(0, MAX_ACCELERATION)
        state.at.copy(tip)
        state.velocity.copy(velocity)
        // In the head's own space, across the antenna
        acceleration.applyQuaternion(headTurn)
        for (let k = 0; k < 2; k++) {
          const across = acceleration.dot(k === 0 ? state.side : state.fore)
          stepSpring(state.sway[k], lagUnderAcceleration(across, SWAY.frequency) * GAIN, dt, SWAY.frequency, SWAY.damping)
          stepSpring(state.flick[k], lagUnderAcceleration(across, FLICK.frequency) * GAIN, dt, FLICK.frequency, FLICK.damping)
        }
        pose(state)
      }
    },
    /** A knock: sets them wobbling as if the chair had just been put down. */
    kick(strength: number) {
      for (const state of states) {
        state.sway[1].v += strength * state.antenna.length * 12
        state.flick[1].v -= strength * state.antenna.length * 8
      }
    },
    /** Stands them still and straight (reduced motion). */
    rest() {
      for (const state of states) {
        for (const spring of [...state.sway, ...state.flick]) {
          spring.x = 0
          spring.v = 0
        }
        state.primed = false
        pose(state)
      }
    },
  }
}
