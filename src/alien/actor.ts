import * as THREE from 'three'
import { makeAntennae } from './antennae'
import { bakeClips, type ClipSet } from './clips'
import { buildContactShadows, type Stamp } from './contact'
import { buildDust, type DustSite } from './dust'
import { makeEnvironment } from './env'
import { buildFace, type Face } from './face'
import { makeGaze } from './gaze'
import { makeGround } from './ground'
import { beerInHand, curlHand, DROOP, GRIP, unpackGeometry } from './hands'
import { makePropMaterials } from './materials'
import { BLINK_DURATION, blinkCurve, makeSchedule, type ScheduleEvents } from './maths/schedule'
import { findAntennae, findEyes, measureBody, measureHand, readCloud, readTexture } from './measure'
import { BEER_SIDE, fitChair, makePoser, REST } from './pose'
import { buildBeer } from './props/beer'
import { buildChair, DEFAULT_CHAIR } from './props/chair'
import { BOTTLE, BOTTLES, buildCooler, COOLER } from './props/cooler'
import { loadRig } from './rig'
import { makeSkin, measureCloth } from './skin'
import type { AlienActor, AlienInput, AlienOptions } from './types'

/** What the dev harness can reach that the moon scene has no business with. */
export type AlienDebug = {
  /** The named groups of the set, for showing one prop on its own. */
  parts: Record<string, THREE.Object3D>
  /**
   * Plays the harness's scripted moments from its query string (a sip, a
   * blink, a beat, a clip held at a time), calling `advance(seconds)` to run
   * the actor forward between them.
   */
  run?: (params: URLSearchParams, advance: (seconds: number) => void) => void
  /** Starts one thing by name, for the harness's buttons: sip, blink, puff, or an ambient beat. */
  trigger?: (name: string) => void
  /** A few numbers for the harness's readout. */
  info?: () => Record<string, string | number>
  /** Where the hand that holds the beer is, in world space: for framing a camera on it. */
  handWorld?: (out: THREE.Vector3) => THREE.Vector3
}

export type DebugActor = AlienActor & { debug: AlienDebug }

/** Where the cooler stands: on the side his beer is, a little forward of the chair, turned a little. */
const COOLER_AT = { x: 0.47, z: 0.2, yaw: -0.25 }
/** Seconds for one clip to give way to the next. */
const FADE_IN = 0.3
const FADE_OUT = 0.5
/** The same evening every time (see maths/schedule.ts). */
const SEED = 20261112

