// A neutral turntable for looking at a GLB: the asset pipeline's eyes.
//
//   /dev/model-viewer.html?src=/models/alien.glb
//     &view=front|back|left|right|three|top   the camera direction (default three, a three-quarter view)
//     &az=35&el=10        or the direction in degrees: azimuth from the model's front (+Z) towards its left (+X), elevation up
//     &ortho=1            orthographic camera (for measuring), otherwise a long lens
//     &focus=head|hands|feet|all   which part to frame (fractions of the bounding box; default all)
//     &clip=idle&t=1.5    pose the model at t seconds into a clip (no clip: the bind pose)
//     &play=1             let the clip run in real time instead of holding t
//     &turn=Head:10,0,0;LeftAntenna1:0,0,25   extra bone rotations on top of the pose, degrees about the bone's X, Y, Z
//     &fit=pose           frame the held pose rather than the bind pose
//     &manifest=/models/alien.json   draw that manifest's eye and antenna measurements over the bind pose
//     &unlit=1            base colour only, no lighting (for reading the texture)
//     &wire=1             wireframe over the surface
//     &bones=1            draw the skeleton
//     &bg=8a8d91          background colour
//     &hud=1              print triangle, texture and clip facts on the page
//
// It is a tool, not a site scene, so it owns its canvas and renderer and takes nothing from the stage.
// When the picture is settled it sets data-ready="1" on the canvas and leaves the facts about the file in
// window.__model, which scripts/model-shots.mjs waits for and prints.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

interface ModelFacts {
  src: string
  triangles: number
  vertices: number
  meshes: string[]
  skinnedMeshes: string[]
  bones: string[]
  clips: { name: string; duration: number; tracks: number }[]
  textures: { name: string; width: number; height: number; compressed: boolean }[]
  /** Bounding box of the model in its bind pose, in the file's units */
  box: { min: number[]; max: number[] }
  extensions: string[]
  error?: string
}

/** The parts of public/models/alien.json that the overlay draws. */
interface Manifest {
  bind: {
    eyes: Record<string, { center: number[]; radii: number[]; forward: number[] }>
    antennae: { base: number[]; tip: number[]; ballRadius: number }[]
    mouth?: number[]
  }
}

declare global {
  interface Window {
    __model?: ModelFacts
  }
}

const query = new URLSearchParams(location.search)
const canvas = document.getElementById('view') as HTMLCanvasElement
const hud = document.getElementById('hud') as HTMLDivElement

const VIEWS: Record<string, [number, number]> = {
  front: [0, 0],
  back: [180, 0],
  left: [90, 0],
  right: [-90, 0],
  three: [35, 12],
  top: [0, 89.9],
}

/** The part of the bounding box to frame, as [bottom, top] fractions of its height and a width fraction. */
const FOCUS: Record<string, { y: [number, number]; x: [number, number] }> = {
  all: { y: [0, 1], x: [0, 1] },
  head: { y: [0.66, 1], x: [0.25, 0.75] },
  hands: { y: [0.3, 0.55], x: [0, 1] },
  feet: { y: [0, 0.14], x: [0.2, 0.8] },
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NoToneMapping

const scene = new THREE.Scene()
const background = new THREE.Color(`#${query.get('bg') ?? '8a8d91'}`)
scene.background = background
document.body.style.background = `#${background.getHexString()}`

// Neutral light: a soft studio environment for the PBR response, plus a key and a fill so form reads
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.55
const key = new THREE.DirectionalLight(0xffffff, 1.6)
key.position.set(1.5, 2.5, 3)
const fill = new THREE.DirectionalLight(0xffffff, 0.5)
fill.position.set(-2.5, 1, -1.5)
scene.add(key, fill)

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
// The site's own copy of the Basis transcoder (public/basis), the one the real page will use
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/')
ktx2.detectSupport(renderer)
loader.setKTX2Loader(ktx2)

function resize(camera: THREE.Camera) {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  renderer.setSize(w, h, false)
  const aspect = w / h
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  }
  return aspect
}

