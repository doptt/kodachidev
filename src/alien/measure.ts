import * as THREE from 'three'
import { principalAxes } from './maths/fit'
import type { BoneRole, Rig } from './rig'

/**
 * Taking the alien's measurements. The model is generated, not built by hand,
 * so nothing about it can be assumed: how long his shins are, where his eyes
 * were painted, where his antennae stand, which way his thumbs point. This
 * reads all of that off the mesh, its skin weights and its texture in the
 * bind pose, in model space (metres, +Y up, he faces +Z, +X is his left).
 * What the manifest says is used as a hint; what it leaves out is measured.
 */

/** The mesh's vertices in model space, with the bone each one mostly follows. */
export type Cloud = {
  count: number
  /** x, y, z per vertex, model space. */
  positions: Float32Array
  /** Index into the skeleton's bones of the bone with the most weight on each vertex. */
  bone: Uint16Array
  /** How much weight that bone has, 0..1. */
  weight: Float32Array
}

export function readCloud(rig: Rig): Cloud {
  const geometry = rig.mesh.geometry
  const position = geometry.getAttribute('position')
  const skinIndex = geometry.getAttribute('skinIndex')
  const skinWeight = geometry.getAttribute('skinWeight')
  const count = position.count
  const positions = new Float32Array(count * 3)
  const bone = new Uint16Array(count)
  const weight = new Float32Array(count)
  const v = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(rig.geometryToModel)
    v.toArray(positions, i * 3)
    let best = 0
    for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k
    bone[i] = skinIndex.getComponent(i, best)
    weight[i] = skinWeight.getComponent(i, best)
  }
  return { count, positions, bone, weight }
}

// ------------------------------------------------------------- the body ----

/** His proportions, as far as sitting him in a chair needs them. */
export type Body = {
  /** Bind-pose positions of the joints, model space. */
  joint: Record<BoneRole, THREE.Vector3>
  thigh: number
  shin: number
  upperArm: number
  foreArm: number
  /** Height of the ankle joint above the sole. */
  ankle: number
  /** From the ankle joint back to the heel and forward to the toes, along the ground. */
  heel: number
  toes: number
  /** Half the thickness of a thigh, front to back, near the hip and near the knee. */
  thighRadius: number
  kneeRadius: number
  /** From the hip joints back to the surface of his seat. */
  seatBack: number
  /** Half the thickness of the forearm near the elbow, and of the wrist. */
  elbowRadius: number
  wristRadius: number
  /** Half his width across the hips. */
  hipHalfWidth: number
  /** How far the back of his head overhangs the head joint. */
  headBack: number
  /** His mouth, in the bind pose. */
  mouth: THREE.Vector3
  /** Height of the whole model. */
  height: number
}

