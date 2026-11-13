import * as THREE from 'three'
import type { Ground } from './ground'
import { solveTwoBone, solveTwoBoneAtHeight, type Vec3 } from './maths/ik'
import type { Body, Hand } from './measure'
import { BEER } from './props/beer'
import type { ChairSeat, ChairSpec } from './props/chair'
import type { BoneRole, Rig } from './rig'

/**
 * Sitting him in the chair, as he sits in the reference picture: slouched
 * well back, legs stretched out in front and crossed at the ankles with the
 * heels on the regolith, one hand hanging off the end of an arm of the chair
 * and the other holding a bottle of beer on the end of the other arm.
 *
 * The model comes standing in an A-pose, and the clips that come with it sit
 * him upright on a stool, so the pose is built here, from his measurements
 * and the chair's, by placing the pelvis on the webbing and solving outward
 * from it: spine along the chair's back, each thigh on the seat and each heel
 * on the ground, the idle hand over the end of its arm, and the other hand
 * wherever the bottle has to be. Nothing in it is particular to one model: every
 * length and position is read off the skeleton and the mesh.
 *
 * `seatPose` writes one pose into the skeleton for one set of `PoseParams`;
 * the clips (clips.ts) are this pose sampled as those parameters move.
 * Everything is in the actor's space: metres, +Y up, he faces +Z, +X is his left.
 */

/**
 * Which hand holds the beer. In the picture it is the hand further from the
 * camera, which looks at him from his front-right: his left.
 */
export const BEER_SIDE: 'left' | 'right' = 'left'

/** What moves, from one moment of a clip to the next. All zero is the pose at rest. */
export type PoseParams = {
  /** Breath: -1 emptied, +1 full. */
  breath: number
  /** The pelvis: sinking into the webbing (metres), sliding sideways (metres), rolling (radians, + toward his left). */
  sink: number
  slide: number
  roll: number
  /** Extra lean of the upper body, radians: + back into the chair. */
  lean: number
  /** Turn of the chest about the spine, radians: + toward his left. */
  twist: number
  /** Shoulders lifting, 0..1. */
  shrug: number
  /** The head, radians, on top of its rest attitude: + up, + toward his left, + ear toward his left shoulder. */
  headPitch: number
  headYaw: number
  headRoll: number
  /** The bottle: 0 at rest on the end of the chair's arm, 1 at his mouth. */
  raise: number
  /** How far the bottle is tipped up for drinking, 0..1. */
  tip: number
  /** The upper foot rocking on the lower, radians. */
  waggle: number
}

export const REST: PoseParams = { breath: 0, sink: 0, slide: 0, roll: 0, lean: 0, twist: 0, shrug: 0, headPitch: 0, headYaw: 0, headRoll: 0, raise: 0, tip: 0, waggle: 0 }

/** The attitude: how far back he lies, and how much of that is the pelvis tipping. */
const RECLINE = 0.46
const PELVIS_TILT = 0.38
/** His chin is carried a touch up, as someone looking out over a landscape carries it. */
const CHIN_UP = 0.03
/** How far forward of the foot of the chair's back his seat has slid: the slouch. */
const SLOUCH = 0.06
/** How far each foot is tipped back on its heel, radians. */
const TOES_UP = 0.4

/** A chair that fits him: low, sized from his own proportions so his heels reach the ground with his legs stretched and his elbows reach the arms. */
export function fitChair(body: Body): ChairSpec {
  const tube = 0.0105
  const seatTilt = 0.17
  // Roomy: he does not fill it
  const seatWidth = 2 * (body.hipHalfWidth + 0.07)
  // Deep enough to carry most of his thighs: his knees are well out past the front rail
  const seatDepth = body.seatBack + SLOUCH + body.thigh * 0.78
  // Low: his shins slope down from knees not much higher than the seat
  const seatHeight = body.ankle + body.shin * 0.5
  // The back comes up behind his head as far as the back of his skull allows
  const backLength = body.thighRadius + (body.joint.head.y - body.joint.leftUpLeg.y) + THREE.MathUtils.clamp(0.26 - body.headBack, 0.04, 0.14)
  // The arms are where his elbows come to rest
  const seatRear = seatHeight - seatDepth * Math.sin(seatTilt)
  const shoulder = seatRear + body.thighRadius + (body.joint.leftUpperArm.y - body.joint.leftUpLeg.y) * Math.cos(RECLINE)
  const armHeight = shoulder - body.upperArm * Math.cos(0.5) - body.elbowRadius
  const usable = seatWidth - 2 * tube - 0.012
  return { seatWidth, seatDepth, seatHeight, seatTilt, backLength, recline: RECLINE, armHeight, tube, strap: usable / 5 / 1.22 }
}

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