/** Places the camera to frame the chosen part of the box from the chosen direction. */
function frame(box: THREE.Box3, aspect: number): THREE.Camera {
  const named = VIEWS[query.get('view') ?? 'three'] ?? VIEWS.three
  const az = THREE.MathUtils.degToRad(Number(query.get('az') ?? named[0]))
  const el = THREE.MathUtils.degToRad(Number(query.get('el') ?? named[1]))
  const focus = FOCUS[query.get('focus') ?? 'all'] ?? FOCUS.all

  const size = box.getSize(new THREE.Vector3())
  const part = new THREE.Box3(
    new THREE.Vector3(box.min.x + size.x * focus.x[0], box.min.y + size.y * focus.y[0], box.min.z),
    new THREE.Vector3(box.min.x + size.x * focus.x[1], box.min.y + size.y * focus.y[1], box.max.z),
  )
  const centre = part.getCenter(new THREE.Vector3())
  const partSize = part.getSize(new THREE.Vector3())
  const radius = partSize.length() / 2
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))

  // Half-height of the view that holds the part with a margin, whatever the aspect
  const halfHeight = Math.max(partSize.y / 2, Math.max(partSize.x, partSize.z) / 2 / aspect) * 1.12

  if (query.get('ortho') === '1') {
    const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 0.01, radius * 20 + 10)
    camera.position.copy(centre).addScaledVector(dir, radius * 6 + 1)
    camera.lookAt(centre)
    return camera
  }
  const fov = 20
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 1000)
  const distance = halfHeight / Math.tan(THREE.MathUtils.degToRad(fov / 2)) + Math.max(partSize.x, partSize.z) / 2
  camera.position.copy(centre).addScaledVector(dir, distance)
  camera.lookAt(centre)
  return camera
}

/** The box of a model as it is posed now: skinned meshes need their bones applied, which Box3 alone ignores. */
function posedBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  root.updateMatrixWorld(true)
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const position = mesh.geometry.getAttribute('position')
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null
    skinned?.skeleton.update()
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i)
      if (skinned) skinned.applyBoneTransform(i, v)
      box.expandByPoint(v.applyMatrix4(mesh.matrixWorld))
    }
  })
  return box
}

