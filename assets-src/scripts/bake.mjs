// Bakes the textures of the clean low-poly mesh made by remesh.mjs: base colour, normal and roughness.
//
//   node assets-src/scripts/bake.mjs HIGH.glb LOW.glb OUT.glb --views assets-src/reference [--shape assets-src/alien.shape.json]
//     [--size 2048] [--facts assets-src/raw/bake.facts.json] [--antenna-thin 0.72] [--skin-tint 0.94,1.01,1]
//
// For every texel of the low mesh's atlas it finds the point on the low surface and the nearest point on the
// dense generated mesh, and takes from there:
//   - colour, from the dense mesh's texture. That texture has the right colours in the right places but no
//     fine detail (the generator smooths it away), so the grain is put back from the four reference views the
//     mesh was generated from: each view is projected onto the surface it faces, and what it adds is its
//     detail (the view minus a blurred copy of itself) and a part of its broad colour. Detail from a view is
//     dropped wherever the view shows a different material than the mesh has there, so a slightly misplaced
//     edge never prints a ghost;
//   - the normal, from the dense mesh's own surface (its folds, seams and creases), stored in the low mesh's
//     tangent space, with a fine bump from the grain of the reference views on top;
//   - roughness, from the dense mesh's texture.
// Then it repairs what the generator got wrong: the eyes become an even glossy black, and pink is taken out
// of the antennae, the eyelid rims and the finger and toe tips (the reference has none).
//
// It also finds the antennae (thin parts standing on the scalp), thins them, marks their vertices, measures
// them and the eyes, and writes the measurements, in the mesh's own space, to the facts file
// (build-alien.mjs moves them into the final model space).
//
// The tangent space is the one three.js derives in the shader when a mesh has no tangents (GLTFLoader's
// default), so the baked normal map renders there exactly as baked.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadShape, reshape, smoothNormals } from './lib/shape.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = args[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}
const [highPath, lowPath, outPath] = args
const SIZE = Number(flag('size', 2048))
const factsPath = String(flag('facts', 'assets-src/raw/bake.facts.json'))
const viewsDir = String(flag('views', 'assets-src/reference'))
// How much of their thickness the antennae keep: the generator makes them stouter than the reference
const antennaThin = Number(flag('antenna-thin', 0.72))
// Red, green and blue gains for bare skin, to bring the generator's skin to the reference's
const skinTint = String(flag('skin-tint', '1,1,1')).split(',').map(Number)

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const median = (values) => {
  const sorted = Float64Array.from(values).sort()
  return sorted[Math.floor(sorted.length / 2)]
}
const percentile = (values, p) => {
  const sorted = Float64Array.from(values).sort()
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))]
}
const luminance = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b

