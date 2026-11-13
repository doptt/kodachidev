import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SceneFactory, StageFrame } from '@/stage/types'
import { createActor, type DebugActor } from '../actor'
import type { AlienInput } from '../types'

/**
 * A stand-in for the moon scene, for developing the actor on his own: a curved
 * grey ground of the moon's radius, one harsh sun with a shadow map, a faint
 * blue fill, and a camera that can be put at a named angle or dragged round.
 * The real page never loads this.
 *
 * Everything is steered from the query string so a screenshot script can
 * capture exact moments. See dev/alien.tsx for the list.
 */
export type HarnessControls = {
  actor: DebugActor
  setCamera(name: string): void
}

const GROUND_RADIUS = 9
const STEP = 1 / 60

type View = { from: [number, number, number]; to: [number, number, number]; fov?: number }

const VIEWS: Record<string, View> = {
  // As the reference picture has him: three-quarter from his front-right, low, the whole set in frame
  ref: { from: [-2.35, 0.5, 1.3], to: [0.05, 0.42, 0.34], fov: 26 },
  // The same angle with him a third of the frame high, which is how the moon scene shows him
  owner: { from: [-3.1, 0.55, 1.75], to: [0.3, 0.5, 0.5], fov: 30 },
  front: { from: [0, 0.62, 2.9], to: [0.1, 0.4, 0.2] },
  '3q': { from: [-1.6, 0.72, 2.1], to: [0.1, 0.4, 0.2] },
  side: { from: [-2.7, 0.55, 0.3], to: [0, 0.4, 0.25] },
  left: { from: [2.5, 0.65, 1.1], to: [0.15, 0.4, 0.2] },
  back: { from: [1.2, 0.8, -2.0], to: [0.1, 0.4, 0.1] },
  above: { from: [0.25, 3.0, 0.9], to: [0.12, 0.3, 0.25] },
  chair: { from: [-0.95, 0.6, 1.05], to: [0, 0.28, 0.05], fov: 30 },
  'chair-back': { from: [0.8, 0.68, -1.1], to: [0, 0.3, 0], fov: 30 },
  'chair-top': { from: [0.02, 1.5, 0.3], to: [0, 0.25, 0.02], fov: 30 },
  weave: { from: [-0.18, 0.5, 0.38], to: [0, 0.24, 0.04], fov: 28 },
  cooler: { from: [-0.55, 0.42, 0.75], to: [0, 0.1, 0.03], fov: 30 },
  beer: { from: [-0.14, 0.16, 0.5], to: [0, 0.095, 0], fov: 24 },
  'beer-top': { from: [-0.1, 0.42, 0.2], to: [0, 0.15, 0], fov: 24 },
}