/** `models` is the folder the model and its manifest are fetched from (the harness points it elsewhere to see the set without him). */
export async function createActor(opts: AlienOptions, models = `${import.meta.env.BASE_URL}models/`): Promise<DebugActor> {
  const detail = opts.tier === 'ultra' || opts.tier === 'high' ? 'high' : 'low'
  const env = makeEnvironment(opts.renderer)
  const side = BEER_SIDE === 'left' ? 1 : -1
  const materials = makePropMaterials(env.texture, opts.tier)
  const ground = makeGround(opts.groundRadius)
  const disposers: (() => void)[] = [env.dispose, materials.dispose]

  const root = new THREE.Group()
  root.name = 'alien-actor'

  // ------------------------------------------------------------ the alien ----
  const rig = await loadRig(opts.renderer, models, opts.onProgress)

  let figure: {
    mixer: THREE.AnimationMixer
    clips: ClipSet
    idle: THREE.AnimationAction
    sip: THREE.AnimationAction
    beats: THREE.AnimationAction[]
    holdStill: () => void
    headCentre: THREE.Vector3
    feet: { left: THREE.Vector3; right: THREE.Vector3 }
    gaze: ReturnType<typeof makeGaze>
    antennae: ReturnType<typeof makeAntennae>
    face: Face | null
  } | null = null
  let spec = DEFAULT_CHAIR

  if (rig) {
    root.add(rig.object)
    rig.object.updateMatrixWorld(true)
    rig.mesh.castShadow = true
    rig.mesh.receiveShadow = true
    // The bounds three.js keeps for a skinned mesh are of the bind pose; he is small and always in shot
    rig.mesh.frustumCulled = false
  }
  const cloud = rig ? readCloud(rig) : null
  const body = rig && cloud ? measureBody(rig, cloud) : null
  if (body) spec = fitChair(body)

  const chair = buildChair(spec, materials, detail)
  disposers.push(chair.dispose)
  // The bars it stands on are straight and the ground is not: lower the chair until their ends touch
  chair.group.position.y = ground.height(chair.seat.feet.x, chair.seat.feet.front)
  root.add(chair.group)

  const beer = buildBeer(materials, detail)
  disposers.push(beer.dispose)

  if (rig && cloud && body) {
    // Skin, eyes and antennae: all found on the model as it stands in its bind pose
    const painted = (Array.isArray(rig.mesh.material) ? rig.mesh.material[0] : rig.mesh.material) as THREE.MeshStandardMaterial
    const texture = painted.map ? readTexture(opts.renderer, painted.map) : null
    const colours = measureCloth(rig, cloud, texture)
    const skin = makeSkin(painted, colours)
    rig.mesh.material = skin
    disposers.push(() => {
      skin.map?.dispose()
      skin.normalMap?.dispose()
      skin.dispose()
      rig.mesh.geometry.dispose()
    })
    const eyes = findEyes(rig, cloud, texture)
    const face = buildFace(rig, eyes, env.texture, skin, colours.skin)
    if (face) {
      materials.reflective.push(face.eyeMaterial)
      disposers.push(face.dispose)
    }
    const antennaChains = findAntennae(rig)
    const antennae = makeAntennae(rig, antennaChains)
    const gaze = makeGaze(rig, root)

    unpackGeometry(rig.mesh.geometry)
    const hands = { left: measureHand(rig, cloud, 'left'), right: measureHand(rig, cloud, 'right') }
    const holding = BEER_SIDE === 'left' ? hands.left : hands.right
    const hanging = BEER_SIDE === 'left' ? hands.right : hands.left
    if (holding) curlHand(rig, cloud, holding, GRIP)
    if (hanging) curlHand(rig, cloud, hanging, DROOP)
    // The bottle goes in his hand, exactly where the fingers were closed round it
    const hold = holding ? beerInHand(holding, cloud) : null
    if (hold) {
      const handBone = rig.bones[BEER_SIDE === 'left' ? 'leftHand' : 'rightHand']
      const inHand = new THREE.Matrix4().copy(rig.object.matrixWorld).invert().multiply(handBone.matrixWorld).invert().multiply(hold.matrix)
      inHand.decompose(beer.group.position, beer.group.quaternion, beer.group.scale)
      handBone.add(beer.group)
    }

    // The middle of his head, in the head bone's own space (worked out now, while the skeleton is still in its bind pose)
    const headCentre = body.joint.head.clone().add(new THREE.Vector3(0, body.height * 0.1, 0.02))
    headCentre.applyMatrix4(new THREE.Matrix4().copy(rig.object.matrixWorld).invert().multiply(rig.bones.head.matrixWorld).invert())

    const poser = makePoser(rig, body, chair.seat, chair.group.position.y, ground, hands, hold)
    const clips = bakeClips(rig, poser, new Set(antennaChains.flatMap((antenna) => antenna.bones)))
    const mixer = new THREE.AnimationMixer(rig.object)
    const once = (clip: THREE.AnimationClip) => {
      const action = mixer.clipAction(clip)
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      return action
    }
    const idle = mixer.clipAction(clips.idle)
    idle.play()

    poser.seatPose(REST)
    figure = {
      mixer,
      clips,
      idle,
      sip: once(clips.sip),
      beats: clips.beats.map(once),
      holdStill: () => poser.seatPose(REST),
      headCentre,
      feet: { left: poser.feet.left.clone(), right: poser.feet.right.clone() },
      gaze,
      antennae,
      face,
    }
  }
  if (!beer.group.parent) {
    // Nobody to hold it: the bottle stands on the arm of the chair, its label to the front and a little outward
    beer.group.position.set(side * chair.seat.arm.x, chair.group.position.y + chair.seat.arm.y, chair.seat.arm.front - 0.06)
    beer.group.rotation.y = -side * 0.5
    root.add(beer.group)
  }

  // ------------------------------------------------------------ the props ----
  const cooler = buildCooler(materials, detail)
  disposers.push(cooler.dispose)
  ground.place(cooler.group, side * COOLER_AT.x, COOLER_AT.z, side * COOLER_AT.yaw)
  root.add(cooler.group)

  // Contact shadows: under the two bars the chair stands on, his heels, the cooler and the bottles
  const stamps: Stamp[] = []
  const { feet: bars } = chair.seat
  for (const z of [bars.front, bars.rear]) stamps.push({ x: 0, z, halfWidth: bars.x + 0.035, halfLength: 0.04, strength: 0.8 })
  stamps.push({ x: 0, z: (bars.front + bars.rear) / 2, halfWidth: bars.x + 0.08, halfLength: (bars.front - bars.rear) / 2 + 0.1, strength: 0.2 })
  if (figure && body) {
    for (const ankle of [figure.feet.left, figure.feet.right]) stamps.push({ x: ankle.x, z: ankle.z - body.heel * 0.3, halfWidth: 0.06, halfLength: 0.075, strength: 0.75 })
  }
  // Things standing beside the cooler are placed in its frame, turned with it
  const cos = Math.cos(side * COOLER_AT.yaw)
  const sin = Math.sin(side * COOLER_AT.yaw)
  const beside = (x: number, z: number) => ({ x: side * COOLER_AT.x + x * cos + z * sin, z: COOLER_AT.z - x * sin + z * cos })
  stamps.push({ ...beside(0, 0), halfWidth: COOLER.width / 2 + 0.045, halfLength: COOLER.depth / 2 + 0.045, yaw: side * COOLER_AT.yaw, strength: 0.7 })
  for (const [x, z] of BOTTLES) stamps.push({ ...beside(x, z), halfWidth: BOTTLE.radius + 0.025, halfLength: BOTTLE.radius + 0.025, strength: 0.7 })
  const contact = buildContactShadows(ground, stamps, materials.contact)
  disposers.push(contact.dispose)
  root.add(contact.mesh)

  // Dust leaves from where things stand on the ground: the bars under the chair, and his heels
  const sites: DustSite[] = []
  for (const z of [bars.front, bars.rear]) sites.push({ x: 0, z, halfWidth: bars.x, halfLength: 0.03, share: 3 })
  if (figure) sites.push({ x: (figure.feet.left.x + figure.feet.right.x) / 2, z: figure.feet.left.z, halfWidth: 0.07, halfLength: 0.06, share: 2 })
  const dust = buildDust(ground, sites, opts.tier)
  disposers.push(dust.dispose)
  root.add(dust.mesh)

  opts.onProgress?.(1, 1)
  const envLink = makeEnvLink(root, materials.reflective)

  // ------------------------------------------------------------ behaviour ----
  const schedule = makeSchedule(SEED, figure ? figure.clips.sip.duration : 0, figure ? figure.clips.beats.map((clip) => clip.duration) : [])
  const events: ScheduleEvents = { sip: false, blink: false, beat: -1 }
  let playing: THREE.AnimationAction | null = null
  let remaining = 0
  let held = false
  let wasStill = false
  let blinkAt = Infinity
  let revealed = 1
  let puffArmed = true
  const eyesAhead = new THREE.Vector2()

  const start = (action: THREE.AnimationAction) => {
    if (!figure || playing) return
    action.reset()
    action.setEffectiveTimeScale(1)
    action.setEffectiveWeight(1)
    action.play()
    figure.idle.crossFadeTo(action, FADE_IN, false)
    playing = action
    remaining = action.getClip().duration
    // Anything that starts moving starts with a blink
    blinkAt = 0
  }

  const puff = () => {
    dust.kick()
    figure?.antennae.kick(0.5)
  }

  const update = (dt: number, input: AlienInput) => {
    const radiance = envLink.update()
    if (!figure) return
    if (input.still) {
      if (!wasStill) {
        figure.holdStill()
        figure.antennae.rest()
        figure.face?.setLids(0)
        figure.face?.setGaze(0, 0)
        dust.mesh.visible = false
      }
      wasStill = true
      return
    }
    wasStill = false

    // The dust goes up as the reveal passes its middle, once each time he is revealed
    if (puffArmed && revealed < 0.5 && input.reveal >= 0.5) {
      puff()
      puffArmed = false
    } else if (input.reveal < 0.2) puffArmed = true
    revealed = input.reveal
    dust.update(dt, radiance)
    if (held) return

    schedule.step(dt, events)
    if (events.sip) start(figure.sip)
    else if (events.beat >= 0) start(figure.beats[events.beat])
    if (events.blink) blinkAt = 0

    let allow = 1
    if (playing) {
      // He does not look round much with a bottle at his lips
      allow = playing === figure.sip ? 0.2 : 0.5
      remaining -= dt
      if (remaining <= FADE_OUT) {
        // Hand back to the idle while the last moments of the clip play out
        figure.idle.enabled = true
        figure.idle.setEffectiveTimeScale(1)
        figure.idle.setEffectiveWeight(1)
        playing.crossFadeTo(figure.idle, FADE_OUT, false)
        playing = null
      }
    }
    figure.gaze.begin()
    figure.mixer.update(dt)
    figure.gaze.apply(dt, input.lookAt, input.glanceAt, allow)
    figure.antennae.update(dt)

    if (figure.face) {
      blinkAt += dt
      const blink = blinkAt < BLINK_DURATION ? blinkCurve(blinkAt) : 0
      figure.face.setLids(Math.max(blink, figure.clips.driver.position.x))
      figure.gaze.eyes(eyesAhead)
      figure.face.setGaze(eyesAhead.x, eyesAhead.y)
    }
  }

  const headWorld = (out: THREE.Vector3) => {
    if (!figure || !rig) return root.localToWorld(out.set(0, 0.8, 0))
    return rig.bones.head.localToWorld(out.copy(figure.headCentre))
  }

  return {
    root,
    footprint: 1.1,
    headWorld,
    update,
    dispose() {
      figure?.mixer.stopAllAction()
      if (rig) figure?.mixer.uncacheRoot(rig.object)
      for (const dispose of disposers) dispose()
    },
    debug: {
      parts: { chair: chair.group, cooler: cooler.group, beer: beer.group, contact: contact.mesh, ...(rig ? { alien: rig.object } : {}) },
      trigger(name) {
        if (name === 'puff') puff()
        if (!figure) return
        if (name === 'blink') blinkAt = 0
        if (name === 'sip') start(figure.sip)
        const beat = figure.beats.find((action) => action.getClip().name === name)
        if (beat) start(beat)
      },
      run(params, advance) {
        if (params.has('puff')) {
          puff()
          advance(Number(params.get('puff')))
        }
        if (!figure) return
        if (params.has('blink')) {
          blinkAt = 0
          advance(Number(params.get('blink')))
        }
        if (params.has('sip')) {
          start(figure.sip)
          advance(Number(params.get('sip')))
        }
        const [beatName, beatAt] = (params.get('beat') ?? '').split(':')
        const beat = figure.beats.find((action) => action.getClip().name === beatName)
        if (beat) {
          start(beat)
          advance(Number(beatAt))
        }
        if (params.get('pose') === 'bind' && rig) {
          // The model as it was made, standing, with only the hands closed: for looking at the grip
          figure.mixer.stopAllAction()
          for (const { bone, position, quaternion } of rig.rest) {
            bone.position.copy(position)
            bone.quaternion.copy(quaternion)
          }
          held = true
        }
        const [clipName, clipAt] = (params.get('clip') ?? '').split(':')
        const action = [figure.idle, figure.sip, ...figure.beats].find((candidate) => candidate.getClip().name === clipName)
        if (action) {
          // One clip alone, held at one time
          figure.mixer.stopAllAction()
          action.reset()
          action.setEffectiveWeight(1)
          action.play()
          action.time = clipAt === 'end' ? action.getClip().duration - 1e-4 : Number(clipAt)
          figure.mixer.update(0)
          held = true
        }
      },
      handWorld: (out) => (rig ? rig.bones[BEER_SIDE === 'left' ? 'leftHand' : 'rightHand'].getWorldPosition(out) : out.set(0, 0.5, 0)),
      info: () => ({ clip: playing ? playing.getClip().name : 'idle', time: schedule.time().toFixed(1) }),
    },
  }
}