export function measureBody(rig: Rig, cloud: Cloud): Body {
  const joint = {} as Record<BoneRole, THREE.Vector3>
  const toModel = new THREE.Matrix4().copy(rig.object.matrixWorld).invert()
  for (const role of Object.keys(rig.bones) as BoneRole[]) joint[role] = rig.bones[role].getWorldPosition(new THREE.Vector3()).applyMatrix4(toModel)
  const index = (role: BoneRole) => rig.mesh.skeleton.bones.indexOf(rig.bones[role])

  /** Min and max of one coordinate over the vertices that mostly follow one of `roles`, optionally within a band of y. */
  const extent = (roles: BoneRole[], axis: 0 | 1 | 2, y0 = -Infinity, y1 = Infinity) => {
    const wanted = new Set(roles.map(index))
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < cloud.count; i++) {
      if (!wanted.has(cloud.bone[i])) continue
      const y = cloud.positions[i * 3 + 1]
      if (y < y0 || y > y1) continue
      const value = cloud.positions[i * 3 + axis]
      if (value < min) min = value
      if (value > max) max = value
    }
    return [min, max] as const
  }

  const hipY = joint.leftUpLeg.y
  const kneeY = joint.leftLeg.y
  const thighBand = extent(['leftUpLeg'], 2, kneeY + (hipY - kneeY) * 0.45, kneeY + (hipY - kneeY) * 0.75)
  const kneeBand = extent(['leftUpLeg', 'leftLeg'], 2, kneeY - 0.02, kneeY + 0.03)
  const seat = extent(['hips', 'leftUpLeg', 'rightUpLeg'], 2, hipY - 0.03, hipY + 0.05)
  // The foot below the ankle, toes and all (the toes follow a bone the roles do not list): everything low down on his left
  let heelZ = Infinity
  let toeZ = -Infinity
  for (let i = 0; i < cloud.count; i++) {
    if (cloud.positions[i * 3] <= 0 || cloud.positions[i * 3 + 1] > joint.leftFoot.y * 0.7) continue
    heelZ = Math.min(heelZ, cloud.positions[i * 3 + 2])
    toeZ = Math.max(toeZ, cloud.positions[i * 3 + 2])
  }
  // The mouth: where the manifest says it is, or else the front of the face on its middle line, a little above the chin
  const told = rig.manifest.bind?.mouth
  const headIndex = index('head')
  let chin = Infinity
  for (let i = 0; i < cloud.count; i++) if (cloud.bone[i] === headIndex && cloud.positions[i * 3 + 2] > joint.head.z + 0.03) chin = Math.min(chin, cloud.positions[i * 3 + 1])
  const mouth = new THREE.Vector3(0, chin + 0.04, joint.head.z)
  for (let i = 0; i < cloud.count; i++) {
    if (cloud.bone[i] !== headIndex || Math.abs(cloud.positions[i * 3]) > 0.012) continue
    if (Math.abs(cloud.positions[i * 3 + 1] - mouth.y) < 0.008) mouth.z = Math.max(mouth.z, cloud.positions[i * 3 + 2])
  }
  const hips = extent(['hips', 'leftUpLeg', 'rightUpLeg'], 0, hipY - 0.02, hipY + 0.06)
  const elbow = extent(['leftUpperArm', 'leftForeArm'], 2, joint.leftForeArm.y - 0.02, joint.leftForeArm.y + 0.02)
  const wrist = extent(['leftForeArm', 'leftHand'], 2, joint.leftHand.y - 0.012, joint.leftHand.y + 0.012)
  const headZ = extent(['head'], 2)
  const all = extent(Object.keys(rig.bones) as BoneRole[], 1)
  let top = all[1]
  for (let i = 0; i < cloud.count; i++) top = Math.max(top, cloud.positions[i * 3 + 1])

  return {
    joint,
    thigh: joint.leftUpLeg.distanceTo(joint.leftLeg),
    shin: joint.leftLeg.distanceTo(joint.leftFoot),
    upperArm: joint.leftUpperArm.distanceTo(joint.leftForeArm),
    foreArm: joint.leftForeArm.distanceTo(joint.leftHand),
    ankle: joint.leftFoot.y,
    heel: joint.leftFoot.z - heelZ,
    toes: toeZ - joint.leftFoot.z,
    thighRadius: (thighBand[1] - thighBand[0]) / 2,
    kneeRadius: (kneeBand[1] - kneeBand[0]) / 2,
    seatBack: joint.leftUpLeg.z - seat[0],
    elbowRadius: (elbow[1] - elbow[0]) / 2,
    wristRadius: (wrist[1] - wrist[0]) / 2,
    hipHalfWidth: Math.max(-hips[0], hips[1]),
    headBack: joint.head.z - headZ[0],
    mouth: told && told.length >= 3 ? new THREE.Vector3().fromArray(told) : mouth,
    height: top,
  }
}

// --------------------------------------------------------- the antennae ----

/**
 * One antenna: the chain of bones it is rigged with, from the head outward,
 * the direction it stands in (in the head bone's space, bind pose) and its
 * length from where it leaves the head to the middle of the ball at its tip.
 */
export type Antenna = { bones: THREE.Bone[]; axis: THREE.Vector3; tip: THREE.Vector3; length: number }

/** The antennae the manifest describes, for those whose bones are in the skeleton. */
export function findAntennae(rig: Rig): Antenna[] {
  const byName = new Map(rig.mesh.skeleton.bones.map((bone) => [bone.name, bone]))
  const toHead = new THREE.Matrix4().copy(rig.bones.head.matrixWorld).invert().multiply(rig.object.matrixWorld)
  const found: Antenna[] = []
  for (const hint of rig.manifest.bind?.antennae ?? []) {
    const bones = (hint.bones ?? []).flatMap((name) => byName.get(name) ?? [])
    if (bones.length === 0 || !hint.base || !hint.tip || hint.base.length < 3 || hint.tip.length < 3) continue
    const base = new THREE.Vector3().fromArray(hint.base).applyMatrix4(toHead)
    const tip = new THREE.Vector3().fromArray(hint.tip).applyMatrix4(toHead)
    found.push({ bones, axis: tip.clone().sub(base).normalize(), tip, length: tip.distanceTo(base) })
  }
  return found
}

