import * as THREE from 'three'
import { ENV_EARTH_DIRECTION } from './env'
import { REST, type PoseParams, type Poser } from './pose'
import type { Rig } from './rig'

/**
 * His animation, as clips for an AnimationMixer. Each is the seated pose
 * (pose.ts) sampled while a few parameters move: breath, the lean of his
 * back, where the bottle is. Sampling the solved pose into keyframes means the
 * mixer can cross-fade the clips like any others, and that nothing is solved
 * while the page is running.
 *
 *  - idle: loops. Breathing, and the small drift of a head that is not held still.
 *  - sip: the bottle comes up to his mouth, his head tips back, he drinks, lowers it, and lets out a breath.
 *  - lookUp: he looks up at the Earth for a while.
 *  - shift: he shifts his weight in the chair.
 *
 * Alongside the bones each clip moves a `driver` object, an empty whose
 * position carries values that are not bones (x: how far his eyelids are
 * lowered), so those cross-fade with everything else.
 */
const DRIVER_NAME = 'alien-driver'
const RATE = 24

type Key = [time: number, value: number]

/** A value over time through a list of keys, easing in and out of each. */
function through(keys: Key[], t: number) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1]
      const [t1, v1] = keys[i]
      const x = (t - t0) / Math.max(t1 - t0, 1e-6)
      return v0 + (v1 - v0) * x * x * x * (x * (x * 6 - 15) + 10)
    }
  }
  return keys[keys.length - 1][1]
}

type Motion = { name: string; duration: number; loop: boolean; at: (t: number) => Partial<PoseParams> & { lid?: number } }

const TAU = Math.PI * 2

const IDLE: Motion = {
  name: 'idle',
  duration: 8,
  loop: true,
  at(t) {
    // Two breaths a loop, drawn in a little quicker than they are let out
    const phase = (TAU * t) / 4
    return {
      breath: Math.sin(phase + 0.4 * Math.sin(phase)),
      headYaw: 0.035 * Math.sin((TAU * t) / 8),
      headRoll: 0.014 * Math.sin((TAU * t) / 8 + 1.3),
      headPitch: 0.014 * Math.sin(phase + 0.6),
      twist: 0.008 * Math.sin((TAU * t) / 8 + 0.4),
      // The bottle is never quite still in his hand, nor the foot that lies on top
      raise: 0.01 * (1 - Math.cos((TAU * t) / 8)),
      waggle: 0.07 * Math.sin((TAU * t) / 4 + 1) + 0.03 * Math.sin((TAU * t) / 2),
    }
  },
}

const SIP: Motion = {
  name: 'sip',
  duration: 3.5,
  loop: false,
  at: (t) => ({
    raise: through(
      [
        [0, 0],
        [0.95, 1],
        [2.15, 1],
        [3.05, 0],
      ],
      t,
    ),
    tip: through(
      [
        [0.7, 0],
        [1.2, 0.5],
        [1.95, 1],
        [2.3, 0.15],
        [2.8, 0],
      ],
      t,
    ),
    // A dip of the head to meet the bottle, back with it as he drinks, a nod as it comes down
    headPitch: through(
      [
        [0, 0],
        [0.5, -0.05],
        [1.2, 0.14],
        [1.95, 0.24],
        [2.5, 0.03],
        [3.0, -0.03],
        [3.5, 0],
      ],
      t,
    ),
    headYaw: through(
      [
        [0, 0],
        [0.9, -0.1],
        [2.1, -0.1],
        [3.0, 0],
      ],
      t,
    ),
    lean: through(
      [
        [0.6, 0],
        [1.9, 0.05],
        [2.7, 0],
        [3.15, 0.03],
        [3.5, 0],
      ],
      t,
    ),
    // He holds his breath to drink, then lets it go
    breath: through(
      [
        [0, 0],
        [0.9, 0.5],
        [2.2, 0.6],
        [3.1, -1],
        [3.5, 0],
      ],
      t,
    ),
    shrug: through(
      [
        [0, 0],
        [0.9, 0.12],
        [2.2, 0.12],
        [3.1, -0.1],
        [3.5, 0],
      ],
      t,
    ),
    lid: through(
      [
        [0.8, 0],
        [1.3, 0.4],
        [2.0, 0.45],
        [2.4, 0.1],
        [2.85, 0.1],
        [3.1, 0.75],
        [3.3, 0.7],
        [3.5, 0],
      ],
      t,
    ),
  }),
}

// Where the Earth is from his chair, as a turn of the head (short of the full angle: his eyes do the rest)
const EARTH_YAW = Math.atan2(ENV_EARTH_DIRECTION.x, ENV_EARTH_DIRECTION.z) * 0.85
const EARTH_PITCH = Math.asin(ENV_EARTH_DIRECTION.y) * 0.72

