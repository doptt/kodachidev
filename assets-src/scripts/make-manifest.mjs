// Writes public/models/alien.json, the manifest the actor code reads, from what build-alien.mjs measured.
//
//   node assets-src/scripts/make-manifest.mjs [--config assets-src/alien.config.json] [--facts assets-src/raw/alien.facts.json]
//     [--out public/models/alien.json] [--stage final|draft] [--fallback alien-webp.glb]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : args[i + 1]
}
const config = JSON.parse(readFileSync(flag('config', 'assets-src/alien.config.json'), 'utf8'))
const facts = JSON.parse(readFileSync(flag('facts', 'assets-src/raw/alien.facts.json'), 'utf8'))
const outPath = flag('out', 'public/models/alien.json')
const fallback = flag('fallback', null)

const round = (value, digits = 4) => (Array.isArray(value) ? value.map((n) => round(n, digits)) : Number(value.toFixed(digits)))

// A clip loops if its last key is back on its first: under 3.5 degrees on every bone and 5 mm at the hips
const LOOP_TURN = 0.061
const LOOP_TRAVEL = 0.005
const described = [...config.clips, ...(config.authored ?? [])]
const clipInfo = {}
for (const clip of described) {
  const fact = facts.clips[clip.name]
  clipInfo[clip.name] = {
    duration: fact.duration,
    loops: fact.loopTurn < LOOP_TURN && fact.loopTravel < LOOP_TRAVEL,
    seated: true,
    source: fact.source
      ? `${fact.source} (library id ${fact.id})${fact.mirrored ? ', mirrored left for right' : ''}, refitted: reclined, head levelled, arms re-posed`
      : `authored: first key of "${fact.authoredFrom}" held, with a breathing cycle`,
    // For a drinking clip: which hand, and the seconds between which it is at the mouth
    ...(fact.handAtMouth ? { handAtMouth: fact.handAtMouth } : {}),
    description: clip.description,
  }
}
const named = (role) => described.filter((clip) => clip.role === role).map((clip) => clip.name)