// -------------------------------------------------------------- texture ----

/** Reads a texture back at a small size, so its colours can be looked up by UV on the CPU. Linear values, 0..255. */
export function readTexture(renderer: THREE.WebGLRenderer, texture: THREE.Texture, size = 512) {
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false })
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  // The quad's own UVs run 0..1 across the texture whatever its transform or flip
  scene.add(quad)
  // The renderer shares its GL context with the site's other scenes, and this runs while the actor
  // is being built, which may be between two frames of one of them. three.js remembers what it last
  // bound and set; that memory is wrong after someone else has drawn, and a draw made on it reads
  // back as black. So it is told to forget before drawing here, and again after, for whoever is next.
  renderer.resetState()
  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)
  const data = new Uint8Array(size * size * 4)
  renderer.readRenderTargetPixels(target, 0, 0, size, size, data)
  renderer.setRenderTarget(previous)
  renderer.resetState()
  target.dispose()
  quad.geometry.dispose()
  material.dispose()
  return {
    /** Colour at (u, v) as [r, g, b], each 0..1 and linear. */
    at(u: number, v: number, out: [number, number, number]) {
      // The copy was drawn with the texture's own coordinates, so (u, v) finds the same texel the mesh would
      const x = Math.min(size - 1, Math.max(0, Math.floor((u - Math.floor(u)) * size)))
      const y = Math.min(size - 1, Math.max(0, Math.floor((v - Math.floor(v)) * size)))
      const o = (y * size + x) * 4
      out[0] = data[o] / 255
      out[1] = data[o + 1] / 255
      out[2] = data[o + 2] / 255
      return out
    },
  }
}
export type TextureReader = ReturnType<typeof readTexture>

// ------------------------------------------------------------- the eyes ----

/**
 * One painted eye in the bind pose, model space: the middle of the dark
 * patch, the direction it faces, its long and short directions across the
 * face, and its half-length and half-height.
 */
export type Eye = {
  centre: THREE.Vector3
  normal: THREE.Vector3
  /** Along the eye's length, pointing away from the nose. */
  long: THREE.Vector3
  /** Up the eye, at right angles to both. */
  up: THREE.Vector3
  halfLength: number
  halfHeight: number
  /** Where the painted rim lies along `normal`, measured from `centre` (it is behind the middle, so negative). */
  rim: number
  /** How far the painted surface domes out between its rim and its highest point. */
  dome: number
}

/**
 * Finds the eyes: the vertices on the front of the head whose texture is
 * nearly black, split left and right, with a plane and an outline fitted to
 * each. Where the manifest gives a centre and radii they bound the search.
 */