async function main() {
  const src = query.get('src') ?? '/models/alien.glb'
  const gltf = await loader.loadAsync(src)
  const root = gltf.scene
  scene.add(root)

  const facts: ModelFacts = {
    src,
    triangles: 0,
    vertices: 0,
    meshes: [],
    skinnedMeshes: [],
    bones: [],
    clips: gltf.animations.map((c) => ({ name: c.name, duration: c.duration, tracks: c.tracks.length })),
    textures: [],
    box: { min: [], max: [] },
    extensions: (gltf.parser.json.extensionsUsed as string[] | undefined) ?? [],
  }
  const seen = new Set<THREE.Texture>()
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone) facts.bones.push(node.name)
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    facts.meshes.push(mesh.name)
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) facts.skinnedMeshes.push(mesh.name)
    // A posed skinned mesh leaves its bind-pose bounds, so never let the frustum drop it
    mesh.frustumCulled = false
    const geometry = mesh.geometry
    facts.vertices += geometry.getAttribute('position').count
    facts.triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const standard = material as THREE.MeshStandardMaterial
      for (const texture of [standard.map, standard.normalMap, standard.roughnessMap, standard.metalnessMap, standard.emissiveMap, standard.aoMap]) {
        if (!texture || seen.has(texture)) continue
        seen.add(texture)
        const image = texture.image as { width?: number; height?: number } | undefined
        facts.textures.push({
          name: texture.name,
          width: image?.width ?? 0,
          height: image?.height ?? 0,
          compressed: (texture as THREE.CompressedTexture).isCompressedTexture === true,
        })
      }
      if (query.get('unlit') === '1') {
        mesh.material = new THREE.MeshBasicMaterial({ map: standard.map, color: standard.map ? 0xffffff : standard.color })
      }
      if (query.get('wire') === '1') {
        const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35 }))
        mesh.add(wire)
      }
    }
  })

  // The camera frames the model as the file's nodes pose it (the bind pose), so every shot of every clip is at
  // one scale; fit=pose frames the held pose instead
  const bindBox = posedBox(root)

  // Pose: a clip held at t (or playing), else the bind pose
  const mixer = new THREE.AnimationMixer(root)
  const clipName = query.get('clip')
  const clip = clipName ? gltf.animations.find((c) => c.name === clipName) : undefined
  const playing = query.get('play') === '1'
  if (clip) {
    mixer.clipAction(clip).play()
    mixer.setTime(Number(query.get('t') ?? 0))
  }

  // Extra bone rotations on top, in degrees about the bone's own X, Y, Z: turn=LeftAntenna1:0,0,25;Head:10,0,0
  for (const entry of (query.get('turn') ?? '').split(';').filter(Boolean)) {
    const [name, angles] = entry.split(':')
    const bone = root.getObjectByName(name)
    const [x = 0, y = 0, z = 0] = (angles ?? '').split(',').map((n) => THREE.MathUtils.degToRad(Number(n)))
    bone?.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)))
  }

  if (query.get('bones') === '1') {
    const helper = new THREE.SkeletonHelper(root)
    ;(helper.material as THREE.LineBasicMaterial).depthTest = false
    scene.add(helper)
  }

  // The manifest's bind measurements drawn over the model, to check them by eye: each eye's box of half-extents
  // and the way it faces, each antenna's base, tip and ball, the mouth
  const manifestUrl = query.get('manifest')
  if (manifestUrl) {
    const manifest = (await (await fetch(manifestUrl)).json()) as Manifest
    const lines = new THREE.LineBasicMaterial({ color: 0xff2bd6, depthTest: false })
    const overlay = new THREE.Group()
    overlay.renderOrder = 10
    for (const eye of Object.values(manifest.bind.eyes)) {
      const centre = new THREE.Vector3().fromArray(eye.center)
      const [rx, ry, rz] = eye.radii
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(rx * 2, ry * 2, rz * 2)), lines)
      frame.position.copy(centre)
      const facing = new THREE.ArrowHelper(new THREE.Vector3().fromArray(eye.forward), centre, 0.06, 0xff2bd6)
      ;(facing.line.material as THREE.LineBasicMaterial).depthTest = false
      overlay.add(frame, facing)
    }
    for (const antenna of manifest.bind.antennae) {
      const base = new THREE.Vector3().fromArray(antenna.base)
      const tip = new THREE.Vector3().fromArray(antenna.tip)
      overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, tip]), lines))
      const ball = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(antenna.ballRadius, 10, 6)), lines)
      ball.position.copy(tip)
      const root = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(0.004, 6, 4)), lines)
      root.position.copy(base)
      overlay.add(ball, root)
    }
    if (manifest.bind.mouth) {
      const mouth = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(0.006, 6, 4)), lines)
      mouth.position.fromArray(manifest.bind.mouth)
      overlay.add(mouth)
    }
    scene.add(overlay)
  }

  const box = query.get('fit') === 'pose' ? posedBox(root) : bindBox
  facts.box = { min: bindBox.min.toArray(), max: bindBox.max.toArray() }
  let camera = frame(box, resize(new THREE.PerspectiveCamera()))
  resize(camera)
  addEventListener('resize', () => {
    camera = frame(box, resize(camera))
    resize(camera)
  })

  if (query.get('hud') === '1') {
    hud.hidden = false
    hud.textContent = [
      src,
      `${facts.triangles} triangles, ${facts.vertices} vertices`,
      `box ${facts.box.min.map((n) => n.toFixed(3)).join(' ')} .. ${facts.box.max.map((n) => n.toFixed(3)).join(' ')}`,
      `textures ${facts.textures.map((t) => `${t.width}x${t.height}${t.compressed ? ' ktx2' : ''}`).join(', ')}`,
      `clips ${facts.clips.map((c) => `${c.name} ${c.duration.toFixed(2)}s`).join(', ') || 'none'}`,
      facts.extensions.join(' '),
    ].join('\n')
  }

  window.__model = facts
  let frames = 0
  let last = performance.now()
  renderer.setAnimationLoop((now: number) => {
    if (clip && playing) mixer.update((now - last) / 1000)
    last = now
    renderer.render(scene, camera)
    // Compressed textures and the environment land a few frames in
    if (++frames === 6) canvas.dataset.ready = '1'
  })
}

main().catch((error: unknown) => {
  window.__model = {
    src: query.get('src') ?? '',
    triangles: 0,
    vertices: 0,
    meshes: [],
    skinnedMeshes: [],
    bones: [],
    clips: [],
    textures: [],
    box: { min: [], max: [] },
    extensions: [],
    error: error instanceof Error ? error.message : String(error),
  }
  canvas.dataset.ready = 'failed'
})