/** An image as raw RGB bytes. */
async function loadImage(source, blur = 0) {
  let pipeline = sharp(source).removeAlpha()
  if (blur > 0) pipeline = pipeline.blur(blur)
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Bilinear sample at pixel coordinates (x, y), where a pixel's centre is at its index plus a half. */
function samplePixel(image, x, y, out) {
  const px = Math.min(Math.max(x - 0.5, 0), image.width - 1)
  const py = Math.min(Math.max(y - 0.5, 0), image.height - 1)
  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  const x1 = Math.min(x0 + 1, image.width - 1)
  const y1 = Math.min(y0 + 1, image.height - 1)
  const fx = px - x0
  const fy = py - y0
  const { data, width } = image
  for (let c = 0; c < 3; c++) {
    const top = data[(y0 * width + x0) * 3 + c] * (1 - fx) + data[(y0 * width + x1) * 3 + c] * fx
    const bottom = data[(y1 * width + x0) * 3 + c] * (1 - fx) + data[(y1 * width + x1) * 3 + c] * fx
    out[c] = top * (1 - fy) + bottom * fy
  }
}

// ---------------------------------------------------------------------------------------------------------
// The dense mesh and its textures

const highDoc = await io.read(highPath)
const highNode = highDoc.getRoot().listNodes().find((node) => node.getMesh())
const highPrimitive = highNode.getMesh().listPrimitives()[0]
const hp = Float32Array.from(highPrimitive.getAttribute('POSITION').getArray())
const huv = highPrimitive.getAttribute('TEXCOORD_0').getArray()
const hi = highPrimitive.getIndices().getArray()
{
  // Stand the mesh up: the generator leaves that to a node transform
  const m = highNode.getWorldMatrix()
  for (let i = 0; i < hp.length; i += 3) {
    const [x, y, z] = [hp[i], hp[i + 1], hp[i + 2]]
    hp[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
    hp[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
    hp[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
  }
}
// The mesh as generated, which is what the reference views show; then the same shape corrections remesh.mjs
// made before it built the low mesh, and normals to go with the corrected surface
const generated = hp.slice()
reshape(hp, loadShape(flag('shape', null)))
const hn = smoothNormals(hp, hi)
const highMaterial = highPrimitive.getMaterial()
const highColour = await loadImage(highMaterial.getBaseColorTexture().getImage())
const highRough = await loadImage(highMaterial.getMetallicRoughnessTexture().getImage())

const boxOf = (positions) => {
  const result = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  for (let i = 0; i < positions.length; i++) {
    result.min[i % 3] = Math.min(result.min[i % 3], positions[i])
    result.max[i % 3] = Math.max(result.max[i % 3], positions[i])
  }
  return result
}
const highBox = boxOf(hp)
// The box the reference views are laid over: the mesh as generated
const viewBox = boxOf(generated)

// A uniform grid over the dense triangles, as two flat arrays: where each cell's list starts, and the lists
const CELL = 0.004
const dims = [0, 1, 2].map((k) => Math.floor((highBox.max[k] - highBox.min[k]) / CELL) + 1)
const cellOf = (x, y, z) => (z * dims[1] + y) * dims[0] + x
const cellCoord = (value, k) => Math.min(dims[k] - 1, Math.max(0, Math.floor((value - highBox.min[k]) / CELL)))
const cellStart = new Uint32Array(dims[0] * dims[1] * dims[2] + 1)
const triangleCount = hi.length / 3
const forTriangleCells = (t, visit) => {
  const lo = [Infinity, Infinity, Infinity]
  const up = [-Infinity, -Infinity, -Infinity]
  for (let c = 0; c < 3; c++) {
    for (let k = 0; k < 3; k++) {
      const value = hp[hi[t * 3 + c] * 3 + k]
      lo[k] = Math.min(lo[k], value)
      up[k] = Math.max(up[k], value)
    }
  }
  for (let z = cellCoord(lo[2], 2); z <= cellCoord(up[2], 2); z++) {
    for (let y = cellCoord(lo[1], 1); y <= cellCoord(up[1], 1); y++) {
      for (let x = cellCoord(lo[0], 0); x <= cellCoord(up[0], 0); x++) visit(cellOf(x, y, z))
    }
  }
}
for (let t = 0; t < triangleCount; t++) forTriangleCells(t, (cell) => cellStart[cell + 1]++)
for (let i = 0; i < cellStart.length - 1; i++) cellStart[i + 1] += cellStart[i]
const cellItems = new Uint32Array(cellStart[cellStart.length - 1])
const cellFill = cellStart.slice(0, -1)
for (let t = 0; t < triangleCount; t++) forTriangleCells(t, (cell) => (cellItems[cellFill[cell]++] = t))

/** Closest point on dense triangle t to (px,py,pz): squared distance, and the barycentric weights in `bary`. */
const bary = new Float64Array(3)
function closestOnTriangle(t, px, py, pz) {
  const a = hi[t * 3] * 3
  const b = hi[t * 3 + 1] * 3
  const c = hi[t * 3 + 2] * 3
  const abx = hp[b] - hp[a]
  const aby = hp[b + 1] - hp[a + 1]
  const abz = hp[b + 2] - hp[a + 2]
  const acx = hp[c] - hp[a]
  const acy = hp[c + 1] - hp[a + 1]
  const acz = hp[c + 2] - hp[a + 2]
  const apx = px - hp[a]
  const apy = py - hp[a + 1]
  const apz = pz - hp[a + 2]
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  let v
  let w
  if (d1 <= 0 && d2 <= 0) {
    v = 0
    w = 0
  } else {
    const bpx = px - hp[b]
    const bpy = py - hp[b + 1]
    const bpz = pz - hp[b + 2]
    const d3 = abx * bpx + aby * bpy + abz * bpz
    const d4 = acx * bpx + acy * bpy + acz * bpz
    if (d3 >= 0 && d4 <= d3) {
      v = 1
      w = 0
    } else {
      const vc = d1 * d4 - d3 * d2
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        v = d1 / (d1 - d3)
        w = 0
      } else {
        const cpx = px - hp[c]
        const cpy = py - hp[c + 1]
        const cpz = pz - hp[c + 2]
        const d5 = abx * cpx + aby * cpy + abz * cpz
        const d6 = acx * cpx + acy * cpy + acz * cpz
        if (d6 >= 0 && d5 <= d6) {
          v = 0
          w = 1
        } else {
          const vb = d5 * d2 - d1 * d6
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            v = 0
            w = d2 / (d2 - d6)
          } else {
            const va = d3 * d6 - d5 * d4
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              w = (d4 - d3) / (d4 - d3 + (d5 - d6))
              v = 1 - w
            } else {
              const denominator = 1 / (va + vb + vc)
              v = vb * denominator
              w = vc * denominator
            }
          }
        }
      }
    }
  }
  bary[0] = 1 - v - w
  bary[1] = v
  bary[2] = w
  const dx = apx - abx * v - acx * w
  const dy = apy - aby * v - acy * w
  const dz = apz - abz * v - acz * w
  return dx * dx + dy * dy + dz * dz
}

/**
 * The dense surface nearest to a point, searching outwards in shells of grid cells. Leaves the dense colour in
 * `hitColour`, roughness (0..1) in `hit.roughness` and the surface normal in `hitNormal`; returns the distance.
 */
const hitColour = new Float64Array(3)
const hitNormal = new Float64Array(3)
// Where that point was on the mesh as generated, which is where the reference views show it
const hitGenerated = new Float64Array(3)
const hit = { roughness: 0 }
const scratch = new Float64Array(3)
function nearest(px, py, pz) {
  const cx = cellCoord(px, 0)
  const cy = cellCoord(py, 1)
  const cz = cellCoord(pz, 2)
  let best = Infinity
  let bestTriangle = -1
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let reach = 0; reach <= 12; reach++) {
    // Anything in a farther shell is at least (reach - 1) cells away: stop once the best beats that
    if (bestTriangle >= 0 && best <= ((reach - 1) * CELL) ** 2) break
    for (let z = Math.max(0, cz - reach); z <= Math.min(dims[2] - 1, cz + reach); z++) {
      for (let y = Math.max(0, cy - reach); y <= Math.min(dims[1] - 1, cy + reach); y++) {
        for (let x = Math.max(0, cx - reach); x <= Math.min(dims[0] - 1, cx + reach); x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== reach) continue
          const cell = cellOf(x, y, z)
          for (let k = cellStart[cell]; k < cellStart[cell + 1]; k++) {
            const d = closestOnTriangle(cellItems[k], px, py, pz)
            if (d < best) {
              best = d
              bestTriangle = cellItems[k]
              b0 = bary[0]
              b1 = bary[1]
              b2 = bary[2]
            }
          }
        }
      }
    }
  }
  const [a, b, c] = [hi[bestTriangle * 3], hi[bestTriangle * 3 + 1], hi[bestTriangle * 3 + 2]]
  const u = huv[a * 2] * b0 + huv[b * 2] * b1 + huv[c * 2] * b2
  const v = huv[a * 2 + 1] * b0 + huv[b * 2 + 1] * b1 + huv[c * 2 + 1] * b2
  samplePixel(highColour, u * highColour.width, v * highColour.height, hitColour)
  samplePixel(highRough, u * highRough.width, v * highRough.height, scratch)
  hit.roughness = scratch[1] / 255
  let length = 0
  for (let k = 0; k < 3; k++) {
    hitNormal[k] = hn[a * 3 + k] * b0 + hn[b * 3 + k] * b1 + hn[c * 3 + k] * b2
    hitGenerated[k] = generated[a * 3 + k] * b0 + generated[b * 3 + k] * b1 + generated[c * 3 + k] * b2
    length += hitNormal[k] ** 2
  }
  length = Math.sqrt(length) || 1
  for (let k = 0; k < 3; k++) hitNormal[k] /= length
  return Math.sqrt(best)
}