export function findEyes(rig: Rig, cloud: Cloud, texture: TextureReader | null): Eye[] {
  const head = rig.mesh.skeleton.bones.indexOf(rig.bones.head)
  const uv = rig.mesh.geometry.getAttribute('uv')
  const colour: [number, number, number] = [0, 0, 0]
  const headAt = rig.bones.head.getWorldPosition(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().copy(rig.object.matrixWorld).invert())
  const eyes: Eye[] = []

  for (const side of [1, -1]) {
    const hint = side > 0 ? rig.manifest.bind?.eyes?.left : rig.manifest.bind?.eyes?.right
    const hintCentre = hint?.center && hint.center.length >= 3 ? new THREE.Vector3().fromArray(hint.center) : null
    const hintRadius = hint?.radii && hint.radii.length >= 3 ? Math.max(...hint.radii) * 1.6 : Infinity
    const dark: number[] = []
    const p = new THREE.Vector3()
    let looked = 0
    if (texture && uv) {
      for (let i = 0; i < cloud.count; i++) {
        if (cloud.bone[i] !== head) continue
        p.fromArray(cloud.positions, i * 3)
        // The front of the face, on this side, above the mouth
        if (p.x * side <= 0.004 || p.z < headAt.z + 0.02 || p.y < headAt.y - 0.01) continue
        if (hintCentre && p.distanceTo(hintCentre) > hintRadius) continue
        looked++
        texture.at(uv.getX(i), uv.getY(i), colour)
        if (colour[0] + colour[1] + colour[2] < 0.06) dark.push(p.x, p.y, p.z)
      }
    }
    if (dark.length < 36) continue
    // An eye is a dark patch on a face that is not dark. If nearly everything looked at came back
    // black, the texture was not read (see readTexture) and what would be fitted is the whole search
    // area: eyes the size of goggles. Better no shells at all; the eyes painted on the model remain.
    if (dark.length / 3 > looked * 0.85) continue

    // Drop strays (nostrils, creases): keep what is within reach of the patch's middle
    let fit = principalAxes(dark)
    const kept: number[] = []
    const middle = new THREE.Vector3().fromArray(fit.centre)
    for (let i = 0; i < dark.length; i += 3) {
      p.fromArray(dark, i)
      if (p.distanceTo(middle) < fit.spread[0] * 2.6) kept.push(p.x, p.y, p.z)
    }
    fit = principalAxes(kept)
    const centre = new THREE.Vector3().fromArray(fit.centre)
    const normal = new THREE.Vector3().fromArray(fit.axes[2])
    if (normal.dot(p.copy(centre).sub(headAt)) < 0) normal.negate()
    const long = new THREE.Vector3().fromArray(fit.axes[0])
    if (long.x * side < 0) long.negate()
    const up = new THREE.Vector3().crossVectors(normal, long)
    if (up.y < 0) up.negate()
    // Re-make `long` so the three are a right-handed set whichever way the fit came out
    long.crossVectors(up, normal)

    let halfLength = 0
    let halfHeight = 0
    let front = -Infinity
    const rim: number[] = []
    for (let i = 0; i < kept.length; i += 3) {
      p.fromArray(kept, i).sub(centre)
      halfLength = Math.max(halfLength, Math.abs(p.dot(long)))
      halfHeight = Math.max(halfHeight, Math.abs(p.dot(up)))
      front = Math.max(front, p.dot(normal))
    }
    for (let i = 0; i < kept.length; i += 3) {
      p.fromArray(kept, i).sub(centre)
      const a = p.dot(long) / halfLength
      const b = p.dot(up) / halfHeight
      if (a * a + b * b > 0.7) rim.push(p.dot(normal))
    }
    const rimDepth = rim.length ? rim.reduce((sum, d) => sum + d, 0) / rim.length : 0

    eyes.push({ centre, normal, long, up, halfLength, halfHeight, rim: rimDepth, dome: Math.max(front - rimDepth, 0) })
  }
  return eyes
}

// ------------------------------------------------------------ the hands ----

/**
 * One hand in the bind pose, model space. The hands are modelled open and
 * have no bones of their own, so to close one round a bottle the actor bends the
 * mesh itself; this is the frame that bending is done in.
 */
export type Hand = {
  /** Index of the hand's bone in the skeleton. */
  bone: number
  wrist: THREE.Vector3
  /** From the wrist toward the fingertips. */
  fingers: THREE.Vector3
  /** Out of the palm. */
  palm: THREE.Vector3
  /** Across the palm, toward the thumb's side. */
  thumbSide: THREE.Vector3
  /** From the wrist to the furthest fingertip. */
  length: number
  /** Distance along `fingers` from the wrist to where the fingers separate. */
  knuckles: number
  /** Half the thickness of a finger. */
  fingerRadius: number
  /** The vertices of the thumb's free end (it stands apart from the fingers and is left as it is when they close). */
  thumb: Set<number>
  /** Indices of the vertices that mostly follow the hand's bone. */
  vertices: number[]
}