const arr = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z]
const vec = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2])
const about = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle)

export type Poser = ReturnType<typeof makePoser>

/** The bottle as the pose needs it: where it sits in the closed hand in the bind pose (model space), and which way round it his wrist is (the bottle's own space). */
export type BeerHold = { matrix: THREE.Matrix4; wrist: THREE.Vector3 }

/**
 * Sets up the pose for one rig in one chair. `chairLift` is how far the chair
 * was lowered onto the curved ground.
 */
export function makePoser(rig: Rig, body: Body, seat: ChairSeat, chairLift: number, ground: Ground, hands: { left: Hand | null; right: Hand | null }, beer: BeerHold | null) {
  const bones = rig.bones
  const toModel = new THREE.Matrix4().copy(rig.object.matrixWorld).invert()
  const modelTurn = rig.object.getWorldQuaternion(new THREE.Quaternion()).invert()

  // The bind pose, in model space
  rig.object.updateMatrixWorld(true)
  const bindQ = {} as Record<BoneRole, THREE.Quaternion>
  const bindM = {} as Record<BoneRole, THREE.Matrix4>
  for (const role of Object.keys(bones) as BoneRole[]) {
    bindM[role] = new THREE.Matrix4().multiplyMatrices(toModel, bones[role].matrixWorld)
    bindQ[role] = new THREE.Quaternion().setFromRotationMatrix(bindM[role])
  }

  // -- small tools for moving bones about in model space --
  const worldQ = (bone: THREE.Object3D) => modelTurn.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()))
  const worldP = (bone: THREE.Object3D) => bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(toModel)
  /** Gives a bone an orientation in model space. */
  const setWorldQ = (bone: THREE.Object3D, q: THREE.Quaternion) => {
    const parent = bone.parent ? worldQ(bone.parent) : new THREE.Quaternion()
    bone.quaternion.copy(parent.invert().multiply(q))
    bone.updateMatrixWorld(true)
  }
  /** Turns a bone by a rotation given in model space. */
  const turn = (bone: THREE.Object3D, q: THREE.Quaternion) => setWorldQ(bone, q.clone().multiply(worldQ(bone)))
  /** Swings a bone the short way round so that `child` points at `target`. */
  const aim = (bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) => {
    const at = worldP(bone)
    const from = worldP(child).sub(at).normalize()
    const to = target.clone().sub(at).normalize()
    turn(bone, new THREE.Quaternion().setFromUnitVectors(from, to))
  }

  // -- where things are --
  const surfaceNormal = new THREE.Vector3()
  /** A point on the chair's webbing, lowered with the chair onto the ground. */
  const onSeat = (u: number, x: number, normal?: THREE.Vector3) => {
    const point = seat.surface(u, x, new THREE.Vector3(), normal ?? surfaceNormal)
    point.y += chairLift
    return point
  }
  const hipMidBind = body.joint.leftUpLeg.clone().add(body.joint.rightUpLeg).multiplyScalar(0.5)
  const hipsFromMid = body.joint.hips.clone().sub(hipMidBind)
  const armTop = seat.arm.y + chairLift
  const hipU = seat.fold + body.seatBack * 0.55 + 0.03 + SLOUCH
  const kneeU = seat.length - 0.02
  const beerSign = BEER_SIDE === 'left' ? 1 : -1
  const beerRole = BEER_SIDE === 'left' ? ('leftHand' as const) : ('rightHand' as const)

  /** The bottle's transform (its origin is the middle of its base) for a given `raise` and `tip`. */
  const beerMatrix = (() => {
    if (!beer) return null
    /** The turn about the bottle's own axis that puts his wrist on a given side of it (an angle from ahead toward his left). */
    const wristAt = (angle: number) => about(Y, angle - Math.atan2(beer.wrist.x, beer.wrist.z))
    // At rest: standing on the end of the chair's arm in his fist, his wrist behind it and a little to the outside
    const restAt = new THREE.Vector3(beerSign * seat.arm.x, armTop + 0.003, seat.arm.front - 0.03)
    const restQ = about(Z, 0.04 * beerSign)
      .multiply(about(X, -0.06))
      .multiply(wristAt(Math.atan2(0.35 * beerSign, -1)))
    const position = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const scale = new THREE.Vector3(1, 1, 1)
    const lip = new THREE.Vector3()
    const out = new THREE.Matrix4()
    return (raise: number, tip: number, mouth: THREE.Vector3, headQ: THREE.Quaternion) => {
      // At his mouth: the bottle laid back past level, its mouth on his and its base in front and above, higher the more he tips it.
      // His hand comes to it from his own side and below.
      const tilt = 0.08 + 0.42 * tip
      const sipQ = headQ
        .clone()
        .multiply(about(X, -(Math.PI / 2 + tilt)))
        .multiply(wristAt(Math.atan2(0.8 * beerSign, -0.6)))
      lip.set(0, BEER.height - 0.004, 0).applyQuaternion(sipQ)
      const s = raise * raise * (3 - 2 * raise)
      position.copy(mouth).sub(lip).lerp(restAt, 1 - s)
      // The way up swings out and forward, not straight through his chest
      const arc = Math.sin(Math.PI * raise)
      position.x += 0.03 * arc * beerSign
      position.z += 0.04 * arc
      q.slerpQuaternions(restQ, sipQ, s)
      return out.compose(position, q, scale)
    }
  })()
  const beerBindInverse = beer ? beer.matrix.clone().invert() : null

  const feet = { left: new THREE.Vector3(), right: new THREE.Vector3() }
  const headAt = new THREE.Vector3()
  const mouthLocal = body.mouth.clone().applyMatrix4(bindM.head.clone().invert())
  /** How high an ankle rides when its foot is tipped back on the heel. */
  const heelRide = body.ankle * Math.cos(TOES_UP) + body.heel * Math.sin(TOES_UP)

  /** An arm at rest: elbow on the arm of the chair, hand hanging off the end of it. */
  function hangArm(sign: number) {
    const left = sign > 0
    const upper = left ? bones.leftUpperArm : bones.rightUpperArm
    const fore = left ? bones.leftForeArm : bones.rightForeArm
    const handBone = left ? bones.leftHand : bones.rightHand
    const hand = left ? hands.left : hands.right
    const handRole = left ? ('leftHand' as const) : ('rightHand' as const)
    const foreRole = left ? ('leftForeArm' as const) : ('rightForeArm' as const)
    const shoulder = worldP(upper)
    const wrist = new THREE.Vector3(sign * (seat.arm.x - 0.002), armTop + body.wristRadius + 0.006, seat.arm.front - 0.012)
    const solved = solveTwoBoneAtHeight(arr(shoulder), arr(wrist), body.upperArm, body.foreArm, [sign * 0.5, -1, -0.4], armTop + body.elbowRadius)
    aim(upper, fore, vec(solved.mid))
    aim(fore, handBone, vec(solved.end))
    if (hand) {
      // The hand falls from the wrist: fingers down and a little forward, palm toward the chair
      const fingers = new THREE.Vector3(-0.1 * sign, -0.86, 0.5).normalize()
      const palm = new THREE.Vector3(-0.2 * sign, -0.45, -0.87)
      setWorldQ(handBone, frameTurn(hand.fingers, hand.palm, fingers, palm).multiply(bindQ[handRole]))
      shareTwist(fore, handBone, bindQ[foreRole], bindQ[handRole])
    }
  }

  /** Writes the pose for `p` into the skeleton. */
  function seatPose(p: PoseParams) {
    for (const { bone, position, quaternion } of rig.rest) {
      bone.position.copy(position)
      bone.quaternion.copy(quaternion)
    }
    rig.object.updateMatrixWorld(true)

    // Pelvis: on the webbing, slid forward and tipped back
    const seatPoint = onSeat(hipU, p.slide)
    const hipMid = seatPoint.addScaledVector(surfaceNormal, body.thighRadius * 0.9 - p.sink)
    const pelvis = about(Z, p.roll).multiply(about(X, -PELVIS_TILT - p.lean * 0.3))
    setWorldQ(bones.hips, pelvis.clone().multiply(bindQ.hips))
    // The hips bone hangs straight off the model's root, so its position is in model space
    bones.hips.position.copy(hipMid.clone().add(hipsFromMid.clone().applyQuaternion(pelvis)))
    bones.hips.updateMatrixWorld(true)

    // Spine: each joint takes a little more of the lean, so his back lies along the chair's
    const mid = bones.chest.parent && bones.chest.parent !== bones.spine ? bones.chest.parent : null
    const extra = RECLINE - PELVIS_TILT
    turn(bones.spine, about(X, -(extra * 0.5 + p.lean * 0.3) + p.breath * 0.006))
    if (mid) turn(mid, about(X, -(extra * 0.5 + p.lean * 0.25) + p.breath * 0.01))
    turn(bones.chest, about(Y, p.twist).multiply(about(X, 0.1 - p.lean * 0.15 + p.breath * 0.012)).multiply(about(Z, -p.roll * 0.8)))

    // Head: held level whatever the chair does to his back, with the neck sharing the turn
    const headTurn = about(Y, p.headYaw).multiply(about(X, -p.headPitch - CHIN_UP)).multiply(about(Z, p.headRoll))
    const chestLean = worldQ(bones.chest).multiply(bindQ.chest.clone().invert())
    const neckTurn = chestLean.clone().slerp(headTurn, 0.5)
    setWorldQ(bones.neck, neckTurn.multiply(bindQ.neck))
    setWorldQ(bones.head, headTurn.clone().multiply(bindQ.head))
    headAt.copy(worldP(bones.head))

    // Shoulders: lifted by breath and by a shrug
    for (const side of [1, -1]) turn(side > 0 ? bones.leftShoulder : bones.rightShoulder, about(Z, side * (p.breath * 0.02 + p.shrug * 0.22)))

    // Legs: stretched out, crossed at the ankles. The left lies underneath, heel on the ground; the right rests across it.
    const under = { ankle: new THREE.Vector3() }
    for (const side of [1, -1]) {
      const left = side > 0
      const upLeg = left ? bones.leftUpLeg : bones.rightUpLeg
      const leg = left ? bones.leftLeg : bones.rightLeg
      const foot = left ? bones.leftFoot : bones.rightFoot
      const hip = worldP(upLeg)
      let ankle: THREE.Vector3
      if (left) {
        // The heel goes as far forward as lets the thigh rest on the front of the seat
        const footX = -0.018
        const kneeRest = onSeat(kneeU, hip.x).y + body.kneeRadius * 1.25
        const ankleAt = (z: number) => new THREE.Vector3(footX, ground.height(footX, z) + heelRide - 0.006, z)
        const kneeFor = (z: number) => solveTwoBone(arr(hip), arr(ankleAt(z)), body.thigh, body.shin, [0.15, 1, 0.2]).mid[1]
        let near = hip.z + 0.05
        let far = hip.z + (body.thigh + body.shin) * 0.985
        for (let i = 0; i < 24; i++) {
          const z = (near + far) / 2
          if (kneeFor(z) > kneeRest) near = z
          else far = z
        }
        ankle = ankleAt((near + far) / 2)
        under.ankle.copy(ankle)
      } else {
        // Across the other shin, just above its ankle
        ankle = under.ankle.clone().add(new THREE.Vector3(0.062, body.kneeRadius * 1.4, -0.045))
      }
      const knee = vec(solveTwoBone(arr(hip), arr(ankle), body.thigh, body.shin, [side * 0.15, 1, 0.2]).mid)
      aim(upLeg, leg, knee)
      aim(leg, foot, ankle)
      // Feet tipped back on their heels and fallen outward, the upper one rocking a little
      const fall = left ? 0.6 : -0.25
      const rock = left ? 0 : p.waggle
      const footTurn = about(Y, fall).multiply(about(Z, -fall * 0.6 + rock * 0.5)).multiply(about(X, -TOES_UP - rock))
      setWorldQ(foot, footTurn.multiply(bindQ[left ? 'leftFoot' : 'rightFoot']))
      feet[left ? 'left' : 'right'].copy(ankle)
    }

    // The idle arm hangs off its arm of the chair; the other goes where the bottle is
    hangArm(-beerSign)
    const beerHand = BEER_SIDE === 'left' ? hands.left : hands.right
    if (beerMatrix && beerBindInverse && beerHand) {
      const upper = BEER_SIDE === 'left' ? bones.leftUpperArm : bones.rightUpperArm
      const fore = BEER_SIDE === 'left' ? bones.leftForeArm : bones.rightForeArm
      const handBone = bones[beerRole]
      const shoulder = worldP(upper)
      const headQ = worldQ(bones.head).multiply(bindQ.head.clone().invert())
      const mouth = mouthLocal.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toModel, bones.head.matrixWorld))
      const handMatrix = beerMatrix(p.raise, p.tip, mouth, headQ).clone().multiply(beerBindInverse).multiply(bindM[beerRole])
      const wrist = new THREE.Vector3().setFromMatrixPosition(handMatrix)
      const handQ = new THREE.Quaternion().setFromRotationMatrix(handMatrix)
      // At rest the elbow lies on the chair's arm; as the bottle rises it lifts off and swings out
      const s = p.raise * p.raise * (3 - 2 * p.raise)
      const resting: Vec3 = [beerSign * 0.5, -1, -0.4]
      const lifted: Vec3 = [beerSign, -0.55, -0.15]
      const free = solveTwoBone(arr(shoulder), arr(wrist), body.upperArm, body.foreArm, lifted)
      const rested = solveTwoBoneAtHeight(arr(shoulder), arr(wrist), body.upperArm, body.foreArm, resting, armTop + body.elbowRadius)
      const height = THREE.MathUtils.lerp(rested.mid[1], free.mid[1], s)
      const solved = solveTwoBoneAtHeight(arr(shoulder), arr(wrist), body.upperArm, body.foreArm, s < 0.5 ? resting : lifted, height)
      aim(upper, fore, vec(solved.mid))
      aim(fore, handBone, vec(solved.end))
      setWorldQ(handBone, handQ)
      shareTwist(fore, handBone, bindQ[BEER_SIDE === 'left' ? 'leftForeArm' : 'rightForeArm'], bindQ[beerRole])
    } else {
      hangArm(beerSign)
    }
    rig.object.updateMatrixWorld(true)
  }

  /** The rotation that carries one pair of directions (fingers, palm) onto another. */
  function frameTurn(fromA: THREE.Vector3, fromB: THREE.Vector3, toA: THREE.Vector3, toB: THREE.Vector3) {
    const basis = (a: THREE.Vector3, b: THREE.Vector3) => {
      const x = a.clone().normalize()
      const z = new THREE.Vector3().crossVectors(x, b).normalize()
      const y = new THREE.Vector3().crossVectors(z, x)
      return new THREE.Matrix4().makeBasis(x, y, z)
    }
    const from = basis(fromA, fromB)
    const to = basis(toA, toB)
    return new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose()))
  }

  /**
   * A hand turned about the line of the forearm wrings the wrist like a
   * sweet wrapper, because the skin there follows only two bones. Half of
   * that turn is given to the forearm instead, as a real forearm would take it.
   */
  function shareTwist(foreArm: THREE.Bone, hand: THREE.Bone, foreArmBind: THREE.Quaternion, handBind: THREE.Quaternion) {
    const handQ = worldQ(hand)
    const axis = worldP(hand).sub(worldP(foreArm)).normalize()
    // The hand's turn relative to the forearm, compared with the bind pose
    const foreArmTurn = worldQ(foreArm).multiply(foreArmBind.clone().invert())
    const handTurn = handQ.clone().multiply(handBind.clone().invert())
    const relative = foreArmTurn.clone().invert().multiply(handTurn)
    // Its part about the forearm's own line (swing-twist decomposition)
    const local = axis.clone().applyQuaternion(foreArmTurn.clone().invert())
    const projection = new THREE.Vector3(relative.x, relative.y, relative.z).dot(local)
    const angle = 2 * Math.atan2(projection, relative.w)
    const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle))
    turn(foreArm, about(axis, wrapped * 0.5))
    setWorldQ(hand, handQ)
  }

  return {
    seatPose,
    /** Where his ankles are after the last pose, for the contact shadows under his heels. */
    feet,
    /** Where the head joint is after the last pose. */
    headAt,
  }
}
