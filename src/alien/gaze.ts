import * as THREE from 'three'
import { DAMP, damp } from '../motion/tokens'
import { lookAngles, type LookAngles } from './maths/look'
import type { Rig } from './rig'

/**
 * Looking at things. Whatever the clips have done with his head this frame,
 * this turns it a little further toward a point: the cursor, or a pin being
 * hovered. The turn is worked out as a yaw and a pitch in his own frame, held
 * inside what a neck can do (maths/look.ts), eased toward over time, and then
 * shared down the spine: the chest gives a little, the neck more, the head
 * most. His eyes get there first and his head follows, which is how anything
 * with eyes looks at anything.
 *
 * It is applied on top of the animation, so it must start each frame from
 * what the animation wrote, not from what it left behind itself last frame:
 * `begin` puts the three bones back before the mixer runs.
 */
const SHARE = [0.12, 0.33, 0.55]
/** A glance is quicker than a look. */
const GLANCE_TAU = 0.1
const EYES_TAU = 0.06
/** How quickly the whole behaviour fades in and out as targets come and go. */
const WEIGHT_TAU = 0.35

export function makeGaze(rig: Rig, root: THREE.Object3D) {
  const chain = [rig.bones.chest, rig.bones.neck, rig.bones.head]
  const base = chain.map((bone) => bone.quaternion.clone())
  const angles: LookAngles = { yaw: 0, pitch: 0 }
  let yaw = 0
  let pitch = 0
  let eyeYaw = 0
  let eyePitch = 0
  let weight = 0
  let asked = 0

  const rootTurn = new THREE.Quaternion()
  const rootTurnInverse = new THREE.Quaternion()
  const headAt = new THREE.Vector3()
  const toTarget = new THREE.Vector3()
  const turn = new THREE.Quaternion()
  const part = new THREE.Quaternion()
  const pitchTurn = new THREE.Quaternion()
  const parentTurn = new THREE.Quaternion()
  const identity = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3(1, 0, 0)

  return {
    /** Before the mixer: undo last frame's turn, so the clips start from their own pose. */
    begin() {
      for (let i = 0; i < chain.length; i++) chain[i].quaternion.copy(base[i])
    },
    /**
     * After the mixer: turn toward `glanceAt` if there is one, else `lookAt`,
     * else let the head go back to the animation. `allow` (0..1) is how much
     * of the turn the current clip leaves room for.
     */
    apply(dt: number, lookAt: THREE.Vector3 | null, glanceAt: THREE.Vector3 | null, allow: number) {
      for (let i = 0; i < chain.length; i++) base[i].copy(chain[i].quaternion)
      const target = glanceAt ?? lookAt
      root.getWorldQuaternion(rootTurn)
      rootTurnInverse.copy(rootTurn).invert()
      if (target) {
        rig.bones.head.getWorldPosition(headAt)
        toTarget.copy(target).sub(headAt).applyQuaternion(rootTurnInverse)
        lookAngles(toTarget.x, toTarget.y, toTarget.z, asked, angles)
        asked = angles.yaw
      }
      weight = damp(weight, target ? allow : 0, WEIGHT_TAU, dt)
      const tau = glanceAt ? GLANCE_TAU : DAMP.look
      if (target) {
        // The eyes go first; the head follows the eyes
        eyeYaw = damp(eyeYaw, angles.yaw, EYES_TAU, dt)
        eyePitch = damp(eyePitch, angles.pitch, EYES_TAU, dt)
        yaw = damp(yaw, angles.yaw, tau, dt)
        pitch = damp(pitch, angles.pitch, tau, dt)
      } else {
        eyeYaw = damp(eyeYaw, yaw, EYES_TAU, dt)
        eyePitch = damp(eyePitch, pitch, EYES_TAU, dt)
      }
      if (weight < 1e-4) return

      // The turn in his own frame, then in the world's
      turn.setFromAxisAngle(up, yaw * weight)
      pitchTurn.setFromAxisAngle(right, -pitch * weight)
      turn.multiply(pitchTurn)
      turn.premultiply(rootTurn).multiply(rootTurnInverse)
      for (let i = 0; i < chain.length; i++) {
        const bone = chain[i]
        part.copy(identity).slerp(turn, SHARE[i])
        // A turn given in the world, applied to a bone inside the skeleton
        if (bone.parent) bone.parent.getWorldQuaternion(parentTurn)
        else parentTurn.identity()
        bone.quaternion.premultiply(parentTurn).premultiply(part)
        bone.quaternion.premultiply(parentTurn.invert())
      }
    },
    /** How far his eyes are turned beyond his head, radians: for the irises. */
    eyes: (out: THREE.Vector2) => out.set((eyeYaw - yaw) * weight, (eyePitch - pitch) * weight),
  }
}
