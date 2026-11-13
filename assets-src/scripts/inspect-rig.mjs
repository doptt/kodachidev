// Prints the skeleton of a rigged GLB: the node tree with rest transforms, the skin's joints and each
// animation's channels. Used to check that separately exported clips share one skeleton before merging them.
//
//   node assets-src/scripts/inspect-rig.mjs IN.glb [--channels]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const args = process.argv.slice(2)
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(args[0])
const root = doc.getRoot()
const fixed = (values, digits = 4) => [...values].map((n) => Number(n.toFixed(digits))).join(' ')

const walk = (node, depth) => {
  const parts = [`t ${fixed(node.getTranslation())}`, `r ${fixed(node.getRotation())}`, `s ${fixed(node.getScale(), 3)}`]
  const tags = [node.getMesh() ? `mesh:${node.getMesh().getName()}` : null, node.getSkin() ? 'skinned' : null].filter(Boolean)
  console.log(`${'  '.repeat(depth)}${node.getName()}  ${parts.join(' | ')} ${tags.join(' ')}`)
  for (const child of node.listChildren()) walk(child, depth + 1)
}
for (const scene of root.listScenes()) for (const node of scene.listChildren()) walk(node, 0)

for (const skin of root.listSkins()) {
  console.log(`skin ${skin.getName()}: ${skin.listJoints().length} joints, skeleton root ${skin.getSkeleton()?.getName() ?? 'none'}`)
  console.log(`  ${skin.listJoints().map((joint) => joint.getName()).join(', ')}`)
}
for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const semantics = primitive.listSemantics().map((s) => `${s}:${primitive.getAttribute(s).getComponentSize() * 8}bit`)
    console.log(`mesh ${mesh.getName()}: ${primitive.getAttribute('POSITION').getCount()} vertices, ${(primitive.getIndices()?.getCount() ?? 0) / 3} triangles, ${semantics.join(' ')}`)
  }
}
for (const animation of root.listAnimations()) {
  const channels = animation.listChannels()
  const times = channels.map((channel) => channel.getSampler().getInput())
  const duration = Math.max(...times.map((input) => input.getMax([])[0]))
  const start = Math.min(...times.map((input) => input.getMin([])[0]))
  const keys = new Set(times.map((input) => input.getCount()))
  console.log(`animation "${animation.getName()}": ${channels.length} channels, ${start.toFixed(3)}..${duration.toFixed(3)} s, key counts ${[...keys].join('/')}`)
  if (args.includes('--channels')) {
    for (const channel of channels) {
      const sampler = channel.getSampler()
      console.log(`  ${channel.getTargetNode().getName()}.${channel.getTargetPath()} ${sampler.getInterpolation()} ${sampler.getInput().getCount()} keys`)
    }
  }
}
