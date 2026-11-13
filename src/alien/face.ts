import * as THREE from 'three'
import type { Eye } from './measure'
import type { Rig } from './rig'

/**
 * His eyes. The model has them painted on: black in the texture, on a lumpy
 * surface, with no lids. So each gets two shells of its own, fitted to the
 * painted patch and carried by the head bone:
 *
 *  - an eye: a smooth dome of near-black under a clear coat, sitting just
 *    proud of the painted surface, so the sun leaves one sharp highlight and
 *    the ground and the Earth are mirrored in it. Deep inside is a faint
 *    paler iris that moves to where he is looking;
 *  - a lid: the same dome a hair larger, in the colour of the skin round the
 *    eye, of which only the part that has closed is drawn. An upper lid
 *    comes down and a lower one comes up a little to meet it.
 *
 * Both are built in the bind pose in model space and then moved into the
 * head bone's space, so they follow the head exactly.
 */
const RINGS = 9
const SPOKES = 28
/** How far past the painted outline the shells reach, to tuck under the rim of the socket. */
const OVERHANG = 1.14
/** How far proud of the painted surface the eye sits, and the lid over it. */
const EYE_LIFT = 0.0022
const LID_LIFT = 0.0012
/** Where the lids meet when shut, from -1 (bottom of the eye) to 1 (top). */
const MEET = -0.3
/** The upper lid at rest: a little lowered, which is most of his expression. */
const LID_REST = 0.16

export type Face = {
  /** How closed the eyes are, 0 (the resting lid) to 1 (shut). */
  setLids(closed: number): void
  /** Where the irises sit, as a turn from straight ahead in radians: + toward his left, + up. */
  setGaze(yaw: number, pitch: number): void
  /** The eyes' material, for the actor's list of things that reflect its environment. */
  eyeMaterial: THREE.MeshPhysicalMaterial
  dispose(): void
}

/** One dome over one eye: positions in model space, with where each point is across the eye in its uv (each -OVERHANG..OVERHANG, 1 at the painted outline). */
function dome(eye: Eye, lift: number, grow: number) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const halfLength = eye.halfLength * grow
  const halfHeight = eye.halfHeight * grow
  // The dome is the cap of an ellipsoid that meets the painted rim at the outline
  const bulge = eye.dome + lift
  const depth = Math.max(bulge * 2.4, halfHeight * 0.85)
  const q = (depth - bulge) / depth
  const p = new THREE.Vector3()
  const push = (a: number, b: number) => {
    const r2 = a * a + b * b
    const height = (Math.sqrt(Math.max(1 - r2 * (1 - q * q), 0)) - q) / (1 - q)
    p.copy(eye.centre)
      .addScaledVector(eye.long, a * halfLength)
      .addScaledVector(eye.up, b * halfHeight)
      .addScaledVector(eye.normal, eye.rim + bulge * height)
    positions.push(p.x, p.y, p.z)
    // u runs toward his left on both eyes, so one gaze serves the pair
    uvs.push(a * Math.sign(eye.long.x), b)
  }
  push(0, 0)
  for (let ring = 1; ring <= RINGS; ring++) {
    const r = (ring / RINGS) * OVERHANG
    for (let spoke = 0; spoke < SPOKES; spoke++) {
      const angle = (spoke / SPOKES) * Math.PI * 2
      push(r * Math.cos(angle), r * Math.sin(angle))
    }
  }
  // Which way round the triangles go depends on the handedness of (long, up, normal)
  const flip = new THREE.Vector3().crossVectors(eye.long, eye.up).dot(eye.normal) < 0
  const tri = (a: number, b: number, c: number) => (flip ? indices.push(a, c, b) : indices.push(a, b, c))
  for (let spoke = 0; spoke < SPOKES; spoke++) tri(0, 1 + spoke, 1 + ((spoke + 1) % SPOKES))
  for (let ring = 1; ring < RINGS; ring++) {
    const inner = 1 + (ring - 1) * SPOKES
    const outer = inner + SPOKES
    for (let spoke = 0; spoke < SPOKES; spoke++) {
      const next = (spoke + 1) % SPOKES
      tri(inner + spoke, outer + spoke, outer + next)
      tri(inner + spoke, outer + next, inner + next)
    }
  }
  return { positions, uvs, indices }
}

