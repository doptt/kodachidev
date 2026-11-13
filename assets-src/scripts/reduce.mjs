// Reduces a dense generated mesh: welds it, simplifies it to a triangle budget with meshoptimizer and
// resizes its textures. Used to make a raw image-to-3D mesh small enough to remesh or rig.
//
//   node assets-src/scripts/reduce.mjs IN.glb OUT.glb [--triangles 40000] [--texture 2048] [--error 0.01]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { statSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : args[i + 1]
}
const [input, output] = args
const target = Number(flag('triangles', 40000))
const textureSize = Number(flag('texture', 2048))
const error = Number(flag('error', 0.01))

await MeshoptDecoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(input)

const triangles = () =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0)

const before = triangles()
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: target / before, error }),
  textureCompress({ encoder: sharp, resize: [textureSize, textureSize] }),
  prune(),
)
await io.write(output, doc)
console.log(`${before} -> ${triangles()} triangles, ${(statSync(output).size / 1e6).toFixed(2)} MB: ${output}`)