// ---------------------------------------------------------------------------------------------------------
// The reference views, each with two blurred copies: one to split off the detail, one to split off the grain

// Detail is what is finer than about 2 cm on the body (mottling, weave, seams); grain what is finer than 2 mm
const DETAIL_BLUR = 18
const GRAIN_BLUR = 2
const views = []
for (const [name, toCamera, across, sign] of [
  // name, the direction from the model to that view's camera, the model axis running across the picture,
  // and which way: +1 if the axis grows to the picture's right
  ['front', [0, 0, 1], 0, 1],
  ['back', [0, 0, -1], 0, -1],
  ['left', [1, 0, 0], 2, -1],
  ['right', [-1, 0, 0], 2, 1],
]) {
  const file = path.join(viewsDir, `${name}.png`)
  const image = await loadImage(file)
  const broad = await loadImage(file, DETAIL_BLUR)
  const fine = await loadImage(file, GRAIN_BLUR)
  // The figure's box in the picture: the rows and columns where enough pixels differ from the backdrop
  const backdrop = [0, 1, 2].map((c) => image.data[(8 * image.width + 8) * 3 + c])
  const columns = new Uint32Array(image.width)
  const rows = new Uint32Array(image.height)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 3
      const off = Math.abs(image.data[i] - backdrop[0]) + Math.abs(image.data[i + 1] - backdrop[1]) + Math.abs(image.data[i + 2] - backdrop[2])
      if (off > 45) {
        columns[x]++
        rows[y]++
      }
    }
  }
  const first = (counts) => counts.findIndex((n) => n >= 3)
  const last = (counts) => counts.length - 1 - [...counts].reverse().findIndex((n) => n >= 3)
  views.push({ name, toCamera, across, sign, image, broad, fine, backdrop, left: first(columns), right: last(columns) + 1, top: first(rows), bottom: last(rows) + 1 })
}

/** Where a model point falls in a view, in pixels: the model's box is laid over the figure's box. */
function project(view, x, y, z, out) {
  const k = view.across
  const t = ((k === 0 ? x : z) - viewBox.min[k]) / (viewBox.max[k] - viewBox.min[k])
  out[0] = view.left + (view.sign > 0 ? t : 1 - t) * (view.right - view.left)
  out[1] = view.bottom - ((y - viewBox.min[1]) / (viewBox.max[1] - viewBox.min[1])) * (view.bottom - view.top)
}

// ---------------------------------------------------------------------------------------------------------
// The low mesh: find and thin the antennae first, since that moves vertices

const lowDoc = await io.read(lowPath)
const lowPrimitive = lowDoc.getRoot().listMeshes()[0].listPrimitives()[0]
const lp = Float32Array.from(lowPrimitive.getAttribute('POSITION').getArray())
const ln = lowPrimitive.getAttribute('NORMAL').getArray()
const luv = lowPrimitive.getAttribute('TEXCOORD_0').getArray()
const li = lowPrimitive.getIndices().getArray()
const vertexCount = lp.length / 3

const box = boxOf(lp)
const height = box.max[1] - box.min[1]