export function alienHarness(params: URLSearchParams): { factory: SceneFactory; controls: () => HarnessControls | null } {
  let controls: HarnessControls | null = null

  const factory: SceneFactory = async (ctx) => {
    const renderer = await ctx.three()
    renderer.shadowMap.enabled = params.get('shadows') !== '0'
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = Number(params.get('exposure') ?? 1)
    renderer.info.autoReset = false

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    // The ground: the top of a sphere of the moon's radius
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x8e8c89, roughness: 1 })
    const groundGeometry = new THREE.SphereGeometry(GROUND_RADIUS, 256, 96, 0, Math.PI * 2, 0, 1.2)
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial)
    groundMesh.position.y = -GROUND_RADIUS
    groundMesh.receiveShadow = true
    scene.add(groundMesh)

    // The sun: ?sun=azimuth,elevation in degrees, azimuth measured from his front (+Z) toward his left (+X)
    const [azimuth, elevation] = (params.get('sun') ?? '-28,17').split(',').map((v) => THREE.MathUtils.degToRad(Number(v)))
    const sun = new THREE.DirectionalLight(0xfff6e8, Number(params.get('sunlight') ?? 6))
    sun.position.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(8)
    sun.castShadow = true
    const tier = ctx.tier
    sun.shadow.mapSize.setScalar(tier === 'low' ? 1024 : tier === 'medium' ? 2048 : 4096)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 16
    sun.shadow.bias = -0.0002
    sun.shadow.normalBias = 0.01
    sun.shadow.radius = 1.5
    scene.add(sun)
    // Earthshine: faint, cool, from where the Earth hangs in front of him
    const fill = new THREE.DirectionalLight(0x9db9ff, Number(params.get('fill') ?? 0.22))
    fill.position.set(0.42, 0.56, 0.71).multiplyScalar(8)
    scene.add(fill)

    const actor = await createActor({ renderer, tier, groundRadius: GROUND_RADIUS }, params.has('nomodel') ? '/models/none/' : undefined)
    scene.add(actor.root)
    // ?only=chair shows one prop by itself, standing at the origin (?only=alien,can keeps several, where they are)
    const only = params.get('only')
    if (only) {
      const keep = only.split(',')
      for (const [name, part] of Object.entries(actor.debug.parts)) part.visible = keep.includes(name)
      const part = actor.debug.parts[only]
      if (part && only !== 'chair' && only !== 'alien') {
        part.removeFromParent()
        part.position.set(0, 0, 0)
        part.quaternion.identity()
        scene.add(part)
      }
    }

    const fit = 1.6
    Object.assign(sun.shadow.camera, { left: -fit, right: fit, top: fit, bottom: -fit })
    sun.shadow.camera.updateProjectionMatrix()

    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 200)
    const orbit = new OrbitControls(camera, ctx.canvas)
    orbit.enableDamping = true
    const head = new THREE.Vector3()
    const setCamera = (name: string) => {
      actor.root.updateMatrixWorld(true)
      actor.headWorld(head)
      let view: View | undefined = VIEWS[name]
      if (name === 'face') view = { from: [head.x - 0.3, head.y + 0.02, head.z + 0.85], to: [head.x, head.y - 0.02, head.z], fov: 30 }
      if (name.startsWith('hand') && actor.debug.handWorld) {
        // The bottle hand from his right, from in front, from his left and from above
        const hand = actor.debug.handWorld(new THREE.Vector3())
        const offsets: Record<string, [number, number, number]> = { hand: [-0.42, 0.16, 0.5], 'hand-front': [0.05, 0.1, 0.65], 'hand-left': [0.45, 0.2, 0.45], 'hand-top': [-0.1, 0.6, 0.25] }
        const [dx, dy, dz] = offsets[name] ?? offsets.hand
        view = { from: [hand.x + dx, hand.y + dy, hand.z + dz], to: [hand.x + 0.02, hand.y + 0.03, hand.z + 0.05], fov: 26 }
      }
      const numbers = name.split(',').map(Number)
      if (numbers.length >= 6 && numbers.every(Number.isFinite)) view = { from: [numbers[0], numbers[1], numbers[2]], to: [numbers[3], numbers[4], numbers[5]], fov: numbers[6] }
      if (!view) view = VIEWS['3q']
      camera.position.set(...view.from)
      orbit.target.set(...view.to)
      camera.fov = view.fov ?? 36
      camera.updateProjectionMatrix()
      orbit.update()
    }
    setCamera(params.get('cam') ?? (only && VIEWS[only] ? only : 'ref'))
    controls = { actor, setCamera }

    // Everything is drawn into a multisampled buffer and then put on the canvas (which has no antialiasing of its own)
    const target = new THREE.WebGLRenderTarget(4, 4, { samples: tier === 'low' ? 2 : 4, type: THREE.HalfFloatType })
    const output = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { map: { value: target.texture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
        depthTest: false,
        depthWrite: false,
      }),
    )
    output.frustumCulled = false
    const outputCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    let compiled = false
    void renderer.compileAsync(scene, camera).then(() => (compiled = true))

    const input: AlienInput = { lookAt: null, glanceAt: null, reveal: 1, still: params.has('still') }
    const lookTarget = new THREE.Vector3()
    const ray = new THREE.Raycaster()
    const plane = new THREE.Plane()
    const towardCamera = new THREE.Vector3()
    const pointer = new THREE.Vector2()
    const vec = (text: string | null) => {
      const parts = (text ?? '').split(',').map(Number)
      return parts.length === 3 && parts.every(Number.isFinite) ? new THREE.Vector3(parts[0], parts[1], parts[2]) : null
    }
    const fixedLook = vec(params.get('look'))
    input.glanceAt = vec(params.get('glance'))

    // ?t=12 runs the actor for that many seconds before the first frame and then holds time still
    const freezeAt = params.has('t') ? Number(params.get('t')) : null
    const revealAt = params.has('reveal') ? Number(params.get('reveal')) : null
    let clock = 0
    let prepared = false
    const prepareFrozen = () => {
      if (fixedLook) input.lookAt = fixedLook
      for (let t = 0; t < (freezeAt ?? 0); t += STEP) {
        input.reveal = revealAt ?? Math.min(1, t / 1.2)
        actor.update(STEP, input)
      }
      actor.debug.run?.(params, (seconds) => {
        for (let t = 0; t < seconds; t += STEP) actor.update(STEP, input)
      })
    }

    let calls = 0
    let triangles = 0
    return {
      prepare: () => (compiled ? 'ready' : 'pending'),
      render(frame: StageFrame) {
        if (!prepared) {
          prepared = true
          if (freezeAt !== null) prepareFrozen()
        }
        if (freezeAt === null) {
          clock += frame.dt
          input.reveal = revealAt ?? Math.min(1, clock / 1.2)
          if (fixedLook) input.lookAt = fixedLook
          else if (params.has('nolook')) input.lookAt = null
          else {
            // Where the pointer is, on a plane through his head that faces the camera
            actor.headWorld(head)
            towardCamera.copy(camera.position).sub(head).normalize()
            plane.setFromNormalAndCoplanarPoint(towardCamera, head.addScaledVector(towardCamera, 0.8))
            pointer.set(frame.pointer[0], frame.pointer[1])
            ray.setFromCamera(pointer, camera)
            input.lookAt = ray.ray.intersectPlane(plane, lookTarget)
          }
          actor.update(frame.dt, input)
        } else {
          actor.update(0, input)
        }
        orbit.update()

        if (target.width !== frame.width || target.height !== frame.height) target.setSize(frame.width, frame.height)
        camera.aspect = frame.width / frame.height
        camera.updateProjectionMatrix()
        renderer.resetState()
        renderer.info.reset()
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        renderer.setRenderTarget(null)
        renderer.render(output, outputCamera)
        calls = renderer.info.render.calls
        triangles = renderer.info.render.triangles
      },
      stats: () => ({ calls, triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, ...actor.debug.info?.() }),
      dispose() {
        orbit.dispose()
        actor.dispose()
        groundGeometry.dispose()
        groundMaterial.dispose()
        target.dispose()
        output.geometry.dispose()
        output.material.dispose()
      },
    }
  }

  return { factory, controls: () => controls }
}
