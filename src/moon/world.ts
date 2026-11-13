import * as THREE from 'three'
import type { TierName } from '@/blackhole/quality'
import type { StageContext, StageFrame, StageScene } from '@/stage/types'
import { createAlienActor, type AlienActor, type AlienInput } from '@/alien'
import { DAMP, damp } from '@/motion/tokens'
import { loadAssets, type MoonAssets } from './assets'
import { ALIEN_HEIGHT, CAMERA_AZIMUTH, CHAMPAGNE, EARTH, FILL, FILL_LIGHT, GALAXY, PIN, SUN, SUN_LIGHT } from './config'
import { buildEarth, type Earth } from './earth'
import { azimuth, visibility, type Vec3 } from './geo'
import { MAX_PINS, buildGround, type Ground } from './ground'
import { face, step, unface } from './orbit'
import { buildPins, type Pins3d } from './pins3d'
import { Post } from './post'
import { buildRocks, type Rocks } from './rocks'
import type { MoonSceneOptions } from './scene'
import { cameraAxes, cameraPose, moonTimeline, radiusFor, screenDirection, smoothstep } from './timeline'

/** What each quality tier gets. Texture sizes are chosen once, when the scene is made; the rest can step down while it runs. */
const QUALITY: Record<TierName, { samples: number; shadow: number; segments: number; bloom: number; rocks: number; facets: number }> = {
  ultra: { samples: 4, shadow: 4096, segments: 384, bloom: 6, rocks: 1100, facets: 2 },
  high: { samples: 4, shadow: 2048, segments: 384, bloom: 6, rocks: 1100, facets: 2 },
  medium: { samples: 4, shadow: 2048, segments: 256, bloom: 5, rocks: 700, facets: 2 },
  low: { samples: 2, shadow: 2048, segments: 256, bloom: 4, rocks: 420, facets: 1 },
}

/** Only what is brighter than this blooms: sunlit ground and the alien's clothes stay crisp. */
const BLOOM_THRESHOLD = 1.6
/** How far the pointer swings the camera, radians. A breath, not a control. */
const PARALLAX = 0.006
/** How much of the way to a pin the view swings when the pin is asked for. */
const FACE = 0.6

type Phase = 'loading' | 'building' | 'actor' | 'uploading' | 'compiling' | 'warming' | 'ready' | 'failed'

/**
 * Builds the moon scene on the stage's three.js renderer. See scene.ts for
 * what it is; this is how.
 *
 * The world is built in the stand frame (geo.ts): the moon's centre is the
 * origin, the alien's spot is straight up, he faces +Z. Nothing in it turns:
 * the visitor moves the camera a little way round the chair, and the sun, the
 * Earth and the sky stay where they are.
 *
 * One frame is: the Earth, alone, seen by a camera that only turns (it is too
 * far away for the camera's travel to matter); then the moon and everything on
 * it, over that, into the same buffer; then post.ts.
 */