// The UV atlas splits vertices along its seams; join them again by position to walk the surface
const weldOf = new Uint32Array(vertexCount)
const welded = []
{
  const seen = new Map()
  for (let i = 0; i < vertexCount; i++) {
    const key = `${Math.round(lp[i * 3] * 1e5)},${Math.round(lp[i * 3 + 1] * 1e5)},${Math.round(lp[i * 3 + 2] * 1e5)}`
    let index = seen.get(key)
    if (index === undefined) {
      index = welded.length
      seen.set(key, index)
      welded.push([lp[i * 3], lp[i * 3 + 1], lp[i * 3 + 2]])
    }
    weldOf[i] = index
  }
}
const neighbours = welded.map(() => new Set())
for (let i = 0; i < li.length; i += 3) {
  const [a, b, c] = [weldOf[li[i]], weldOf[li[i + 1]], weldOf[li[i + 2]]]
  neighbours[a].add(b).add(c)
  neighbours[b].add(a).add(c)
  neighbours[c].add(a).add(b)
}

// An antenna is found from its tip, the highest point on its side of the head. Walking the surface away from
// the tip in thin shells of distance, each shell is a ring: small around the tip's ball, smaller around the
// stalk, then suddenly as wide as the scalp. The antenna ends where the rings start to widen for good.
const SHELL = 0.0035 * height
// Which antenna each (welded) vertex belongs to (0 none, 1 his left, 2 his right) and its shell
const antennaOfWelded = new Uint8Array(welded.length)
const antennae = []
for (const [side, sign] of [
  ['left', 1],
  ['right', -1],
]) {
  let tip = -1
  welded.forEach((p, i) => {
    if (p[0] * sign > 0 && (tip < 0 || p[1] > welded[tip][1])) tip = i
  })
  const reachLimit = 0.14 * height
  const distance = (i) => Math.hypot(welded[i][0] - welded[tip][0], welded[i][1] - welded[tip][1], welded[i][2] - welded[tip][2])
  const shellOf = new Map([[tip, 0]])
  const queue = [tip]
  while (queue.length) {
    const at = queue.pop()
    for (const next of neighbours[at]) {
      if (shellOf.has(next)) continue
      const d = distance(next)
      if (d > reachLimit) continue
      shellOf.set(next, Math.floor(d / SHELL))
      queue.push(next)
    }
  }
  const shells = []
  for (const [vertex, shell] of shellOf) (shells[shell] ??= []).push(vertex)
  const rings = Array.from({ length: shells.length }, (_, k) => {
    const members = shells[k] ?? []
    if (!members.length) return { centre: null, radius: 0 }
    const centre = [0, 1, 2].map((k) => members.reduce((sum, v) => sum + welded[v][k], 0) / members.length)
    const radius = Math.max(...members.map((v) => Math.hypot(welded[v][0] - centre[0], welded[v][1] - centre[1], welded[v][2] - centre[2])))
    return { centre, radius }
  })
  // The scalp: the first ring wider than any antenna could be
  const scalp = rings.findIndex((ring) => ring.radius > 0.03 * height)
  // The ball: the widest ring in the first half of the way to the scalp
  let ballShell = 1
  for (let k = 1; k < Math.ceil(scalp * 0.55); k++) if (rings[k].radius > rings[ballShell].radius) ballShell = k
  // The stalk's thickness: a low percentile of the rings between the ball and the scalp, so that neither the
  // ball's own rings nor one sparse ring decide it
  const between = rings.slice(ballShell + 1, scalp).filter((ring) => ring.centre)
  const stalkWidth = percentile(between.map((ring) => ring.radius), 0.3)
  // Where the ball gives way to the stalk: the first ring past the ball's widest that is nearer the stalk's size
  let neckShell = ballShell
  while (neckShell < scalp - 2 && rings[neckShell].radius > (rings[ballShell].radius + stalkWidth) / 2) neckShell++
  // The base: the last ring before they widen for good into the scalp
  let baseShell = neckShell
  while (baseShell < scalp - 1 && rings[baseShell + 1].radius < stalkWidth * 2.2) baseShell++

  // Thin it: every ring is drawn in towards its own centre. The ball keeps more of its size than the stalk,
  // and the last rings before the scalp ease back to full size so the root still meets the head
  const mark = side === 'left' ? 1 : 2
  const ballAt = rings[ballShell].centre
  const fromBall = (vertex) => Math.hypot(welded[vertex][0] - ballAt[0], welded[vertex][1] - ballAt[1], welded[vertex][2] - ballAt[2])
  const keepBall = antennaThin + (1 - antennaThin) * 0.45
  // The generator's tips are lumpy: each is also drawn most of the way onto a sphere of its own middling size
  const roundTo = median([...shellOf].filter(([, shell]) => shell <= neckShell).map(([vertex]) => fromBall(vertex))) * keepBall
  for (const [vertex, shell] of shellOf) {
    if (shell > baseShell) continue
    antennaOfWelded[vertex] = mark
    const keepStalk = antennaThin + (1 - antennaThin) * smoothstep(baseShell - 3, baseShell + 1, shell)
    if (shell < neckShell) {
      const from = fromBall(vertex) || 1
      const to = from * keepBall + (roundTo - from * keepBall) * 0.7
      for (let k = 0; k < 3; k++) welded[vertex][k] = ballAt[k] + ((welded[vertex][k] - ballAt[k]) / from) * to
      continue
    }
    const keep = shell <= neckShell ? keepBall : keepStalk
    // The ball shrinks about its own centre (the centre of its widest ring), so it stays round; the stalk
    // about each ring's centre
    const about = shell <= neckShell ? rings[ballShell].centre : rings[shell].centre
    for (let k = 0; k < 3; k++) welded[vertex][k] = about[k] + (welded[vertex][k] - about[k]) * keep
  }
  // The ball as it now is: the middle of its vertices and their usual distance from it
  const ball = [...shellOf].filter(([, shell]) => shell < neckShell).map(([vertex]) => welded[vertex])
  const ballCentre = [0, 1, 2].map((k) => ball.reduce((sum, p) => sum + p[k], 0) / ball.length)
  antennae.push({
    side,
    base: rings[baseShell].centre,
    tip: ballCentre,
    ballRadius: median(ball.map((p) => Math.hypot(p[0] - ballCentre[0], p[1] - ballCentre[1], p[2] - ballCentre[2]))),
    stalkRadius: stalkWidth * antennaThin,
    vertices: [...shellOf].filter(([, shell]) => shell <= baseShell).length,
  })
}
for (let i = 0; i < vertexCount; i++) lp.set(welded[weldOf[i]], i * 3)
const antennaOf = Uint8Array.from(weldOf, (w) => antennaOfWelded[w])
lowPrimitive.getAttribute('POSITION').setArray(lp)
lowPrimitive.setAttribute('_ANTENNA', lowDoc.createAccessor('antenna').setType('SCALAR').setArray(antennaOf).setBuffer(lowDoc.getRoot().listBuffers()[0]))

