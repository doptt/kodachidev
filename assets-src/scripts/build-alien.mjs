// Builds public/models/alien.glb: one skinned mesh, one skeleton, every clip.
//
//   node assets-src/scripts/build-alien.mjs [--config assets-src/alien.config.json] [--out public/models/alien.glb]
//     [--draft]                               skip the texture and geometry compression (a plain GLB any loader reads)
//     [--texture ktx2|webp]                   texture format, if not the config's
//     [--facts assets-src/raw/alien.facts.json]   where to leave the measurements for make-manifest.mjs
//
// The rigging service returns a GLB with its own copy of the mesh and its own fit of the skeleton, in
// centimetres under an "Armature" node scaled by 0.01. This:
//   1. reads the skeleton from config.rig and rebuilds it in metres with no scaled parent,
//   2. puts the clean, baked mesh (config.mesh) on it, taking each vertex's skin weights from the nearest part
//      of the rig file's mesh,
//   3. adds bones for the antennae (config.antennae), so they can be sprung,
//   4. retargets every clip in config.clips onto that skeleton. The clip files were rigged on another body in
//      other runs of the service; all that has to match is the bones' names and tree,
//   5. reshapes each clip for this character and his chair: mirrors it if asked, reclines the torso, levels the
//      head, keeps resting hands where they were and brings a drinking hand to the mouth (see "Fitting"),
//   6. adds the authored clips (a held pose with breathing),
//   7. compresses geometry with meshopt and textures to KTX2 or WebP.
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { copyToDocument, createDefaultPropertyResolver, dedup, meshopt, prune, resample, textureCompress } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { texturesToKtx2 } from './lib/ktx.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = args[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}
const config = JSON.parse(readFileSync(String(flag('config', 'assets-src/alien.config.json')), 'utf8'))
const outPath = String(flag('out', 'public/models/alien.glb'))
const draft = flag('draft', false) === true
const factsPath = String(flag('facts', 'assets-src/raw/alien.facts.json'))
// ktx2 or webp; the config's choice unless given here (the WebP copy is the fallback file)
const textureFormat = String(flag('texture', config.textureFormat))

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const round = (n, digits = 4) => Number(n.toFixed(digits))
const radians = (degrees) => (degrees * Math.PI) / 180
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const X_AXIS = new Vector3(1, 0, 0)
const aboutX = (angle) => new Quaternion().setFromAxisAngle(X_AXIS, angle)

// ---------------------------------------------------------------------------------------------------------
// Reading a rig file

/** The skeleton and skinned mesh of one rig file, with everything brought into metres in model space. */
async function readRig(file) {
  const doc = await io.read(file)
  const root = doc.getRoot()
  const skin = root.listSkins()[0]
  const joints = skin.listJoints()
  const meshNode = root.listNodes().find((node) => node.getSkin() === skin)
  const armature = joints[0].getParentNode()
  const scale = armature ? armature.getScale()[0] : 1
  if (armature) {
    const [sx, sy, sz] = armature.getScale()
    const offCentre = Math.hypot(...armature.getTranslation()) > 1e-6 || Math.abs(armature.getRotation()[3]) < 0.999999
    if (Math.abs(sx - sy) > 1e-6 || Math.abs(sx - sz) > 1e-6 || offCentre) throw new Error(`${file}: the armature node is more than a uniform scale`)
  }

  // Parents come before their children in the service's joint list, which the world-space passes below rely on
  const bones = joints.map((joint) => ({
    name: joint.getName(),
    parent: joints.indexOf(joint.getParentNode()),
    translation: joint.getTranslation().map((n) => n * scale),
    rotation: joint.getRotation(),
  }))
  bones.forEach((bone, i) => {
    if (bone.parent >= i) throw new Error(`${file}: bone ${bone.name} is listed before its parent`)
    if (joints[i].getScale().some((n) => Math.abs(n - 1) > 1e-4)) throw new Error(`${file}: bone ${bone.name} is scaled at rest`)
  })

  // In the bind pose every joint's world matrix times its inverse bind matrix is one and the same matrix:
  // the one that takes the stored vertices to where they stand in the world
  const inverseBind = skin.getInverseBindMatrices().getArray()
  const toWorld = new Matrix4().fromArray(joints[0].getWorldMatrix()).multiply(new Matrix4().fromArray(inverseBind, 0))
  let drift = 0
  joints.forEach((joint, j) => {
    const m = new Matrix4().fromArray(joint.getWorldMatrix()).multiply(new Matrix4().fromArray(inverseBind, j * 16))
    for (let k = 0; k < 16; k++) drift = Math.max(drift, Math.abs(m.elements[k] - toWorld.elements[k]))
  })
  if (drift > 1e-3) throw new Error(`${file}: the rest pose is not the bind pose (drift ${drift})`)

  const primitive = meshNode.getMesh().listPrimitives()[0]
  const count = primitive.getAttribute('POSITION').getCount()
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const v = new Vector3()
  const srcPositions = primitive.getAttribute('POSITION').getArray()
  const srcNormals = primitive.getAttribute('NORMAL').getArray()
  for (let i = 0; i < count; i++) {
    v.fromArray(srcPositions, i * 3).applyMatrix4(toWorld).toArray(positions, i * 3)
    v.fromArray(srcNormals, i * 3).transformDirection(toWorld).toArray(normals, i * 3)
  }
  return { file, doc, primitive, bones, scale, positions, normals, count }
}

