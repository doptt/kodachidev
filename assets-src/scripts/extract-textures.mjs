// Writes every texture inside a GLB out as an image file, to look at or edit.
//
//   node assets-src/scripts/extract-textures.mjs IN.glb OUT_DIR
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [input, outDir] = process.argv.slice(2)
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(input)
mkdirSync(outDir, { recursive: true })

const slots = new Map()
for (const material of doc.getRoot().listMaterials()) {
  const named = {
    baseColor: material.getBaseColorTexture(),
    normal: material.getNormalTexture(),
    metallicRoughness: material.getMetallicRoughnessTexture(),
    occlusion: material.getOcclusionTexture(),
    emissive: material.getEmissiveTexture(),
  }
  for (const [slot, texture] of Object.entries(named)) if (texture) slots.set(texture, slot)
  console.log(
    `material ${material.getName()}: baseColorFactor ${material.getBaseColorFactor()}, metallic ${material.getMetallicFactor()}, roughness ${material.getRoughnessFactor()}, doubleSided ${material.getDoubleSided()}`,
  )
}
doc.getRoot().listTextures().forEach((texture, i) => {
  const ext = texture.getMimeType().split('/')[1].replace('jpeg', 'jpg')
  const file = path.join(outDir, `${slots.get(texture) ?? `texture${i}`}.${ext}`)
  writeFileSync(file, texture.getImage())
  console.log(file, texture.getSize()?.join('x'))
})