/** How far along an antenna a point is (0 at the base, 1 at the ball's centre) and how far off its line. */
function alongAntenna(antenna, x, y, z) {
  const line = [0, 1, 2].map((k) => antenna.tip[k] - antenna.base[k])
  const rel = [x - antenna.base[0], y - antenna.base[1], z - antenna.base[2]]
  const t = (rel[0] * line[0] + rel[1] * line[1] + rel[2] * line[2]) / (line[0] ** 2 + line[1] ** 2 + line[2] ** 2)
  return { t, off: Math.hypot(...[0, 1, 2].map((k) => rel[k] - line[k] * t)) }
}
/** 0..1: how surely a point is on an antenna (inside the tube around its line that holds stalk and ball). */
function onAntenna(x, y, z) {
  let most = 0
  for (const antenna of antennae) {
    const { t, off } = alongAntenna(antenna, x, y, z)
    const tube = Math.max(antenna.ballRadius * 1.5, antenna.stalkRadius * 3)
    most = Math.max(most, smoothstep(-0.02, 0.12, t) * (1 - smoothstep(tube * 0.8, tube * 1.2, off)) * (t < 1.6 ? 1 : 0))
  }
  return most
}

// ---------------------------------------------------------------------------------------------------------
// Rasterise the atlas

/**
 * The tangent and bitangent three.js derives in the shader for a surface with no vertex tangents: in the
 * tangent plane, across the lines of constant v and of constant u, pointing to growing u and growing v, and
 * both scaled by the longer of the two (see getTangentFrame in three's normal_pars_fragment).
 */
function tangentFrame(pu, pv, n, tangent, bitangent) {
  tangent[0] = pv[1] * n[2] - pv[2] * n[1]
  tangent[1] = pv[2] * n[0] - pv[0] * n[2]
  tangent[2] = pv[0] * n[1] - pv[1] * n[0]
  bitangent[0] = pu[1] * n[2] - pu[2] * n[1]
  bitangent[1] = pu[2] * n[0] - pu[0] * n[2]
  bitangent[2] = pu[0] * n[1] - pu[1] * n[0]
  if (tangent[0] * pu[0] + tangent[1] * pu[1] + tangent[2] * pu[2] < 0) for (let k = 0; k < 3; k++) tangent[k] = -tangent[k]
  if (bitangent[0] * pv[0] + bitangent[1] * pv[1] + bitangent[2] * pv[2] < 0) for (let k = 0; k < 3; k++) bitangent[k] = -bitangent[k]
  const longest = Math.sqrt(Math.max(tangent[0] ** 2 + tangent[1] ** 2 + tangent[2] ** 2, bitangent[0] ** 2 + bitangent[1] ** 2 + bitangent[2] ** 2)) || 1
  for (let k = 0; k < 3; k++) {
    tangent[k] /= longest
    bitangent[k] /= longest
  }
}