/** World matrices of a list of bones at rest. */
function worldMatrices(list) {
  const world = []
  list.forEach((bone, i) => {
    const local = new Matrix4().compose(new Vector3().fromArray(bone.translation), new Quaternion().fromArray(bone.rotation), new Vector3(1, 1, 1))
    world[i] = bone.parent >= 0 ? world[bone.parent].clone().multiply(local) : local
  })
  return world
}

/** World rotations of a list of bones, given each one's local rotation. */
function worldRotations(list, locals) {
  const world = []
  list.forEach((bone, i) => {
    world[i] = bone.parent >= 0 ? world[bone.parent].clone().multiply(locals[i]) : locals[i].clone()
  })
  return world
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i])
    max[i % 3] = Math.max(max[i % 3], positions[i])
  }
  return { min, max }
}

// ---------------------------------------------------------------------------------------------------------
// The skeleton

const base = await readRig(config.rig)
const bones = base.bones.map((bone) => ({ ...bone }))
const libraryBones = bones.length
const indexOf = (name) => {
  const index = base.bones.findIndex((bone) => bone.name === name)
  if (index < 0) throw new Error(`the rig has no bone called ${name}`)
  return index
}

// ---------------------------------------------------------------------------------------------------------
// The mesh: the clean one, borrowing the rig mesh's weights

const rigPrimitive = base.primitive
const rigWeights = rigPrimitive.getAttribute('WEIGHTS_0')
const weightScale = rigWeights.getNormalized() ? (rigWeights.getComponentSize() === 1 ? 255 : 65535) : 1
const rigJoints = rigPrimitive.getAttribute('JOINTS_0').getArray()
const rigWeightValues = Float32Array.from(rigWeights.getArray(), (w) => w / weightScale)

const cleanDoc = await io.read(config.mesh)
const cleanPrimitive = cleanDoc.getRoot().listMeshes()[0].listPrimitives()[0]
const vertexCount = cleanPrimitive.getAttribute('POSITION').getCount()
const mesh = {
  positions: Float32Array.from(cleanPrimitive.getAttribute('POSITION').getArray()),
  normals: Float32Array.from(cleanPrimitive.getAttribute('NORMAL').getArray()),
  uvs: cleanPrimitive.getAttribute('TEXCOORD_0').getArray(),
  indices: cleanPrimitive.getIndices().getArray(),
  joints: new Uint16Array(vertexCount * 4),
  weights: new Float32Array(vertexCount * 4),
  // Which antenna each vertex belongs to, as bake.mjs marked it (0 none, 1 his left, 2 his right)
  antennaOf: cleanPrimitive.getAttribute('_ANTENNA')?.getArray() ?? null,
}

// The rigging service scaled the mesh to the asked height and centred it; do the same to the clean mesh by
// matching bounding boxes (the two are the same surface)
const fit = (() => {
  const from = bounds(mesh.positions)
  const to = bounds(base.positions)
  const scale = (to.max[1] - to.min[1]) / (from.max[1] - from.min[1])
  return { scale, offset: [0, 1, 2].map((k) => (to.min[k] + to.max[k]) / 2 - (scale * (from.min[k] + from.max[k])) / 2) }
})()
for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] = mesh.positions[i] * fit.scale + fit.offset[i % 3]
const place = (point) => point.map((n, k) => n * fit.scale + fit.offset[k])

