// Makes a generated prop web-ready: stands it on the ground at the origin, turns it to face +Z, scales it to a
// real size in metres, drops its normal map, shrinks its textures and compresses everything.
//
//   node assets-src/scripts/optimise-prop.mjs IN.glb OUT.glb --length 2.9 [--yaw -90] [--texture 1024]
//     [--format ktx2|webp] [--ktx assets-src/tools/ktx/unpacked/bin/ktx.exe] [--name rover]
//
// --length  the prop's longest horizontal size, in metres, after scaling
// --yaw     degrees about +Y to turn the generated model so that its front faces +Z
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, getBounds, join, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { statSync } from 'node:fs'
import { texturesToKtx2 } from './lib/ktx.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : args[i + 1]
}
const [input, output] = args
const length = Number(flag('length', 1))
const yaw = (Number(flag('yaw', 0)) * Math.PI) / 180
const textureSize = Number(flag('texture', 1024))
const format = flag('format', 'ktx2')
const name = flag('name', 'prop')

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(input)
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]

// One root node that turns, scales and places whatever the generator made
const root = doc.createNode(name)
for (const child of scene.listChildren()) root.addChild(child)
scene.addChild(root)
root.setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)])
const turned = getBounds(scene)
const scale = length / Math.max(turned.max[0] - turned.min[0], turned.max[2] - turned.min[2])
root.setScale([scale, scale, scale])
root.setTranslation([(-(turned.min[0] + turned.max[0]) / 2) * scale, -turned.min[1] * scale, (-(turned.min[2] + turned.max[2]) / 2) * scale])

// At the size a prop is seen, a normal map costs more than it shows
for (const material of doc.getRoot().listMaterials()) material.setNormalTexture(null)

await doc.transform(dedup(), flatten(), join(), weld(), prune())
if (format === 'ktx2') {
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png', resize: [textureSize, textureSize] }))
  await texturesToKtx2(doc, flag('ktx', 'assets-src/tools/ktx/unpacked/bin/ktx.exe'))
} else {
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureSize, textureSize], quality: 88 }))
}
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
await io.write(output, doc)

const box = getBounds(scene)
const size = box.max.map((n, k) => Number((n - box.min[k]).toFixed(3)))
const triangles = doc
  .getRoot()
  .listMeshes()
  .flatMap((mesh) => mesh.listPrimitives())
  .reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0)
console.log(`${output}: ${(statSync(output).size / 1e6).toFixed(2)} MB, ${triangles} triangles, ${size.join(' x ')} m (x, y, z)`)