const colour = new Float32Array(SIZE * SIZE * 3)
// The dense texture's own colour, before the views add to it: what the material of a texel is judged by
const flat = new Float32Array(SIZE * SIZE * 3)
const position = new Float32Array(SIZE * SIZE * 3)
// The normal in the low mesh's tangent space (x along u, y against v, z out), and the grain to bump it with
const normal = new Float32Array(SIZE * SIZE * 3)
const grain = new Float32Array(SIZE * SIZE)
const roughness = new Float32Array(SIZE * SIZE)
const covered = new Uint8Array(SIZE * SIZE)
let texels = 0
let farthest = 0
const pixel = new Float64Array(2)
const sampleA = new Float64Array(3)
const sampleB = new Float64Array(3)
const sampleC = new Float64Array(3)
const tangent = new Float64Array(3)
const bitangent = new Float64Array(3)
for (let t = 0; t < li.length; t += 3) {
  const [a, b, c] = [li[t], li[t + 1], li[t + 2]]
  const [ax, ay] = [luv[a * 2] * SIZE, luv[a * 2 + 1] * SIZE]
  const [bx, by] = [luv[b * 2] * SIZE, luv[b * 2 + 1] * SIZE]
  const [cx, cy] = [luv[c * 2] * SIZE, luv[c * 2 + 1] * SIZE]
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
  if (Math.abs(area) < 1e-9) continue

  // How position changes with u and with v across this triangle
  const e1 = [0, 1, 2].map((k) => lp[b * 3 + k] - lp[a * 3 + k])
  const e2 = [0, 1, 2].map((k) => lp[c * 3 + k] - lp[a * 3 + k])
  const [du1, dv1, du2, dv2] = [bx - ax, by - ay, cx - ax, cy - ay]
  const pu = e1.map((value, k) => (value * dv2 - e2[k] * dv1) / area)
  const pv = e2.map((value, k) => (value * du1 - e1[k] * du2) / area)

  // Three quarters of a texel of slack, so texels whose centres sit just outside an island edge are painted too
  const slack = 0.75 / Math.sqrt(Math.abs(area))
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1))
  const x1 = Math.min(SIZE - 1, Math.ceil(Math.max(ax, bx, cx) + 1))
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1))
  const y1 = Math.min(SIZE - 1, Math.ceil(Math.max(ay, by, cy) + 1))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let wa = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area
      let wb = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area
      let wc = 1 - wa - wb
      const inside = wa >= 0 && wb >= 0 && wc >= 0
      if (!inside && (wa < -slack || wb < -slack || wc < -slack)) continue
      const index = y * SIZE + x
      // A texel truly inside a triangle wins over one only reached through the slack
      if (covered[index] === 2 || (covered[index] === 1 && !inside)) continue
      if (!inside) {
        wa = Math.max(0, wa)
        wb = Math.max(0, wb)
        wc = Math.max(0, wc)
        const sum = wa + wb + wc
        wa /= sum
        wb /= sum
        wc /= sum
      }
      const q = [0, 1, 2].map((k) => lp[a * 3 + k] * wa + lp[b * 3 + k] * wb + lp[c * 3 + k] * wc)
      farthest = Math.max(farthest, nearest(q[0], q[1], q[2]))
      if (covered[index] === 0) texels++
      covered[index] = inside ? 2 : 1
      position.set(q, index * 3)
      flat.set(hitColour, index * 3)
      roughness[index] = hit.roughness

      // What the views add: their detail, and a share of their broad colour, where they agree with the mesh
      let addR = 0
      let addG = 0
      let addB = 0
      let addGrain = 0
      let weightSum = 0
      let strongest = 0
      for (const view of views) {
        const facing = hitNormal[0] * view.toCamera[0] + hitNormal[1] * view.toCamera[1] + hitNormal[2] * view.toCamera[2]
        if (facing < 0.2) continue
        project(view, hitGenerated[0], hitGenerated[1], hitGenerated[2], pixel)
        samplePixel(view.broad, pixel[0], pixel[1], sampleB)
        // The same material in the view as on the mesh? Compared in broad colour, so grain does not matter
        const apart = Math.hypot(sampleB[0] - hitColour[0], sampleB[1] - hitColour[1], sampleB[2] - hitColour[2])
        const agrees = Math.exp(-((apart / 38) ** 2))
        const weight = facing ** 3 * agrees
        if (weight < 1e-3) continue
        samplePixel(view.image, pixel[0], pixel[1], sampleA)
        samplePixel(view.fine, pixel[0], pixel[1], sampleC)
        // Detail, with anything stronger than grain or mottling (a misplaced edge) pressed flat
        const soften = (d) => 26 * Math.tanh(d / 26)
        addR += weight * (soften(sampleA[0] - sampleB[0]) + 0.5 * (sampleB[0] - hitColour[0]))
        addG += weight * (soften(sampleA[1] - sampleB[1]) + 0.5 * (sampleB[1] - hitColour[1]))
        addB += weight * (soften(sampleA[2] - sampleB[2]) + 0.5 * (sampleB[2] - hitColour[2]))
        addGrain += weight * (luminance(sampleA[0], sampleA[1], sampleA[2]) - luminance(sampleC[0], sampleC[1], sampleC[2]))
        weightSum += weight
        strongest = Math.max(strongest, weight)
      }
      // Blend the views that see this texel, then fade the whole addition where none sees it well
      const share = weightSum > 0 ? Math.min(1, strongest * 1.6) / weightSum : 0
      colour[index * 3] = hitColour[0] + addR * share
      colour[index * 3 + 1] = hitColour[1] + addG * share
      colour[index * 3 + 2] = hitColour[2] + addB * share
      grain[index] = addGrain * share

      // The dense surface's normal, written in this texel's tangent frame: solve [T, -B, N] m = n
      let nl = [0, 1, 2].map((k) => ln[a * 3 + k] * wa + ln[b * 3 + k] * wb + ln[c * 3 + k] * wc)
      const length = Math.hypot(nl[0], nl[1], nl[2]) || 1
      nl = nl.map((value) => value / length)
      tangentFrame(pu, pv, nl, tangent, bitangent)
      const c0 = tangent
      const c1 = [-bitangent[0], -bitangent[1], -bitangent[2]]
      const c2 = nl
      const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
      const r0 = cross(c1, c2)
      const det = dot(c0, r0)
      let m = [0, 0, 1]
      if (Math.abs(det) > 1e-9) {
        m = [dot(r0, hitNormal) / det, dot(cross(c2, c0), hitNormal) / det, dot(cross(c0, c1), hitNormal) / det]
        // A dense normal that faces away from the low surface (inside a crease the low mesh closed) is no use
        if (m[2] < 0.15) m = [0, 0, 1]
      }
      normal.set(m, index * 3)
    }
  }
}
console.log(`${texels} texels painted (${((texels / (SIZE * SIZE)) * 100).toFixed(1)}% of the atlas), low surface at most ${(farthest * 1000).toFixed(2)} mm from the dense one`)