const LOOK_UP: Motion = {
  name: 'lookUp',
  duration: 4.8,
  loop: false,
  at: (t) => {
    const up = through(
      [
        [0, 0],
        [1.0, 1],
        [3.6, 1],
        [4.7, 0],
      ],
      t,
    )
    return {
      headYaw: EARTH_YAW * up,
      headPitch: EARTH_PITCH * up,
      headRoll: 0.05 * up + 0.015 * Math.sin(t * 1.3) * up,
      lean: 0.05 * up,
      twist: 0.07 * up,
      breath: through(
        [
          [0, 0],
          [1.2, 0.8],
          [3.4, -0.3],
          [4.8, 0],
        ],
        t,
      ),
    }
  },
}

const SHIFT: Motion = {
  name: 'shift',
  duration: 2.8,
  loop: false,
  at: (t) => ({
    // Up off the webbing on his arms, across, and down again with a small settle
    sink: through(
      [
        [0, 0],
        [0.55, -0.014],
        [1.15, -0.01],
        [1.7, 0.005],
        [2.2, -0.001],
        [2.8, 0],
      ],
      t,
    ),
    shrug: through(
      [
        [0, 0],
        [0.5, 0.55],
        [1.2, 0.4],
        [1.8, -0.05],
        [2.8, 0],
      ],
      t,
    ),
    slide: through(
      [
        [0.4, 0],
        [1.1, 0.012],
        [1.9, -0.003],
        [2.8, 0],
      ],
      t,
    ),
    roll: through(
      [
        [0.3, 0],
        [0.9, 0.05],
        [1.6, -0.02],
        [2.3, 0],
      ],
      t,
    ),
    lean: through(
      [
        [0, 0],
        [0.6, -0.07],
        [1.3, -0.04],
        [1.9, 0.03],
        [2.8, 0],
      ],
      t,
    ),
    twist: through(
      [
        [0.3, 0],
        [1.0, -0.06],
        [1.9, 0.015],
        [2.8, 0],
      ],
      t,
    ),
    headPitch: through(
      [
        [0, 0],
        [0.6, -0.08],
        [1.4, -0.04],
        [2.0, 0.03],
        [2.8, 0],
      ],
      t,
    ),
    headRoll: through(
      [
        [0.3, 0],
        [1.0, -0.05],
        [1.8, 0.01],
        [2.8, 0],
      ],
      t,
    ),
    // The foot on top lifts as he comes up and rocks back as he settles
    waggle: through(
      [
        [0.4, 0],
        [1.0, 0.22],
        [1.7, -0.08],
        [2.3, 0.04],
        [2.8, 0],
      ],
      t,
    ),
  }),
}

export type ClipSet = {
  idle: THREE.AnimationClip
  sip: THREE.AnimationClip
  beats: THREE.AnimationClip[]
  /** The empty whose position carries the non-bone values. Lives under the model's root. */
  driver: THREE.Object3D
}

/** `skip` lists bones the clips leave alone (the antennae, which are sprung rather than animated). */
export function bakeClips(rig: Rig, poser: Poser, skip: Set<THREE.Bone>): ClipSet {
  const driver = new THREE.Object3D()
  driver.name = DRIVER_NAME
  rig.object.add(driver)
  const bones = rig.mesh.skeleton.bones.filter((bone) => !skip.has(bone))
  const hips = rig.bones.hips

  const bake = (motion: Motion) => {
    const count = Math.round(motion.duration * RATE)
    const times = new Float32Array(count + 1)
    const rotations = bones.map(() => new Float32Array((count + 1) * 4))
    const hipsAt = new Float32Array((count + 1) * 3)
    const driverAt = new Float32Array((count + 1) * 3)
    const params: PoseParams = { ...REST }
    for (let i = 0; i <= count; i++) {
      const t = (motion.duration * i) / count
      times[i] = t
      const { lid = 0, ...moved } = motion.at(t)
      Object.assign(params, REST, moved)
      poser.seatPose(params)
      bones.forEach((bone, b) => bone.quaternion.toArray(rotations[b], i * 4))
      hips.position.toArray(hipsAt, i * 3)
      driverAt[i * 3] = lid
    }
    const tracks: THREE.KeyframeTrack[] = bones.map((bone, b) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, rotations[b]))
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, hipsAt))
    tracks.push(new THREE.VectorKeyframeTrack(`${DRIVER_NAME}.position`, times, driverAt))
    return new THREE.AnimationClip(motion.name, motion.duration, tracks)
  }

  const clips = { idle: bake(IDLE), sip: bake(SIP), beats: [bake(LOOK_UP), bake(SHIFT)], driver }
  poser.seatPose(REST)
  return clips
}