export async function buildWorld(ctx: StageContext, opts: MoonSceneOptions): Promise<StageScene> {
  const renderer = await ctx.three()
  const { state } = opts
  const pinData = opts.pins.slice(0, MAX_PINS)
  let quality = QUALITY[ctx.tier]
  // Phones get the smaller maps whatever their tier
  const small = ctx.tier === 'low' || window.matchMedia('(pointer: coarse)').matches
  // The canvas fills the window. The size of the world is fixed from its shape now (see radiusFor).
  const radius = radiusFor(window.innerWidth / Math.max(1, window.innerHeight), ALIEN_HEIGHT)

  let phase: Phase = 'loading'
  let assets: MoonAssets | null = null
  let ground: Ground | null = null
  let earth: Earth | null = null
  let pins: Pins3d | null = null
  let rocks: Rocks | null = null
  let post: Post | null = null
  let actor: AlienActor | null = null
  let uploads: THREE.Texture[] = []
  let disposed = false

  loadAssets(renderer, { moon: small ? '2k' : '4k', site: small ? '1k' : '2k', craters: small ? '512' : '1k', earth: small ? '1k' : '2k', sky: small ? 512 : 1024 }, (done, total) => {
    // The files are most of the wait; the actor and the shaders are the rest
    state.loaded = (done / total) * 0.8
    state.emit()
  }).then(
    (loaded) => {
      if (disposed) return loaded.dispose()
      assets = loaded
      phase = 'building'
    },
    (err) => {
      if (import.meta.env.DEV) console.error('[moon] could not load', err)
      phase = 'failed'
    },
  )

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200)
  const farCamera = new THREE.PerspectiveCamera(36, 1, 1, 500)

  const top = new THREE.Vector3(0, radius, 0)
  const sunDir = new THREE.Vector3(...SUN)
  const sun = new THREE.DirectionalLight(SUN_LIGHT.color, SUN_LIGHT.intensity)
  sun.position.copy(sunDir).multiplyScalar(40)
  sun.castShadow = true
  sun.shadow.mapSize.setScalar(quality.shadow)
  // The shadow map takes in the whole moon and what stands on it
  const reach = radius + 1.6
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 40 - reach, far: 40 + reach })
  sun.shadow.bias = -0.0003
  sun.shadow.normalBias = 0.005
  sun.shadow.radius = 1.5
  const fillDir = new THREE.Vector3(...FILL)
  const fill = new THREE.DirectionalLight(FILL_LIGHT.color, FILL_LIGHT.intensity)
  fill.position.copy(fillDir).multiplyScalar(40)
  scene.add(sun, fill)

  const clearColor = new THREE.Color()
  /** The renderer is shared: these are set for the length of one call and put back. */
  const borrow = () => {
    const before = {
      autoClear: renderer.autoClear,
      shadows: renderer.shadowMap.enabled,
      shadowType: renderer.shadowMap.type,
      shadowAuto: renderer.shadowMap.autoUpdate,
      clearAlpha: renderer.getClearAlpha(),
    }
    renderer.getClearColor(clearColor)
    renderer.resetState()
    renderer.autoClear = false
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.shadowMap.autoUpdate = true
    renderer.setClearColor(0x000000, 0)
    return () => {
      renderer.setRenderTarget(null)
      renderer.autoClear = before.autoClear
      renderer.shadowMap.enabled = before.shadows
      renderer.shadowMap.type = before.shadowType
      renderer.shadowMap.autoUpdate = before.shadowAuto
      renderer.setClearColor(clearColor, before.clearAlpha)
    }
  }

  /** Everything that needs the files: the ground, the Earth, the pins, the stones, the post chain. Then the actor is sent for. */
  const build = (loaded: MoonAssets) => {
    ground = buildGround(loaded, radius, quality.segments)
    scene.add(ground.mesh, ground.shade)
    const light = new THREE.Color(SUN_LIGHT.color).multiplyScalar(SUN_LIGHT.intensity)
    const fillLight = new THREE.Color(FILL_LIGHT.color).multiplyScalar(FILL_LIGHT.intensity)
    const u = ground.mesh.material.uniforms
    u.uSunLight.value.copy(light)
    u.uFillLight.value.copy(fillLight)
    u.uPinLight.value.setRGB(CHAMPAGNE[0], CHAMPAGNE[1], CHAMPAGNE[2])
    // Nothing turns, so the lights are where they are in the ground's own frame once and for all
    ground.toMoon(sunDir, u.uSun.value)
    ground.toMoon(fillDir, u.uFill.value)

    earth = buildEarth(loaded.earth)

    // Each pin is planted in the ground that is seen at its spot in the settled picture
    pins = buildPins(pinData.map((pin) => pin.id))
    const shape = window.innerWidth / Math.max(1, window.innerHeight)
    const settled = cameraPose(1, shape, radius, ALIEN_HEIGHT, headAt, CAMERA_AZIMUTH)
    const from = new THREE.Vector3(...settled.position)
    const dir = new THREE.Vector3()
    pinData.forEach((pin, i) => {
      const [x, y] = shape < 0.9 ? pin.spot.tall : pin.spot.wide
      dir.set(...screenDirection(settled, shape, x * 2 - 1, 1 - y * 2))
      // Where that line of sight meets the moon; one that misses is brought in to graze it
      const along = -from.dot(dir)
      const short = Math.sqrt(Math.max(0, along * along - from.lengthSq() + radius * radius))
      dir.multiplyScalar(along - short).add(from).normalize()
      ground!.place(pins!.pins[i].group, dir)
      ground!.toMoon(dir, v)
      u.uPins.value[i].set(v.x, v.y, v.z, 0)
      scene.add(pins!.pins[i].group)
    })

    // Stones, anywhere but under the chair or a pin
    // As many again on a bigger moon, so the ground is as stony
    rocks = buildRocks(Math.round(quality.rocks * Math.min(2.2, (radius / 4) ** 2)), quality.facets, radius, [
      { direction: new THREE.Vector3(0, 1, 0), radius: 1.1 },
      ...pins.pins.map((pin) => ({ direction: pin.group.position.clone().normalize(), radius: 0.2 })),
    ])
    const r = rocks.mesh.material.uniforms
    r.uSun.value.copy(sunDir)
    r.uFill.value.copy(fillDir)
    r.uSunLight.value.copy(light)
    r.uFillLight.value.copy(fillLight)
    scene.add(rocks.mesh)

    post = new Post(quality.samples, loaded.sky)
    uploads = [loaded.color, loaded.normal, loaded.detail, loaded.craters, loaded.site, loaded.earth, ...(loaded.sky ? [loaded.sky] : [])]

    // The actor draws its reflections with the renderer as soon as it is called: inside this frame, on a clean state
    const restore = borrow()
    const made = createAlienActor({ renderer, tier: ctx.tier, groundRadius: radius })
    restore()
    made.then(
      (alien) => {
        if (disposed) return alien.dispose()
        actor = alien
        alien.root.position.copy(top)
        scene.add(alien.root)
        phase = 'uploading'
      },
      (err) => {
        // The moon and its pins are still worth showing without him
        if (import.meta.env.DEV) console.error('[moon] the actor could not be made', err)
        phase = 'uploading'
      },
    )
  }

  // ------------------------------------------------------------ a frame ----

  const eye = new THREE.Vector3()
  const look = new THREE.Vector3()
  const head = new THREE.Vector3()
  const v = new THREE.Vector3()
  const ndc = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()
  const glanceTarget = new THREE.Vector3()
  const input: AlienInput = { lookAt: null, glanceAt: null, reveal: 0, still: false }
  const headAt: Vec3 = [0, radius + 1, 0]
  let facing: string | null = null
  let visiblePins = 0
  let triangles = 0
  let skyFor = 0

  /** Hangs the Earth and turns the galaxy for a screen of this shape: both are placed by where they sit in the settled picture. */
  const dressSky = (aspect: number) => {
    if (!earth || !post || Math.abs(aspect - skyFor) < 1e-4) return
    skyFor = aspect
    const settled = cameraPose(1, aspect, radius, ALIEN_HEIGHT, headAt, CAMERA_AZIMUTH)
    const wide = smoothstep(0.75, 1.45, aspect)
    earth.place(screenDirection(settled, aspect, EARTH.tall[0] + (EARTH.wide[0] - EARTH.tall[0]) * wide, EARTH.tall[1] + (EARTH.wide[1] - EARTH.tall[1]) * wide))
    // The galaxy's centre goes where the picture wants it; its pole is square to the band, which crosses the screen at a tilt
    const axes = cameraAxes(settled)
    const centre = new THREE.Vector3(...screenDirection(settled, aspect, GALAXY.at[0] * (0.4 + 0.6 * wide), GALAXY.at[1]))
    const pole = new THREE.Vector3(...axes.up).multiplyScalar(Math.cos(GALAXY.tilt)).addScaledVector(new THREE.Vector3(...axes.right), -Math.sin(GALAXY.tilt))
    pole.addScaledVector(centre, -pole.dot(centre)).normalize()
    const third = new THREE.Vector3().crossVectors(centre, pole)
    post.composite.uniforms.uSkyFrame.value.set(centre.x, centre.y, centre.z, pole.x, pole.y, pole.z, third.x, third.y, third.z)
  }

  /** Puts everything where it is at this moment and draws it into the post chain's buffer. */
  const draw = (frame: StageFrame) => {
    if (!ground || !earth || !pins || !post) return
    const timeline = moonTimeline(state.progress)
    const aspect = frame.width / Math.max(1, frame.height)
    const { orbit } = state
    dressSky(aspect)

    // The visitor's swing of the camera. A pin asked for by keyboard or by the page is swung toward; a hover only stops the sway.
    if (state.facing !== facing) {
      facing = state.facing
      const index = pinData.findIndex((pin) => pin.id === facing)
      if (index >= 0) {
        // How far round from the camera's own side the pin stands, brought into a half turn either way
        const round = CAMERA_AZIMUTH - azimuth(pins.pins[index].group.position.toArray() as Vec3)
        face(orbit, Math.atan2(Math.sin(round), Math.cos(round)) * FACE)
      } else unface(orbit)
    }
    // Under reduced motion the view is the settled one and stays there
    if (!frame.still) step(orbit, frame.dt, { auto: timeline.interactive && state.active === null, tau: DAMP.look })
    const swing = frame.still ? 0 : orbit.yaw * timeline.settle
    const tilt = frame.still ? 0 : orbit.tilt * timeline.settle

    // The camera: on its path, nudged by the visitor and, a very little, by the pointer
    if (actor) {
      actor.headWorld(head)
      headAt[0] = head.x
      headAt[1] = head.y
      headAt[2] = head.z
    }
    const pose = cameraPose(timeline.pull, aspect, radius, ALIEN_HEIGHT, headAt, CAMERA_AZIMUTH, swing + frame.pointer[0] * PARALLAX, tilt - frame.pointer[1] * PARALLAX * 0.5)
    eye.set(...pose.position)
    look.set(...pose.target)
    const distance = eye.length()
    camera.position.copy(eye)
    camera.lookAt(look)
    camera.fov = pose.fov
    camera.aspect = aspect
    camera.near = 0.1
    camera.far = distance + radius + 4
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    farCamera.quaternion.copy(camera.quaternion)
    farCamera.fov = pose.fov
    farCamera.aspect = aspect
    farCamera.updateProjectionMatrix()
    farCamera.updateMatrixWorld()

    const u = ground.mesh.material.uniforms
    ground.toMoon(eye, u.uEye.value)
    // Held still, the rings stop part of the way out
    u.uTime.value = frame.still ? 1.2 : frame.time

    // The pins: where each is on screen, whether the moon is in the way, and how lit up it is
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(pose.fov / 2))
    visiblePins = 0
    for (let i = 0; i < pinData.length; i++) {
      const pin = pins.pins[i]
      // On a small screen the pins are drawn larger than life, or their heads would be a pixel across
      const pxPerMetre = frame.cssHeight / 2 / tanHalf / Math.max(1, eye.distanceTo(pin.group.position))
      pin.group.scale.setScalar(THREE.MathUtils.clamp(4.5 / (PIN.head * pxPerMetre), 1, 2.4))
      pin.group.updateMatrixWorld()
      pin.head.getWorldPosition(v)
      const clear = visibility([eye.x, eye.y, eye.z], [v.x, v.y, v.z], radius - 0.02, 0.22)
      const active = state.active === pin.id
      pin.lift = damp(pin.lift, active ? 1 : 0, DAMP.look, frame.dt)
      // The pins come up out of the ground as the camera arrives: on the way there it passes right by them
      pin.show(clear * smoothstep(0.55, 0.95, timeline.pull), pin.lift)
      if (active) glanceTarget.copy(v)
      ndc.copy(v).project(camera)
      const inFrame = ndc.z < 1 && Math.abs(ndc.x) < 1.02 && Math.abs(ndc.y) < 1.02
      const spot = (state.spots[pin.id] ??= { x: 0, y: 0, visible: 0 })
      spot.x = (ndc.x * 0.5 + 0.5) * frame.cssWidth
      spot.y = (0.5 - ndc.y * 0.5) * frame.cssHeight
      spot.visible = inFrame ? clear : 0
      if (spot.visible > 0.5) visiblePins++
      u.uPins.value[i].w = (0.6 + 0.7 * pin.lift) * pin.group.scale.x
    }
    state.interactive = timeline.interactive

    // The alien: he looks toward the pointer (a point on the glass between him and the camera), and at a pin when one is open
    if (actor) {
      if (frame.still) input.lookAt = null
      else {
        const away = Math.max(1.2, eye.distanceTo(head) - 1.6)
        lookTarget.set(frame.pointer[0], frame.pointer[1], 0.5).unproject(camera).sub(eye).normalize().multiplyScalar(away).add(eye)
        input.lookAt = lookTarget
      }
      input.glanceAt = state.active !== null && pinData.some((pin) => pin.id === state.active) ? glanceTarget : null
      input.reveal = timeline.reveal
      input.still = frame.still
      actor.update(frame.dt, input)
    }
    earth.update(frame.still ? 0 : frame.time)

    post.resize(frame.width, frame.height, quality.bloom)
    renderer.setRenderTarget(post.target)
    renderer.clear()
    renderer.render(earth.scene, farCamera)
    renderer.clearDepth()
    renderer.render(scene, camera)
    triangles = renderer.info.render.triangles

    const c = post.composite.uniforms
    c.uForward.value.setFromMatrixColumn(camera.matrixWorld, 2).negate()
    c.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(tanHalf * aspect)
    c.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(tanHalf)
    c.uFade.value = timeline.fade
    c.uStars.value = timeline.stars
    c.uAspect.value = aspect
    c.uPixel.value = (2 * tanHalf) / Math.max(1, frame.height)
  }

  const settle: StageFrame = { time: 0, dt: 0, pointer: [0, 0], width: Math.max(2, ctx.canvas.width), height: Math.max(2, ctx.canvas.height), cssWidth: 1, cssHeight: 1, still: true }
  let compiled = false

  return {
    prepare() {
      if (phase === 'ready' || phase === 'failed') return phase
      if (phase === 'building' && assets) {
        phase = 'actor'
        build(assets)
      } else if (phase === 'uploading') {
        // One texture a frame: each is a few megabytes handed to the GPU
        const restore = borrow()
        const next = uploads.pop()
        if (next) renderer.initTexture(next)
        restore()
        state.loaded = 0.95 - uploads.length * 0.02
        if (!uploads.length) {
          // Programs are compiled as they will be used: shadows on, drawn into the float buffer; the last pass, onto the screen
          const hold = borrow()
          const passes = post!.passes()
          const buffers = new THREE.Group().add(...passes.buffers)
          renderer.setRenderTarget(post!.target)
          const pending = [renderer.compileAsync(scene, camera), renderer.compileAsync(earth!.scene, farCamera), renderer.compileAsync(buffers, camera)]
          renderer.setRenderTarget(null)
          pending.push(renderer.compileAsync(passes.screen, camera))
          void Promise.all(pending).then(() => (compiled = true))
          hold()
          phase = 'compiling'
        }
      } else if (phase === 'compiling' && compiled) {
        phase = 'warming'
      } else if (phase === 'warming') {
        // One whole frame short of the screen: the shadow map, the buffers and anything compile() could not reach
        const restore = borrow()
        draw(settle)
        post!.render(renderer, BLOOM_THRESHOLD, true)
        restore()
        state.loaded = 1
        phase = 'ready'
      }
      state.emit()
      return phase === 'ready' ? 'ready' : 'pending'
    },

    render(frame) {
      const restore = borrow()
      draw(frame)
      post?.render(renderer, BLOOM_THRESHOLD)
      restore()
      state.emit()
    },

    setTier(tier) {
      quality = QUALITY[tier]
      post?.setSamples(quality.samples)
      if (sun.shadow.mapSize.x !== quality.shadow) {
        sun.shadow.mapSize.setScalar(quality.shadow)
        sun.shadow.map?.dispose()
        sun.shadow.map = null
      }
    },

    stats: () => ({ phase, pins: visiblePins, triangles, maps: small ? '2k' : '4k', radius }),

    dispose() {
      disposed = true
      actor?.dispose()
      pins?.dispose()
      rocks?.dispose()
      earth?.dispose()
      ground?.dispose()
      post?.dispose()
      assets?.dispose()
      sun.shadow.map?.dispose()
      sun.dispose()
      fill.dispose()
    },
  }
}