{
  // Skin weights from the rig's mesh. For each clean vertex: the nearest few rig vertices whose surface faces
  // the same way (so a finger never borrows from the finger beside it), blended by inverse square distance
  const cell = 0.01
  const grid = new Map()
  for (let i = 0; i < base.count; i++) {
    const key = `${Math.floor(base.positions[i * 3] / cell)},${Math.floor(base.positions[i * 3 + 1] / cell)},${Math.floor(base.positions[i * 3 + 2] / cell)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(i)
  }
  let worst = 0
  let total = 0
  for (let i = 0; i < vertexCount; i++) {
    const [px, py, pz] = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]
    const [nx, ny, nz] = [mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]]
    const [cx, cy, cz] = [Math.floor(px / cell), Math.floor(py / cell), Math.floor(pz / cell)]
    let found = []
    // First among rig vertices facing the same way, within 3 cm; then, for the few clean vertices inside a
    // crease the rig's mesh smoothed over, among any
    for (const [minFacing, maxReach] of [
      [0.2, 3],
      [-2, 8],
    ]) {
      for (let reach = 1; reach <= maxReach && found.length < 4; reach++) {
        found = []
        for (let x = cx - reach; x <= cx + reach; x++) {
          for (let y = cy - reach; y <= cy + reach; y++) {
            for (let z = cz - reach; z <= cz + reach; z++) {
              for (const r of grid.get(`${x},${y},${z}`) ?? []) {
                const facing = nx * base.normals[r * 3] + ny * base.normals[r * 3 + 1] + nz * base.normals[r * 3 + 2]
                if (facing < minFacing) continue
                const d = Math.hypot(px - base.positions[r * 3], py - base.positions[r * 3 + 1], pz - base.positions[r * 3 + 2])
                // Only what lies within the searched cube's inscribed sphere is certainly the nearest
                if (d <= reach * cell) found.push([d, r])
              }
            }
          }
        }
      }
      if (found.length) break
    }
    if (found.length === 0) throw new Error(`no rig vertex near clean vertex ${i}`)
    found.sort((a, b) => a[0] - b[0])
    worst = Math.max(worst, found[0][0])
    total += found[0][0]
    const blend = new Map()
    for (const [d, r] of found.slice(0, 4)) {
      const share = 1 / (d + 1e-4) ** 2
      for (let k = 0; k < 4; k++) {
        const w = rigWeightValues[r * 4 + k]
        if (w > 0) blend.set(rigJoints[r * 4 + k], (blend.get(rigJoints[r * 4 + k]) ?? 0) + w * share)
      }
    }
    const top = [...blend.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    const sum = top.reduce((s, [, w]) => s + w, 0)
    top.forEach(([joint, w], k) => {
      mesh.joints[i * 4 + k] = joint
      mesh.weights[i * 4 + k] = w / sum
    })
  }
  console.log(`weights carried to the clean mesh: mean distance ${((total / vertexCount) * 1000).toFixed(2)} mm, worst ${(worst * 1000).toFixed(2)} mm`)
}

// What bake.mjs measured on the clean mesh, moved into the final model space
const bake = JSON.parse(readFileSync(config.bakeFacts, 'utf8'))
const bind = {
  eyes: Object.fromEntries(
    ['left', 'right'].map((side) => [side, { center: place(bake.eyes[side].center), radii: bake.eyes[side].radii.map((n) => n * fit.scale), forward: bake.eyes[side].forward }]),
  ),
  antennae: bake.antennae.map((antenna) => ({
    side: antenna.side,
    base: place(antenna.base),
    tip: place(antenna.tip),
    ballRadius: antenna.ballRadius * fit.scale,
    stalkRadius: antenna.stalkRadius * fit.scale,
  })),
  // The middle of the lips: at the height the config gives (read off a front view), on the centre line, at the
  // front of the mesh there
  mouth: (() => {
    let front = -Infinity
    for (let i = 0; i < vertexCount; i++) {
      if (Math.abs(mesh.positions[i * 3]) < 0.008 && Math.abs(mesh.positions[i * 3 + 1] - config.mouthHeight) < 0.005) front = Math.max(front, mesh.positions[i * 3 + 2])
    }
    return [0, config.mouthHeight, front]
  })(),
}

// ---------------------------------------------------------------------------------------------------------
// Antenna bones: a short chain up each antenna, children of the head, so the antennae can be sprung

if (config.antennae && mesh.antennaOf) {
  const head = bones.findIndex((bone) => bone.name === config.antennae.parent)
  const headWorld = worldMatrices(bones)[head]
  const headInverse = headWorld.clone().invert()
  const toHeadFrame = new Quaternion().setFromRotationMatrix(headWorld).invert()
  const segments = config.antennae.segments
  for (const antenna of bind.antennae) {
    // The joints sit at equal steps along the straight line from the base to the ball's centre, and the bones
    // keep the head's orientation at rest (identity local rotation), so springing one is a plain rotation
    // about its own origin
    const baseAt = new Vector3().fromArray(antenna.base)
    const tipAt = new Vector3().fromArray(antenna.tip)
    const step = tipAt.clone().sub(baseAt).divideScalar(segments)
    const prefix = antenna.side === 'left' ? 'LeftAntenna' : 'RightAntenna'
    const chain = []
    for (let s = 0; s < segments; s++) {
      const translation = s === 0 ? baseAt.clone().applyMatrix4(headInverse) : step.clone().applyQuaternion(toHeadFrame)
      bones.push({ name: `${prefix}${s + 1}`, parent: s === 0 ? head : bones.length - 1, translation: translation.toArray(), rotation: [0, 0, 0, 1] })
      chain.push(bones.length - 1)
    }
    antenna.bones = chain.map((index) => bones[index].name)

    // Around each joint the skin eases, over half a segment either side, from the bone below (the head, at the
    // base) to the bone that starts there; the ball rides the last bone whole
    const length = step.length() * segments
    const axis = step.clone().normalize()
    const p = new Vector3()
    const mark = antenna.side === 'left' ? 1 : 2
    let claimed = 0
    for (let i = 0; i < vertexCount; i++) {
      if (mesh.antennaOf[i] !== mark) continue
      p.fromArray(mesh.positions, i * 3).sub(baseAt)
      const u = Math.max(-0.5, (p.dot(axis) / length) * segments)
      claimed++
      const joint = Math.min(Math.max(Math.round(u), 0), segments - 1)
      const upper = chain[joint]
      const lower = joint === 0 ? head : chain[joint - 1]
      const share = Math.min(1, Math.max(0, 0.5 + (u - joint)))
      const influences = [
        [upper, share],
        [lower, 1 - share],
      ]
      for (let k = 0; k < 4; k++) {
        mesh.joints[i * 4 + k] = influences[k] && influences[k][1] > 0 ? influences[k][0] : 0
        mesh.weights[i * 4 + k] = influences[k]?.[1] ?? 0
      }
    }
    console.log(`${prefix}: ${claimed} vertices on ${segments} bones`)
  }
}

// ---------------------------------------------------------------------------------------------------------
// The new document

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('scene')
const rootNode = doc.createNode(config.rootName)
scene.addChild(rootNode)
doc.getRoot().setDefaultScene(scene)

const boneNodes = bones.map((bone) => doc.createNode(bone.name).setTranslation(bone.translation).setRotation(bone.rotation))
bones.forEach((bone, i) => (bone.parent >= 0 ? boneNodes[bone.parent] : rootNode).addChild(boneNodes[i]))

const world = worldMatrices(bones)
const inverseBind = new Float32Array(bones.length * 16)
world.forEach((matrix, i) => matrix.clone().invert().toArray(inverseBind, i * 16))
const accessor = (name, type, array) => doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer)
const skin = doc.createSkin('skeleton').setSkeleton(boneNodes[0]).setInverseBindMatrices(accessor('inverseBind', 'MAT4', inverseBind))
for (const node of boneNodes) skin.addJoint(node)

const cleanMaterial = cleanPrimitive.getMaterial()
const material = copyToDocument(doc, cleanDoc, [cleanMaterial], createDefaultPropertyResolver(doc, cleanDoc)).get(cleanMaterial)
material.setName('alien')

const primitive = doc
  .createPrimitive()
  .setAttribute('POSITION', accessor('position', 'VEC3', mesh.positions))
  .setAttribute('NORMAL', accessor('normal', 'VEC3', mesh.normals))
  .setAttribute('TEXCOORD_0', accessor('uv', 'VEC2', Float32Array.from(mesh.uvs)))
  .setAttribute('JOINTS_0', accessor('joints', 'VEC4', Uint8Array.from(mesh.joints)))
  .setAttribute('WEIGHTS_0', accessor('weights', 'VEC4', mesh.weights))
  .setIndices(accessor('indices', 'SCALAR', Uint32Array.from(mesh.indices)))
  .setMaterial(material)
rootNode.addChild(doc.createNode(config.meshName).setMesh(doc.createMesh(config.meshName).addPrimitive(primitive)).setSkin(skin))

// ---------------------------------------------------------------------------------------------------------
// The clips, retargeted onto this skeleton
//
// A bone deforms the mesh by its world rotation relative to its world rotation at rest. So that is what is
// carried across: for every key, each source bone's world rotation away from its own rest pose is applied to
// the target bone's rest pose. Two fits of the skeleton that rest differently then move the mesh alike. The
// hips' travel is scaled by how tall the two skeletons' hips stand.

const restLocal = base.bones.map((bone) => new Quaternion().fromArray(bone.rotation))
const restWorld = worldRotations(base.bones, restLocal)
const restWorldInverse = restWorld.map((q) => q.clone().invert())
const restMatrices = worldMatrices(base.bones)
const restPosition = restMatrices.map((matrix) => new Vector3().setFromMatrixPosition(matrix))
const offsets = base.bones.map((bone) => new Vector3().fromArray(bone.translation))
// For a mirrored clip: each bone takes the motion of the bone across the body
const partner = base.bones.map((bone) => {
  const name = bone.name.startsWith('Left') ? bone.name.replace('Left', 'Right') : bone.name.startsWith('Right') ? bone.name.replace('Right', 'Left') : bone.name
  return indexOf(name)
})

/** A clip read from its file as, per key, every target bone's world rotation and the hips' position. */
const sources = new Map()
async function readClip({ file, mirror }) {
  if (!sources.has(file)) sources.set(file, await readRig(file))
  const rig = sources.get(file)
  if (rig.bones.length !== base.bones.length) throw new Error(`${file}: ${rig.bones.length} bones, expected ${base.bones.length}`)
  rig.bones.forEach((bone, i) => {
    if (bone.name !== base.bones[i].name || bone.parent !== base.bones[i].parent) throw new Error(`${file}: bone ${i} is ${bone.name}, expected ${base.bones[i].name}`)
  })
  const channels = rig.doc.getRoot().listAnimations()[0].listChannels()
  const times = Float32Array.from(channels[0].getSampler().getInput().getArray())
  const keys = times.length
  const rotations = new Map()
  let hipsTravel = null
  for (const channel of channels) {
    const boneIndex = rig.bones.findIndex((bone) => bone.name === channel.getTargetNode().getName())
    if (boneIndex < 0) throw new Error(`${file}: the clip moves an unknown node ${channel.getTargetNode().getName()}`)
    const sampler = channel.getSampler()
    const input = sampler.getInput().getArray()
    if (input.length !== keys || Math.abs(input[keys - 1] - times[keys - 1]) > 1e-6) throw new Error(`${file}: channels with different key times`)
    if (sampler.getInterpolation() !== 'LINEAR') throw new Error(`${file}: ${sampler.getInterpolation()} keys are not handled`)
    const values = sampler.getOutput().getArray()
    const targetPath = channel.getTargetPath()
    if (targetPath === 'rotation') rotations.set(boneIndex, values)
    else if (targetPath === 'translation' && boneIndex === 0) hipsTravel = values
    // The library clips never scale a bone: check, then leave the channel out. Translations of bones other
    // than the hips are constant offsets of a few millimetres and are left out too
    else if (targetPath === 'scale' && values.some((n) => Math.abs(n - 1) > 1e-3)) throw new Error(`${file}: ${rig.bones[boneIndex].name} is scaled by the clip`)
  }

  const sourceRest = rig.bones.map((bone) => new Quaternion().fromArray(bone.rotation))
  const sourceRestWorldInverse = worldRotations(rig.bones, sourceRest).map((q) => q.invert())
  const hipsScale = base.bones[0].translation[1] / rig.bones[0].translation[1]
  const frames = []
  for (let f = 0; f < keys; f++) {
    const locals = rig.bones.map((_, i) => (rotations.has(i) ? new Quaternion().fromArray(rotations.get(i), f * 4).normalize() : sourceRest[i]))
    // How far each bone has turned, in the world, from its own rest pose
    const turned = worldRotations(rig.bones, locals).map((q, i) => q.multiply(sourceRestWorldInverse[i]))
    const hips = hipsTravel ? new Vector3().fromArray(hipsTravel, f * 3).multiplyScalar(rig.scale * hipsScale) : restPosition[0].clone()
    if (mirror) hips.x = -hips.x
    frames.push({
      // Reflecting a rotation in the plane x = 0 keeps its x and w and flips its y and z
      rotations: base.bones.map((_, i) => {
        const q = mirror ? turned[partner[i]] : turned[i]
        return (mirror ? new Quaternion(q.x, -q.y, -q.z, q.w) : q.clone()).multiply(restWorld[i])
      }),
      hips,
    })
  }
  return { times: times.map((t) => t - times[0]), frames }
}

// ---------------------------------------------------------------------------------------------------------
// Fitting a clip to this character in his chair
//
// The library clips sit a human upright or hunched on a stool. He reclines in a lawn chair and has a head three
// times a human's. Each clip is therefore reshaped, key by key, in world space:
//   - the whole upper body is tipped back about the hips so that at the clip's first key the line from hips to
//     neck leans `recline` degrees behind vertical, and never more than `reclineLimit` (the chair back is in the
//     way); the legs keep their own directions,
//   - the neck and head are tipped back up by a fixed amount so that at the first key he looks level,
//   - a hand that was low (resting on a thigh or knee) stays where it was instead of riding back with the
//     torso; a raised hand (a gesture, a drink) rides with it. The arm is re-posed by two-bone IK,
//   - in a drinking clip the hand is steered to the mouth: on a human skeleton it arrives where a human mouth
//     is, which on this head is the eye.

const BONE = Object.fromEntries(['Hips', 'Spine', 'neck', 'Head', 'LeftUpLeg', 'RightUpLeg'].map((name) => [name, indexOf(name)]))
const ARMS = ['Left', 'Right'].map((side) => ({
  side,
  shoulder: indexOf(`${side}Shoulder`),
  upper: indexOf(`${side}Arm`),
  fore: indexOf(`${side}ForeArm`),
  hand: indexOf(`${side}Hand`),
}))
const isLeg = base.bones.map((bone) => /UpLeg|Leg$|Foot|ToeBase/.test(bone.name))

/** Where every bone's origin is, given world rotations and the hips' position. */
function jointPositions(rotations, hips) {
  const at = []
  base.bones.forEach((bone, i) => {
    at[i] = bone.parent >= 0 ? at[bone.parent].clone().add(offsets[i].clone().applyQuaternion(rotations[bone.parent])) : hips.clone()
  })
  return at
}

/** How far the hips-to-neck line leans forward of vertical, in radians (negative leans back). */
const lean = (at) => Math.atan2(at[BONE.neck].z - at[BONE.Hips].z, at[BONE.neck].y - at[BONE.Hips].y)

/** The larger of x and a floor, with a soft knee of `soft` either side of it. */
const softFloor = (x, floor, soft) => floor + soft * Math.log(1 + Math.exp((x - floor) / soft))

// The palm: a little way past the wrist, along the forearm, as it lies in the bind pose
const PALM = 0.06
const palmOffset = ARMS.map((arm) => restPosition[arm.hand].clone().sub(restPosition[arm.fore]).normalize().multiplyScalar(PALM).applyQuaternion(restWorldInverse[arm.hand]))
// The mouth as the head bone carries it
const mouthOnHead = new Vector3().fromArray(bind.mouth).sub(restPosition[BONE.Head]).applyQuaternion(restWorldInverse[BONE.Head])

function fitClip(clip, options) {
  const recline = radians(options.recline ?? config.fit.recline)
  const limit = radians(config.fit.reclineLimit)
  const firstLean = lean(jointPositions(clip.frames[0].rotations, clip.frames[0].hips))

  // Pass 1: recline, and find what tipping the head needs to look level at the first key
  const tipped = clip.frames.map(({ rotations, hips }) => {
    const before = jointPositions(rotations, hips)
    // The lean this key would have: what it leans forward of the first key counts for less (he is lounging, not
    // perched), and it never goes further back than the chair allows
    const beyond = lean(before) - firstLean
    const leaned = softFloor(-recline + (beyond > 0 ? beyond * config.fit.forwardGain : beyond), -limit, radians(4))
    const q = aboutX(leaned - lean(before))
    return { before, rotations: rotations.map((r, i) => (isLeg[i] ? r.clone() : q.clone().multiply(r))) }
  })
  let headTip = 0
  if (options.levelHead ?? true) {
    const forward = new Vector3(0, 0, 1).applyQuaternion(tipped[0].rotations[BONE.Head].clone().multiply(restWorldInverse[BONE.Head]))
    headTip = Math.max(-radians(50), Math.min(radians(50), Math.atan2(forward.y, Math.hypot(forward.x, forward.z)) - radians(config.fit.headPitch)))
  }

  // Pass 2: head, then arms
  const drink = options.handToMouth ? ARMS.findIndex((arm) => arm.side === options.handToMouth) : -1
  const timing = {}
  const posed = tipped.map(({ before, rotations }, f) => {
    // Turning about +X by a positive angle looks down: half the correction at the neck, all of it by the head
    rotations[BONE.neck].premultiply(aboutX(headTip / 2))
    rotations[BONE.Head].premultiply(aboutX(headTip))
    const hips = clip.frames[f].hips
    const at = jointPositions(rotations, hips)
    const original = clip.frames[f].rotations
    const wrists = ARMS.map((arm) => {
      // 1 for a hand resting low by the hips, 0 for one raised to chest height or above
      const resting = 1 - smoothstep(config.fit.restingBelow, config.fit.raisedAbove, before[arm.hand].y - before[BONE.Hips].y)
      return { resting, target: at[arm.hand].clone().lerp(before[arm.hand], resting) }
    })
    return { rotations, hips, at, original, wrists }
  })

  if (drink >= 0) {
    // What the palm lacks at the sip, in the head's own frame, is added to the wrist's target whenever the palm
    // is near where it was at the sip
    const arm = ARMS[drink]
    const onHead = (frame, point) => point.clone().sub(frame.at[BONE.Head]).applyQuaternion(frame.rotations[BONE.Head].clone().invert())
    const palmAt = (frame) => frame.at[arm.hand].clone().add(palmOffset[drink].clone().applyQuaternion(frame.rotations[arm.hand]))
    const headFrame = (frame) => frame.rotations[BONE.Head].clone().multiply(restWorldInverse[BONE.Head])
    const mouthAt = (frame) => frame.at[BONE.Head].clone().add(mouthOnHead.clone().applyQuaternion(frame.rotations[BONE.Head]))
    // The sip is the middle of the hold: the middle key of those with the palm within reach of the mouth
    const held = posed.map((frame, f) => (palmAt(frame).distanceTo(mouthAt(frame)) < config.fit.sipReach ? f : -1)).filter((f) => f >= 0)
    if (!held.length) throw new Error(`${options.name}: the ${arm.side.toLowerCase()} hand never comes within ${config.fit.sipReach} m of the mouth`)
    const sip = held[Math.floor(held.length / 2)]
    const wanted = mouthAt(posed[sip]).add(new Vector3().fromArray(config.fit.palmFromMouth).applyQuaternion(headFrame(posed[sip])))
    const lacking = onHead(posed[sip], wanted).sub(onHead(posed[sip], palmAt(posed[sip])))
    const sipPalm = onHead(posed[sip], palmAt(posed[sip]))
    for (const frame of posed) {
      const near = 1 - smoothstep(0.1, 0.3, onHead(frame, palmAt(frame)).distanceTo(sipPalm))
      frame.wrists[drink].target.add(lacking.clone().applyQuaternion(frame.rotations[BONE.Head]).multiplyScalar(near))
    }
    console.log(`${options.name}: sip at ${clip.times[sip].toFixed(2)} s, palm moved ${(lacking.length() * 100).toFixed(1)} cm to reach the mouth`)
    // When the hand is at the mouth, for whoever puts a mug in it
    timing.hold = [round(clip.times[held[0]], 2), round(clip.times[held[held.length - 1]], 2)]
    timing.hand = arm.side.toLowerCase()
  }

  for (const frame of posed) {
    ARMS.forEach((arm, a) => {
      const { resting, target } = frame.wrists[a]
      const shoulder = frame.at[arm.upper]
      const elbow = frame.at[arm.fore]
      const wrist = frame.at[arm.hand]
      const upperLength = elbow.distanceTo(shoulder)
      const foreLength = wrist.distanceTo(elbow)
      const toTarget = target.clone().sub(shoulder)
      // Within reach, and never quite straight or quite folded
      const reach = Math.min(Math.max(toTarget.length(), Math.abs(upperLength - foreLength) + 0.005), (upperLength + foreLength) * 0.995)
      const along = toTarget.clone().normalize()
      // The elbow stays on the side it was: in the plane of the shoulder, the target and the old elbow
      const side = elbow.clone().sub(shoulder)
      side.addScaledVector(along, -side.dot(along))
      if (side.lengthSq() < 1e-8) side.set(0, -1, 0).addScaledVector(along, along.y)
      side.normalize()
      const forward = (upperLength ** 2 - foreLength ** 2 + reach ** 2) / (2 * reach)
      const out = Math.sqrt(Math.max(0, upperLength ** 2 - forward ** 2))
      const newElbow = shoulder.clone().addScaledVector(along, forward).addScaledVector(side, out)
      const newWrist = shoulder.clone().addScaledVector(along, reach)
      const swing = new Quaternion().setFromUnitVectors(elbow.clone().sub(shoulder).normalize(), newElbow.clone().sub(shoulder).normalize())
      const bend = new Quaternion().setFromUnitVectors(wrist.clone().sub(elbow).applyQuaternion(swing).normalize(), newWrist.clone().sub(newElbow).normalize())
      frame.rotations[arm.upper].premultiply(swing)
      frame.rotations[arm.fore].premultiply(swing).premultiply(bend)
      // A resting hand keeps the way it lay; a raised one turns with the body
      frame.rotations[arm.hand].slerp(frame.original[arm.hand], resting)
    })
  }
  return { times: clip.times, frames: posed.map(({ rotations, hips }) => ({ rotations, hips })), timing }
}

// ---------------------------------------------------------------------------------------------------------
// Writing clips

/** Local rotations from world ones, each key kept on the same side of the quaternion sphere as the one before. */
function toLocal(frames) {
  const previous = base.bones.map(() => null)
  return frames.map(({ rotations }) =>
    base.bones.map((bone, i) => {
      const local = bone.parent >= 0 ? rotations[bone.parent].clone().invert().multiply(rotations[i]) : rotations[i].clone()
      if (previous[i] && previous[i].dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w)
      previous[i] = local
      return local
    }),
  )
}

const clipFacts = {}
const fitted = {}
function writeClip(name, clip, facts) {
  const keys = clip.times.length
  const locals = toLocal(clip.frames)
  const animation = doc.createAnimation(name)
  const timesAccessor = accessor(`${name}.times`, 'SCALAR', Float32Array.from(clip.times))
  const addChannel = (boneIndex, targetPath, type, values) => {
    const sampler = doc.createAnimationSampler().setInput(timesAccessor).setOutput(accessor(`${name}.${bones[boneIndex].name}.${targetPath}`, type, values)).setInterpolation('LINEAR')
    animation.addSampler(sampler)
    animation.addChannel(doc.createAnimationChannel().setTargetNode(boneNodes[boneIndex]).setTargetPath(targetPath).setSampler(sampler))
  }
  // Largest bone turn (radians) and hips travel (metres) between the last key and the first: zero is a clean loop
  let loopTurn = 0
  base.bones.forEach((_, i) => {
    const values = new Float32Array(keys * 4)
    locals.forEach((frame, f) => frame[i].toArray(values, f * 4))
    addChannel(i, 'rotation', 'VEC4', values)
    loopTurn = Math.max(loopTurn, 2 * Math.acos(Math.min(1, Math.abs(locals[0][i].dot(locals[keys - 1][i])))))
  })
  const travel = new Float32Array(keys * 3)
  clip.frames.forEach(({ hips }, f) => hips.toArray(travel, f * 3))
  addChannel(0, 'translation', 'VEC3', travel)
  clipFacts[name] = {
    duration: round(clip.times[keys - 1]),
    keys,
    loopTurn: round(loopTurn),
    loopTravel: round(clip.frames[0].hips.distanceTo(clip.frames[keys - 1].hips)),
    ...facts,
  }
}

for (const entry of config.clips) {
  const clip = fitClip(await readClip(entry), entry)
  // Each library clip was captured on its own chair, so the hips start anywhere from 32 to 43 cm up and, in one
  // clip, a third of a metre off centre. Every clip is moved so its first key puts the hips on one shared anchor,
  // and the clips then cross-fade without the seat jumping
  const start = clip.frames[0].hips.clone()
  for (const frame of clip.frames) frame.hips.sub(start).add(new Vector3().fromArray(config.hipsAnchor))
  fitted[entry.name] = clip
  writeClip(entry.name, clip, { source: entry.source, id: entry.id, mirrored: entry.mirror === true, ...(clip.timing.hold ? { handAtMouth: clip.timing } : {}) })
}

// ---------------------------------------------------------------------------------------------------------
// Authored clips: a fitted clip's first key held still, with a breathing cycle on top
//
// The library has no plain seated idle with the legs apart: its seated idles either cross the legs or act
// (chin on hand). A hold of another clip's opening pose is exactly where that clip starts, so the two join
// without a blend, and the breathing keeps the hold alive. Every term below has a period that divides the
// clip's length, so the clip loops exactly. Angles are in degrees about the bone's own axes: X pitches
// (positive leans forward), Y turns, Z rolls.

const BREATH_SECONDS = 4
for (const { name, poseFrom, duration } of config.authored ?? []) {
  const pose = fitted[poseFrom]?.frames[0]
  if (!pose) throw new Error(`authored clip ${name}: no clip called ${poseFrom} to take the pose from`)
  const keys = Math.round(duration * 30) + 1
  const times = Float32Array.from({ length: keys }, (_, f) => (f / (keys - 1)) * duration)
  // breath: 0 breathed out, 1 breathed in. sway: one slow cycle over the whole clip
  const breath = (t) => (1 - Math.cos((2 * Math.PI * t) / BREATH_SECONDS)) / 2
  const sway = (t, phase) => Math.sin((2 * Math.PI * t) / duration + phase)
  const layers = {
    Spine02: (t) => [-0.5 * breath(t), 0, 0.5 * sway(t, 0)],
    Spine01: (t) => [-0.8 * breath(t), 0, 0],
    Spine: (t) => [-1.2 * breath(t), 0, 0],
    // The neck and head give the chest's lift back, so the eyes stay level, and drift a little on their own
    neck: (t) => [1.1 * breath(t), 0, 0],
    Head: (t) => [0.9 * breath(t) + 0.8 * sway(t, 1.3), 2 * sway(t, 0.6), 0],
  }
  const held = toLocal([pose])[0]
  const frames = []
  for (let f = 0; f < keys; f++) {
    const locals = held.map((q, i) => {
      const layer = layers[base.bones[i].name]
      if (!layer) return q
      const [x, y, z] = layer(times[f]).map(radians)
      return q
        .clone()
        .multiply(new Quaternion(Math.sin(x / 2), 0, 0, Math.cos(x / 2)))
        .multiply(new Quaternion(0, Math.sin(y / 2), 0, Math.cos(y / 2)))
        .multiply(new Quaternion(0, 0, Math.sin(z / 2), Math.cos(z / 2)))
    })
    frames.push({ rotations: worldRotations(base.bones, locals), hips: pose.hips.clone() })
  }
  writeClip(name, { times, frames }, { source: null, id: null, authoredFrom: poseFrom, mirrored: false })
}

// ---------------------------------------------------------------------------------------------------------
// Optimise and write

await doc.transform(dedup(), resample({ tolerance: 1e-5 }), prune())
if (!draft) {
  const size = config.textureSize
  if (textureFormat === 'ktx2') {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png', resize: [size, size] }))
    await texturesToKtx2(doc, config.ktxTool, config.ktxQuality)
  } else {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: config.webpQuality }))
  }
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
}
await io.write(outPath, doc)

const facts = {
  file: outPath,
  bytes: statSync(outPath).size,
  triangles: mesh.indices.length / 3,
  vertices: vertexCount,
  box: bounds(mesh.positions),
  rootName: config.rootName,
  meshName: config.meshName,
  textureFormat: draft ? 'source' : textureFormat,
  bones: bones.map((bone) => bone.name),
  libraryBones,
  hipsAnchor: config.hipsAnchor,
  fit: config.fit,
  bind,
  clips: clipFacts,
  // Where each bone sits in the bind pose, in model space (metres)
  bonePositions: Object.fromEntries(world.map((matrix, i) => [bones[i].name, new Vector3().setFromMatrixPosition(matrix).toArray().map((n) => round(n))])),
}
writeFileSync(factsPath, JSON.stringify(facts, null, 2))
console.log(`${outPath}: ${(facts.bytes / 1e6).toFixed(2)} MB, ${facts.triangles} triangles, ${facts.vertices} vertices, ${bones.length} bones`)
for (const [name, clip] of Object.entries(clipFacts)) {
  console.log(`  ${name}: ${clip.duration} s, ${clip.keys} keys, loop gap ${((clip.loopTurn * 180) / Math.PI).toFixed(1)} deg / ${(clip.loopTravel * 1000).toFixed(1)} mm`)
}