export function measureHand(rig: Rig, cloud: Cloud, side: 'left' | 'right'): Hand | null {
  const handBone = rig.bones[side === 'left' ? 'leftHand' : 'rightHand']
  const foreArm = rig.bones[side === 'left' ? 'leftForeArm' : 'rightForeArm']
  const bone = rig.mesh.skeleton.bones.indexOf(handBone)
  const toModel = new THREE.Matrix4().copy(rig.object.matrixWorld).invert()
  const wrist = handBone.getWorldPosition(new THREE.Vector3()).applyMatrix4(toModel)
  const elbow = foreArm.getWorldPosition(new THREE.Vector3()).applyMatrix4(toModel)

  const vertices: number[] = []
  const flat: number[] = []
  for (let i = 0; i < cloud.count; i++) {
    if (cloud.bone[i] !== bone) continue
    vertices.push(i)
    flat.push(cloud.positions[i * 3], cloud.positions[i * 3 + 1], cloud.positions[i * 3 + 2])
  }
  if (vertices.length < 60) return null

  // The hand is flattest across the palm; its fingers carry on from the forearm
  const fit = principalAxes(flat)
  const palm = new THREE.Vector3().fromArray(fit.axes[2])
  const fingers = wrist.clone().sub(elbow)
  fingers.addScaledVector(palm, -fingers.dot(palm)).normalize()
  const across = new THREE.Vector3().crossVectors(palm, fingers).normalize()

  // In hand coordinates: s along the fingers, l across the palm, h out of it
  const p = new THREE.Vector3()
  const coords = vertices.map((i) => {
    p.fromArray(cloud.positions, i * 3).sub(wrist)
    return { s: p.dot(fingers), l: p.dot(across), h: p.dot(palm), r: p.length() }
  })
  const length = coords.reduce((max, c) => Math.max(max, c.s), 0)

  // Connected pieces of the hand beyond a given reach from the wrist: far enough out, each digit is its own piece
  const key = (i: number) => `${Math.round(cloud.positions[i * 3] * 5000)},${Math.round(cloud.positions[i * 3 + 1] * 5000)},${Math.round(cloud.positions[i * 3 + 2] * 5000)}`
  const local = new Map<number, number>()
  vertices.forEach((v, k) => local.set(v, k))
  const welded = new Map<string, number>()
  const weld = vertices.map((v, k) => {
    const id = key(v)
    if (!welded.has(id)) welded.set(id, k)
    return welded.get(id) as number
  })
  const edges: [number, number][] = []
  const index = rig.mesh.geometry.index
  if (index) {
    for (let t = 0; t < index.count; t += 3) {
      const a = local.get(index.getX(t))
      const b = local.get(index.getX(t + 1))
      const c = local.get(index.getX(t + 2))
      if (a === undefined || b === undefined || c === undefined) continue
      edges.push([weld[a], weld[b]], [weld[b], weld[c]])
    }
  }
  const pieces = (reach: number) => {
    const parent = weld.map((w) => w)
    const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])))
    for (const [a, b] of edges) if (coords[a].r > reach && coords[b].r > reach) parent[find(a)] = find(b)
    const groups = new Map<number, number[]>()
    coords.forEach((c, k) => {
      if (c.r <= reach) return
      const rootOf = find(weld[k])
      const group = groups.get(rootOf)
      if (group) group.push(k)
      else groups.set(rootOf, [k])
    })
    return [...groups.values()].filter((group) => group.length > 12)
  }
  // Sweep the reach outward and keep the split with the most digits (preferring the nearest such reach)
  let digits: number[][] = []
  let digitsReach = 0
  for (let f = 0.3; f < 0.9; f += 0.025) {
    const found = pieces(length * f)
    if (found.length > digits.length) {
      digits = found
      digitsReach = length * f
    }
  }

  // Each digit's direction from the wrist, as an angle across the palm from the fingers' line
  const described = digits.map((group) => {
    let s = 0
    let l = 0
    let tip = 0
    for (const k of group) {
      s += coords[k].s / group.length
      l += coords[k].l / group.length
      tip = Math.max(tip, coords[k].r)
    }
    return { group, angle: Math.atan2(l, s), tip }
  })
  // The thumb is the digit that stands furthest off to one side
  described.sort((a, b) => a.angle - b.angle)
  const thumb = new Set<number>()
  let thumbSign = side === 'right' ? -1 : 1
  let fingerDigits = described
  if (described.length >= 3) {
    const first = described[0]
    const last = described[described.length - 1]
    const gapFirst = described[1].angle - first.angle
    const gapLast = last.angle - described[described.length - 2].angle
    const lone = gapFirst > gapLast ? first : last
    thumbSign = Math.sign(lone.angle) || thumbSign
    fingerDigits = described.filter((d) => d !== lone)
    for (const k of lone.group) thumb.add(vertices[k])
  }
  const thumbSide = across.clone().multiplyScalar(thumbSign)
  // Out of the palm: for a right hand, thumb × fingers; mirrored for a left
  const outOfPalm = new THREE.Vector3().crossVectors(thumbSide, fingers).multiplyScalar(side === 'right' ? 1 : -1).normalize()

  // The fingers separate where the split was found; their thickness is read off the pieces beyond it
  let radius = 0
  for (const d of fingerDigits) {
    let lo = Infinity
    let hi = -Infinity
    for (const k of d.group) {
      const h = coords[k].h
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
    radius += (hi - lo) / 2 / Math.max(fingerDigits.length, 1)
  }
  return {
    bone,
    wrist,
    fingers,
    palm: outOfPalm,
    thumbSide,
    length,
    knuckles: digitsReach * 0.92,
    fingerRadius: radius || length * 0.07,
    thumb,
    vertices,
  }
}