function merged(eyes: Eye[], lift: number, grow: number, toHead: THREE.Matrix4) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const eye of eyes) {
    const part = dome(eye, lift, grow)
    const offset = positions.length / 3
    positions.push(...part.positions)
    uvs.push(...part.uvs)
    for (const i of part.indices) indices.push(i + offset)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.applyMatrix4(toHead)
  geometry.computeVertexNormals()
  return geometry
}

/** `skinColour` is the colour of his skin as measured off the texture (linear), which the lids are made in. */
export function buildFace(rig: Rig, eyes: Eye[], env: THREE.Texture, skin: THREE.MeshPhysicalMaterial, skinColour: THREE.Color): Face | null {
  if (eyes.length === 0) return null
  const head = rig.bones.head
  // Model space to the head bone's own space, in the bind pose
  const toHead = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(rig.object.matrixWorld)

  const gaze = { value: new THREE.Vector2() }
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x020304,
    roughness: 0.035,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 2,
    envMap: env,
  })
  eyeMaterial.name = 'alien-eye'
  eyeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.gaze = gaze
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vAcross;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAcross = uv;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vAcross;\nuniform vec2 gaze;').replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      // The iris: a paler ring deep in the eye, round a pupil, where he is looking
      float fromGaze = length( ( vAcross - gaze ) * vec2( 1.0, 0.82 ) );
      float iris = smoothstep( 0.62, 0.3, fromGaze ) * smoothstep( 0.08, 0.26, fromGaze );
      diffuseColor.rgb += vec3( 0.003, 0.008, 0.008 ) * iris;`,
    )
  }

  const lids = { value: LID_REST }
  const lidColour = skinColour.clone().multiply(skin.color)
  const lidMaterial = new THREE.MeshPhysicalMaterial({
    color: lidColour,
    roughness: skin.roughness,
    sheen: skin.sheen,
    sheenRoughness: skin.sheenRoughness,
    sheenColor: skin.sheenColor,
    clearcoat: skin.clearcoat,
    clearcoatRoughness: skin.clearcoatRoughness,
  })
  lidMaterial.name = 'alien-lid'
  lidMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.closed = lids
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vAcross;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAcross = uv;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vAcross;\nuniform float closed;').replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      // The lids' edges: the upper comes down from the top, the lower rises a third as far, both a little bowed
      float bow = 0.1 * vAcross.x * vAcross.x;
      float upper = mix( 1.3, ${MEET.toFixed(2)}, closed ) - bow;
      float lower = mix( -1.3, ${MEET.toFixed(2)}, closed ) + bow;
      // How far inside a lid this point is; nothing is drawn in the open gap between them
      float inLid = max( vAcross.y - upper, lower - vAcross.y );
      if ( inLid < 0.0 ) discard;
      // A darker line where a lid ends, as its thickness would give
      diffuseColor.rgb *= mix( 0.45, 1.0, smoothstep( 0.0, 0.1, inLid ) );`,
    )
  }

  const eyeGeometry = merged(eyes, EYE_LIFT, 1.03, toHead)
  const lidGeometry = merged(eyes, EYE_LIFT + LID_LIFT, 1.05, toHead)
  const eyeMesh = new THREE.Mesh(eyeGeometry, eyeMaterial)
  eyeMesh.name = 'alien-eyes'
  eyeMesh.receiveShadow = true
  const lidMesh = new THREE.Mesh(lidGeometry, lidMaterial)
  lidMesh.name = 'alien-lids'
  lidMesh.receiveShadow = true
  head.add(eyeMesh, lidMesh)

  return {
    setLids: (closed) => {
      lids.value = LID_REST + (1 - LID_REST) * THREE.MathUtils.clamp(closed, 0, 1)
    },
    setGaze: (yaw, pitch) => {
      // A turn of the eye slides the iris across it; the eye is wider than it is tall
      gaze.value.set(THREE.MathUtils.clamp(yaw * 0.9, -0.55, 0.55), THREE.MathUtils.clamp(pitch * 1.1, -0.45, 0.45))
    },
    eyeMaterial,
    dispose() {
      eyeGeometry.dispose()
      lidGeometry.dispose()
      eyeMaterial.dispose()
      lidMaterial.dispose()
    },
  }
}