// ---------------------------------------------------------------------------------------------------------
// Measure the eyes

const EYE = 1
const kind = new Uint8Array(SIZE * SIZE)
for (let i = 0; i < SIZE * SIZE; i++) {
  if (!covered[i]) continue
  const up = (position[i * 3 + 1] - box.min[1]) / height
  // Eyes: dark, and high on the head (the hood's shadowed inside is dark too, but lower)
  if (flat[i * 3] + flat[i * 3 + 1] + flat[i * 3 + 2] < 150 && up > 0.66) kind[i] = EYE
}
// The dark texels on each side of the face, less the nostrils and mouth (which sit near the centre line and are
// few). Centre and half-extents from the 1st to 99th percentile of the texel positions on each axis
const eyes = {}
for (const [side, sign] of [
  ['left', 1],
  ['right', -1],
]) {
  let points = []
  for (let i = 0; i < SIZE * SIZE; i++) if (kind[i] === EYE && position[i * 3] * sign > 0.012 * height) points.push(i)
  const centre0 = [0, 1, 2].map((k) => median(points.map((i) => position[i * 3 + k])))
  points = points.filter((i) => Math.hypot(...[0, 1, 2].map((k) => position[i * 3 + k] - centre0[k])) < 0.09 * height)
  const low = [0, 1, 2].map((k) => percentile(points.map((i) => position[i * 3 + k]), 0.01))
  const high = [0, 1, 2].map((k) => percentile(points.map((i) => position[i * 3 + k]), 0.99))
  eyes[side] = {
    center: low.map((value, k) => (value + high[k]) / 2),
    radii: low.map((value, k) => (high[k] - value) / 2),
    forward: [0, 0, 0],
    texels: points.length,
  }
}
// Texels the first pass called eye but that sit away from both eyes (nostrils, the mouth line) are not eye
const inEyeBox = (x, y, z, grow) =>
  ['left', 'right'].some((side) => [x, y, z].every((value, k) => Math.abs(value - eyes[side].center[k]) <= eyes[side].radii[k] * grow + 0.001))
for (let i = 0; i < SIZE * SIZE; i++) {
  if (kind[i] === EYE && !inEyeBox(position[i * 3], position[i * 3 + 1], position[i * 3 + 2], 1.08)) kind[i] = 0
}
// Which way each eye faces: the mean normal of the low mesh's dark vertices in its box
for (let i = 0; i < vertexCount; i++) {
  if ((lp[i * 3 + 1] - box.min[1]) / height < 0.66) continue
  nearest(lp[i * 3], lp[i * 3 + 1], lp[i * 3 + 2])
  if (hitColour[0] + hitColour[1] + hitColour[2] >= 150) continue
  for (const side of ['left', 'right']) {
    if ([0, 1, 2].every((k) => Math.abs(lp[i * 3 + k] - eyes[side].center[k]) <= eyes[side].radii[k])) for (let k = 0; k < 3; k++) eyes[side].forward[k] += ln[i * 3 + k]
  }
}
for (const side of ['left', 'right']) {
  const length = Math.hypot(...eyes[side].forward) || 1
  eyes[side].forward = eyes[side].forward.map((value) => value / length)
}

// ---------------------------------------------------------------------------------------------------------
// Repairs

// The skin's own colour: the median of the texels that are neither blue (hoodie) nor brown (shorts) nor dark
const skinTexels = []
for (let i = 0; i < SIZE * SIZE; i += 29) {
  if (!covered[i] || kind[i] === EYE) continue
  const [r, g, b] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]]
  if (g > b + 12 && Math.abs(r - g) < 22 && g > 110) skinTexels.push(i)
}
const skin = [0, 1, 2].map((c) => median(skinTexels.map((i) => colour[i * 3 + c])))
const skinLuminance = luminance(skin[0], skin[1], skin[2])

for (let i = 0; i < SIZE * SIZE; i++) {
  if (!covered[i]) continue
  const [x, y, z] = [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]]
  if (kind[i] === EYE) {
    // An even near-black, glossy, with no grain: the generator leaves reflections and grey patches in the eyes
    colour[i * 3] = 9
    colour[i * 3 + 1] = 10
    colour[i * 3 + 2] = 13
    roughness[i] = 0.08
    grain[i] = 0
    continue
  }
  // Nothing on this body is a mirror; the generator's roughness dips where it painted highlights
  roughness[i] = Math.min(0.95, Math.max(0.5, roughness[i]))

  // Pink out: the generator blushes the antennae, the eyelid rims and the finger and toe tips. The reference
  // has skin-coloured antennae and no pink nails. Pink texels are pulled to the skin's hue at their own
  // brightness: all the way on the antennae, most of the way at the hands and feet, part of the way round the eyes
  const up = (y - box.min[1]) / height
  const [r, g, b] = [colour[i * 3], colour[i * 3 + 1], colour[i * 3 + 2]]
  const antenna = onAntenna(x, y, z)
  const hand = up > 0.26 && up < 0.56 && Math.abs(x) > 0.16 * height
  const foot = up < 0.08
  const face = up > 0.64
  // On the hands and feet anything redder than it is green is a nail; on the face only a warm pink counts
  const pink = hand || foot ? smoothstep(0.99, 1.06, r / Math.max(g, 1)) : smoothstep(1.0, 1.1, r / Math.max(g, 1)) * (g > b ? 1 : 0)
  const pull = Math.max(antenna * 0.92, pink * (hand || foot ? 1 : face ? (inEyeBox(x, y, z, 1.7) ? 0.55 : 0.8) : 0))
  if (pull > 0) {
    const scale = luminance(r, g, b) / skinLuminance
    for (let c = 0; c < 3; c++) colour[i * 3 + c] += (skin[c] * scale - colour[i * 3 + c]) * pull
  }

  // The generator's skin leans beige; the reference's is a greyer green. Skin is what is not blue (the hoodie)
  // and lies on the hands, from the neck up, or on the legs, where it is told from the khaki shorts by being
  // less red
  const [fr, fg, fb] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]]
  const leg = up < 0.45 && Math.abs(x) < 0.16 * height && fr < fg * 1.095
  if ((leg || hand || up > 0.56) && fg > fb + 8) for (let c = 0; c < 3; c++) colour[i * 3 + c] *= skinTint[c]
}