/**
 * What the moon scene's ground reflects of its sun, as a fraction: the actor's
 * environment shows sunlit regolith below the horizon, and this is how bright
 * it takes that regolith to be for a given sun.
 */
const GROUND_ALBEDO = 0.2
/** The reflection's brightness when no sun can be found in the scene. */
const FALLBACK_INTENSITY = 0.25

/**
 * Keeps the actor's own environment (env.ts) true to the scene it has been
 * put in. Each frame it turns the environment with the actor, so the ground
 * in a reflection is under him however the moon scene has stood him on the
 * moon, and sets its brightness from the scene's sun (the strongest
 * directional light it can find above him), so that ground is as bright in a
 * reflection as it is beside the chair.
 */
function makeEnvLink(root: THREE.Object3D, reflective: THREE.MeshStandardMaterial[]) {
  let scene: THREE.Object3D | null = null
  let sun: THREE.DirectionalLight | null = null
  const orientation = new THREE.Quaternion()
  const rotation = new THREE.Euler()
  const up = new THREE.Vector3()
  const toSun = new THREE.Vector3()
  const targetAt = new THREE.Vector3()

  const findSun = () => {
    let top: THREE.Object3D = root
    while (top.parent) top = top.parent
    if (top === scene) return
    scene = top
    sun = null
    top.traverse((object) => {
      const light = object as THREE.DirectionalLight
      if (light.isDirectionalLight && (!sun || light.intensity > sun.intensity)) sun = light
    })
  }

  return {
    /** Returns how bright sunlit ground is in this scene (its radiance), which is also what the environment is scaled by. */
    update() {
      findSun()
      root.getWorldQuaternion(orientation)
      rotation.setFromQuaternion(orientation)
      let intensity = FALLBACK_INTENSITY
      const light = sun as THREE.DirectionalLight | null
      if (light) {
        up.set(0, 1, 0).applyQuaternion(orientation)
        light.getWorldPosition(toSun).sub(light.target.getWorldPosition(targetAt)).normalize()
        const luminance = light.color.r * 0.2126 + light.color.g * 0.7152 + light.color.b * 0.0722
        intensity = (GROUND_ALBEDO * light.intensity * luminance * Math.max(toSun.dot(up), 0.08)) / Math.PI
      }
      for (const material of reflective) {
        material.envMapIntensity = intensity
        material.envMapRotation.copy(rotation)
      }
      return intensity
    },
  }
}
