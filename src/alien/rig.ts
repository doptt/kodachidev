import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { createKTX2Loader } from '../stage/ktx2'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * Loading the alien: the manifest the asset pipeline writes beside the model
 * (public/models/alien.json), then the model itself, and finding in it the
 * things the actor works with: the one skinned mesh and the bones by role.
 */

/** The manifest, as far as the actor reads it. Anything may be missing or null: the actor measures what it is not told. */
export type Manifest = {
  stage?: string
  file?: string
  height?: number | null
  textureFormat?: string | null
  skinnedMesh?: string | null
  clips?: { idle?: string | null; sip?: string | null; ambient?: string[] | null } | null
  clipInfo?: Record<string, { duration?: number; loops?: boolean; seated?: boolean; source?: string } | undefined> | null
  bones?: Partial<Record<string, string | null>> | null
  bind?: {
    eyes?: { left?: EyeHint | null; right?: EyeHint | null } | null
    antennae?: { base?: number[] | null; tip?: number[] | null; ballRadius?: number | null; bones?: string[] | null }[] | null
    fingersPerHand?: number | null
    mouth?: number[] | null
  } | null
}
export type EyeHint = { center?: number[] | null; radii?: number[] | null }

/** The bones the actor moves, by role. Left and right are his own. */
const BONE_ROLES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftForeArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightForeArm',
  'rightHand',
  'leftUpLeg',
  'leftLeg',
  'leftFoot',
  'rightUpLeg',
  'rightLeg',
  'rightFoot',
] as const
export type BoneRole = (typeof BONE_ROLES)[number]

/** The names the rigging service gives these bones, used when the manifest does not say. */
const USUAL_NAMES: Record<BoneRole, string> = {
  hips: 'Hips',
  spine: 'Spine02',
  chest: 'Spine',
  neck: 'neck',
  head: 'Head',
  leftShoulder: 'LeftShoulder',
  leftUpperArm: 'LeftArm',
  leftForeArm: 'LeftForeArm',
  leftHand: 'LeftHand',
  rightShoulder: 'RightShoulder',
  rightUpperArm: 'RightArm',
  rightForeArm: 'RightForeArm',
  rightHand: 'RightHand',
  leftUpLeg: 'LeftUpLeg',
  leftLeg: 'LeftLeg',
  leftFoot: 'LeftFoot',
  rightUpLeg: 'RightUpLeg',
  rightLeg: 'RightLeg',
  rightFoot: 'RightFoot',
}

export type Rig = {
  /** The model's root. Model space is this object's space: metres, +Y up, he faces +Z. */
  object: THREE.Object3D
  mesh: THREE.SkinnedMesh
  bones: Record<BoneRole, THREE.Bone>
  /** Every bone of the skeleton with its transform in the bind pose, so the pose can be put back before each frame. */
  rest: { bone: THREE.Bone; position: THREE.Vector3; quaternion: THREE.Quaternion }[]
  /** The model's own clips, by name. */
  clips: Map<string, THREE.AnimationClip>
  manifest: Manifest
  /** Takes a point of the mesh's stored geometry to model space, in the bind pose (the geometry is quantised, so the two differ). */
  geometryToModel: THREE.Matrix4
}

/**
 * Loads the manifest and the model from `base` (the folder, with a trailing
 * slash). Resolves to null when there is no manifest or the model cannot be
 * read: the actor then puts out the set without him.
 */
export async function loadRig(renderer: THREE.WebGLRenderer, base: string, onProgress?: (done: number, total: number) => void): Promise<Rig | null> {
  let manifest: Manifest
  try {
    const response = await fetch(`${base}alien.json`, { cache: 'no-cache' })
    if (!response.ok) return null
    manifest = (await response.json()) as Manifest
  } catch {
    return null
  }

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  let ktx2: KTX2Loader | null = null
  if (manifest.textureFormat === 'ktx2') {
    ktx2 = createKTX2Loader(renderer)
    loader.setKTX2Loader(ktx2)
  }
  try {
    const gltf = await loader.loadAsync(`${base}${manifest.file ?? 'alien.glb'}`, (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total)
    })
    const object = gltf.scene
    object.updateMatrixWorld(true)

    let mesh: THREE.SkinnedMesh | null = null
    object.traverse((child) => {
      const candidate = child as THREE.SkinnedMesh
      if (candidate.isSkinnedMesh && (!mesh || candidate.name === manifest.skinnedMesh)) mesh = candidate
    })
    if (!mesh) return null
    const skinned = mesh as THREE.SkinnedMesh

    const byName = new Map(skinned.skeleton.bones.map((bone) => [bone.name, bone]))
    const bones = {} as Record<BoneRole, THREE.Bone>
    for (const role of BONE_ROLES) {
      const bone = byName.get(manifest.bones?.[role] ?? '') ?? byName.get(USUAL_NAMES[role])
      if (!bone) return null
      bones[role] = bone
    }

    const rest = skinned.skeleton.bones.map((bone) => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone() }))
    // In the bind pose every bone carries the geometry to the same place; take the first
    const geometryToModel = new THREE.Matrix4().multiplyMatrices(skinned.skeleton.bones[0].matrixWorld, skinned.skeleton.boneInverses[0]).multiply(skinned.bindMatrix)
    geometryToModel.premultiply(new THREE.Matrix4().copy(object.matrixWorld).invert())

    return { object, mesh: skinned, bones, rest, clips: new Map(gltf.animations.map((clip) => [clip.name, clip])), manifest, geometryToModel }
  } catch {
    return null
  } finally {
    ktx2?.dispose()
  }
}