// The grain as a bump: its slope across the atlas tilts the baked normal. Darker is taken as lower (the gaps
// between threads, pores), which is how the views were lit
const BUMP = 0.035
const BUMP_LIMIT = 0.3
const bumped = new Float32Array(SIZE * SIZE * 3)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x
    if (!covered[i]) continue
    const at = (dx, dy) => {
      const nx = x + dx
      const ny = y + dy
      return nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && covered[ny * SIZE + nx] ? grain[ny * SIZE + nx] : grain[i]
    }
    const slopeU = Math.max(-BUMP_LIMIT, Math.min(BUMP_LIMIT, ((at(1, 0) - at(-1, 0)) / 2) * BUMP))
    const slopeV = Math.max(-BUMP_LIMIT, Math.min(BUMP_LIMIT, ((at(0, 1) - at(0, -1)) / 2) * BUMP))
    // Tangent space: x along u, y against v. A height rising along u leans the normal back against u
    const nx = normal[i * 3] - slopeU
    const ny = normal[i * 3 + 1] + slopeV
    const nz = normal[i * 3 + 2]
    const length = Math.hypot(nx, ny, nz) || 1
    bumped[i * 3] = nx / length
    bumped[i * 3 + 1] = ny / length
    bumped[i * 3 + 2] = nz / length
  }
}

// ---------------------------------------------------------------------------------------------------------
// Fill the gutters between islands, so mipmaps and filtering never pull in an unpainted texel

let filled = covered.map((c) => (c ? 1 : 0))
for (let pass = 0; pass < 24; pass++) {
  const next = filled.slice()
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = y * SIZE + x
      if (filled[index]) continue
      let count = 0
      const sum = [0, 0, 0, 0, 0, 0, 0]
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || !filled[ny * SIZE + nx]) continue
          const neighbour = ny * SIZE + nx
          for (let c = 0; c < 3; c++) {
            sum[c] += colour[neighbour * 3 + c]
            sum[3 + c] += bumped[neighbour * 3 + c]
          }
          sum[6] += roughness[neighbour]
          count++
        }
      }
      if (!count) continue
      for (let c = 0; c < 3; c++) {
        colour[index * 3 + c] = sum[c] / count
        bumped[index * 3 + c] = sum[3 + c] / count
      }
      roughness[index] = sum[6] / count
      next[index] = 1
    }
  }
  filled = next
}
const byte = (value) => Math.min(255, Math.max(0, Math.round(value)))
const baseColour = Buffer.alloc(SIZE * SIZE * 3)
const normalMap = Buffer.alloc(SIZE * SIZE * 3)
// glTF packs roughness in green and metalness in blue; nothing here is metal
const metalRough = Buffer.alloc(SIZE * SIZE * 3)
for (let i = 0; i < SIZE * SIZE; i++) {
  const length = Math.hypot(bumped[i * 3], bumped[i * 3 + 1], bumped[i * 3 + 2])
  for (let c = 0; c < 3; c++) {
    baseColour[i * 3 + c] = filled[i] ? byte(colour[i * 3 + c]) : byte(skin[c])
    normalMap[i * 3 + c] = filled[i] && length > 0 ? byte((bumped[i * 3 + c] / length) * 127.5 + 127.5) : c === 2 ? 255 : 128
  }
  metalRough[i * 3] = 255
  metalRough[i * 3 + 1] = byte((filled[i] ? roughness[i] : 0.8) * 255)
}

const raw = { raw: { width: SIZE, height: SIZE, channels: 3 } }
const texture = async (name, buffer) => lowDoc.createTexture(name).setMimeType('image/png').setImage(await sharp(buffer, raw).png().toBuffer())
lowPrimitive
  .getMaterial()
  .setBaseColorTexture(await texture('baseColor', baseColour))
  .setNormalTexture(await texture('normal', normalMap))
  .setMetallicRoughnessTexture(await texture('metallicRoughness', metalRough))
  .setBaseColorFactor([1, 1, 1, 1])
  .setRoughnessFactor(1)
  .setMetallicFactor(1)
await io.write(outPath, lowDoc)

const facts = { box, height, skin, eyes, antennae }
writeFileSync(factsPath, JSON.stringify(facts, null, 2))
console.log(JSON.stringify({ skin, eyes, antennae }))
