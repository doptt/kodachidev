// Rebuilds a dense generated mesh as a clean low-poly one with a fresh UV atlas.
//
//   node assets-src/scripts/remesh.mjs IN.glb OUT.glb [--triangles 40000] [--error 0.01] [--shape assets-src/alien.shape.json]
//
// Image-to-3D meshes come with a UV atlas shattered into thousands of islands. Simplifying such a mesh keeps
// every island border, so the triangles pile up along the seams and the texture tears. This instead welds the
// surface by position alone (forgetting the old UVs), simplifies that, computes smooth normals and unwraps it
// again with xatlas. The result has no texture: bake.mjs transfers the colour from the dense mesh.
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { unwrap } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer'
import * as watlas from 'watlas'
import { loadShape, reshape } from './lib/shape.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : args[i + 1]
}
const [input, output] = args
const target = Number(flag('triangles', 40000))
const error = Number(flag('error', 0.01))

await MeshoptDecoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const source = await io.read(input)
const sourceNode = source.getRoot().listNodes().find((node) => node.getMesh())
const primitive = sourceNode.getMesh().listPrimitives()[0]
const srcIndices = primitive.getIndices().getArray()

// The generator stores the mesh lying down under a node that stands it up: bake that node's transform in
const m = sourceNode.getWorldMatrix()
const srcPositions = Float32Array.from(primitive.getAttribute('POSITION').getArray())
for (let i = 0; i < srcPositions.length; i += 3) {
  const [x, y, z] = [srcPositions[i], srcPositions[i + 1], srcPositions[i + 2]]
  srcPositions[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
  srcPositions[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
  srcPositions[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
}
// The shape corrections bake.mjs will make to the dense mesh too (see lib/shape.mjs)
reshape(srcPositions, loadShape(flag('shape', null)))

// Weld by position: vertices the old atlas split along its seams become one again
const remap = new Uint32Array(srcPositions.length / 3)
const welded = []
const seen = new Map()
for (let i = 0; i < remap.length; i++) {
  const x = srcPositions[i * 3]
  const y = srcPositions[i * 3 + 1]
  const z = srcPositions[i * 3 + 2]
  const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
  let index = seen.get(key)
  if (index === undefined) {
    index = welded.length / 3
    seen.set(key, index)
    welded.push(x, y, z)
  }
  remap[i] = index
}
const weldedIndices = []
for (let i = 0; i < srcIndices.length; i += 3) {
  const a = remap[srcIndices[i]]
  const b = remap[srcIndices[i + 1]]
  const c = remap[srcIndices[i + 2]]
  if (a !== b && b !== c && a !== c) weldedIndices.push(a, b, c)
}
const weldedPositions = new Float32Array(welded)
console.log(`welded ${remap.length} -> ${weldedPositions.length / 3} vertices, ${weldedIndices.length / 3} triangles`)

const [simplified, reached] = MeshoptSimplifier.simplify(new Uint32Array(weldedIndices), weldedPositions, 3, target * 3, error)
console.log(`simplified to ${simplified.length / 3} triangles, error ${reached.toFixed(5)}`)

// Keep only the vertices still in use
const compact = new Map()
const positions = []
const indices = new Uint32Array(simplified.length)
for (let i = 0; i < simplified.length; i++) {
  let index = compact.get(simplified[i])
  if (index === undefined) {
    index = positions.length / 3
    compact.set(simplified[i], index)
    positions.push(weldedPositions[simplified[i] * 3], weldedPositions[simplified[i] * 3 + 1], weldedPositions[simplified[i] * 3 + 2])
  }
  indices[i] = index
}

// Smooth normals, each face weighted by its area (the cross product's length)
const normals = new Float32Array(positions.length)
for (let i = 0; i < indices.length; i += 3) {
  const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3]
  const ux = positions[b] - positions[a]
  const uy = positions[b + 1] - positions[a + 1]
  const uz = positions[b + 2] - positions[a + 2]
  const vx = positions[c] - positions[a]
  const vy = positions[c + 1] - positions[a + 1]
  const vz = positions[c + 2] - positions[a + 2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  for (const v of [a, b, c]) {
    normals[v] += nx
    normals[v + 1] += ny
    normals[v + 2] += nz
  }
}
for (let i = 0; i < normals.length; i += 3) {
  const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
  normals[i] /= length
  normals[i + 1] /= length
  normals[i + 2] /= length
}

const doc = new Document()
const buffer = doc.createBuffer()
const out = doc
  .createPrimitive()
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
  .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
  .setMaterial(doc.createMaterial('skin').setRoughnessFactor(0.6).setMetallicFactor(0))
const mesh = doc.createMesh('alien').addPrimitive(out)
doc.createScene('scene').addChild(doc.createNode('alien').setMesh(mesh))

await watlas.Initialize()
await doc.transform(unwrap({ watlas, overwrite: true }))
await io.write(output, doc)
console.log(`${out.getAttribute('POSITION').getCount()} vertices after unwrapping, ${out.getIndices().getCount() / 3} triangles: ${output}`)