const manifest = {
  version: 2,
  stage: flag('stage', 'final'),
  file: path.basename(facts.file),
  ...(fallback ? { fallbackFile: fallback } : {}),
  units: 'metres',
  up: '+Y',
  forward: '+Z',
  height: round(facts.box.max[1] - facts.box.min[1], 3),
  box: { min: round(facts.box.min), max: round(facts.box.max) },
  triangles: facts.triangles,
  vertices: facts.vertices,
  textureFormat: facts.textureFormat,
  textures: ['baseColor', 'normal', 'metallicRoughness'],
  extensions:
    facts.textureFormat === 'ktx2'
      ? ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu']
      : ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp'],
  rootNode: facts.rootName,
  skinnedMesh: facts.meshName,
  clips: { idle: named('idle')[0] ?? null, sip: named('sip')[0] ?? null, ambient: named('ambient') },
  clipInfo,
  hipsAnchor: facts.hipsAnchor,
  // How the clips were fitted: the torso leans this many degrees behind vertical at each clip's first key
  recline: { degrees: facts.fit.recline, limit: facts.fit.reclineLimit },
  mugHand: config.mugHand,
  bones: {
    hips: 'Hips',
    spine: 'Spine02',
    spineMid: 'Spine01',
    chest: 'Spine',
    neck: 'neck',
    head: 'Head',
    headEnd: 'head_end',
    headFront: 'headfront',
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
    leftToe: 'LeftToeBase',
    rightUpLeg: 'RightUpLeg',
    rightLeg: 'RightLeg',
    rightFoot: 'RightFoot',
    rightToe: 'RightToeBase',
  },
  antennaBones: Object.fromEntries(facts.bind.antennae.filter((antenna) => antenna.bones).map((antenna) => [antenna.side, antenna.bones])),
  bind: {
    // Where every bone's origin sits in the bind pose, model space
    bonePositions: facts.bonePositions,
    eyes: Object.fromEntries(
      Object.entries(facts.bind.eyes).map(([side, eye]) => [side, { center: round(eye.center), radii: round(eye.radii), forward: round(eye.forward, 3) }]),
    ),
    mouth: round(facts.bind.mouth),
    antennae: facts.bind.antennae.map((antenna) => ({
      side: antenna.side,
      base: round(antenna.base),
      tip: round(antenna.tip),
      ballRadius: round(antenna.ballRadius),
      stalkRadius: round(antenna.stalkRadius),
      bones: antenna.bones ?? [],
    })),
    fingersPerHand: config.fingersPerHand,
    toesPerFoot: config.toesPerFoot,
  },
  notes: [
    'One skinned mesh ("body") under the root node "alien", one material ("alien") with base colour, normal and metal-roughness textures, one skeleton. His clothes (hooded sweatshirt, shorts) are part of the mesh and move with the bones; there is no cloth simulation. Left and right are the character\'s own: his left is +X.',
    'Spine chain: Hips > Spine02 > Spine01 > Spine > neck > Head (head_end and headfront are leaf markers). The shoulders hang off Spine, the legs off Hips. Bone translations are in metres and no node is scaled.',
    'The mesh has no tangents: the normal map was baked for the tangent frame three.js derives in the shader, which is what GLTFLoader sets up by default. Do not compute tangents for it.',
    'There are no finger or toe bones: each hand is rigid, modelled open with four fingers and a thumb (fingersPerHand counts the thumb). A mug has to be parented to the hand bone and posed against the palm; the palm is about 6 cm past the wrist along the forearm.',
    'The mug hand is his left, as in the reference picture: "sip" and "cheers" are mirrored from the library so the left hand does the drinking and the toasting. In "sip" the palm is steered to stop 7.5 cm in front of and 3.5 cm below bind.mouth (as the head carries it) during clipInfo.sip.handAtMouth.hold; before that the clip reaches down and forward for a drink that he is already holding, so play it from about 3 s to 8 s, or blend past the reach.',
    'Antennae: three bones each (antennaBones), children of Head, at equal steps from bind.antennae[i].base to .tip (the centre of the ball). At rest they have no local rotation, so their axes are the head\'s; rotate them to spring the antenna. The ball rides the last bone.',
    'Eyes: center and radii are the axis-aligned centre and half-extents of the black of each eye in model space; the eye bulges out of the head along forward (a unit vector). The eyes are already near-black and glossy (roughness 0.08) in the mesh\'s own material.',
    'Every clip is seated and loops. Each was refitted for a lawn chair: at its first key the line from hips to neck leans recline.degrees behind vertical and the head looks level, and the torso never leans further back than recline.limit. The legs keep the library poses (knees bent, feet down), so the legs stretched out and crossed at the ankle in the reference picture are for the actor to pose.',
    'Every clip\'s first key puts the Hips at hipsAnchor in model space (each library clip was captured at its own seat height, so they were moved onto one), which means the feet are not planted on y = 0: seat him by the hips. The Hips still travel a little within a clip.',
    'idle is authored, not from the library (see its source). crossLegged is the library\'s calmest seated loop and can stand in as the idle, but blending it with the other clips passes the shins through each other.',
    'bind.* is measured on the bind pose (the A-pose the file opens in), not on any clip.',
  ].join(' '),
}

// Pretty-printed, but with each list of numbers or names kept on one line so the file reads like a table
const text = JSON.stringify(manifest, null, 2).replace(/\[\n\s+([^[\]{}]*?)\n\s+\]/g, (_, inner) => `[${inner.replace(/,\n\s+/g, ', ')}]`)
writeFileSync(outPath, `${text}\n`)
console.log(`${outPath}: ${manifest.stage}, ${Object.keys(clipInfo).length} clips, ${manifest.triangles} triangles`)
