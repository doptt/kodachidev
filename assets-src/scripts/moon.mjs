// Step 2 of the moon's texture pipeline: the PNGs from moon.py -> KTX2 in public/moon/.
// See assets-src/README-moon.md.
//
//   node assets-src/scripts/moon.mjs [--only moon-color-4k,earth-2k] [--raw assets-src/raw/moon]
//
// The encoder is Binomial's Basis Universal, built to WebAssembly (basis_encoder.js
// and basis_encoder.wasm from the repository's webgl/encoder/build folder), kept
// in assets-src/tools/basis_encoder/ with the .js renamed to .cjs (this package
// is an ES module, the encoder's loader is CommonJS). Nothing is installed.
//
// Colour maps are ETC1S (small files, fine for photographs). Normal maps are
// UASTC with rate-distortion optimisation and Zstandard: ETC1S blocks show up
// as facets the moment a hard light rakes across them.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : args[i + 1]
}
const raw = path.resolve(flag('raw', path.join(repo, 'assets-src', 'raw', 'moon')))
const only = flag('only', null)?.split(',')
const src = path.join(raw, 'out')
const out = path.join(repo, 'public', 'moon')
const tool = path.join(repo, 'assets-src', 'tools', 'basis_encoder')
mkdirSync(out, { recursive: true })

/**
 * kind: 'color' (sRGB, ETC1S), 'normal' (linear, UASTC), 'data' (linear, UASTC:
 * channels that are not a picture and must not bleed into each other)
 */
const JOBS = [
  { name: 'moon-color-4k', kind: 'color', quality: 190 },
  { name: 'moon-color-2k', kind: 'color', quality: 190 },
  { name: 'moon-normal-2k', kind: 'normal', rdo: 1.6 },
  { name: 'moon-detail', kind: 'data', rdo: 1.2 },
  { name: 'site-2k', kind: 'data', rdo: 1.5 },
  { name: 'site-1k', kind: 'data', rdo: 1.5 },
  { name: 'earth-2k', kind: 'color', quality: 170 },
  { name: 'earth-1k', kind: 'color', quality: 170 },
]

const require = createRequire(import.meta.url)
const BASIS = require(path.join(tool, 'basis_encoder.cjs'))
const basis = await BASIS({ wasmBinary: readFileSync(path.join(tool, 'basis_encoder.wasm')) })
basis.initializeBasis()

for (const job of JOBS) {
  if (only && !only.includes(job.name)) continue
  const image = await sharp(path.join(src, `${job.name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = image.info
  const started = Date.now()
  const enc = new basis.BasisEncoder()
  enc.setCreateKTX2File(true)
  enc.setSliceSourceImage(0, new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength), width, height, basis.ldr_image_type.cRGBA32.value)
  enc.setMipGen(true)
  enc.setDebug(false)
  enc.setStatusOutput(false)
  enc.setComputeStats(false)
  const srgb = job.kind === 'color'
  enc.setPerceptual(srgb)
  enc.setMipSRGB(srgb)
  enc.setKTX2AndBasisSRGBTransferFunc(srgb)
  if (job.kind === 'color') {
    enc.setUASTC(false)
    enc.setQualityLevel(job.quality)
    enc.setETC1SCompressionLevel(2)
  } else {
    enc.setUASTC(true)
    enc.setPackUASTCFlags(2)
    enc.setRDOUASTC(true)
    enc.setRDOUASTCQualityScalar(job.rdo)
    enc.setKTX2UASTCSupercompression(true)
    if (job.kind === 'normal') enc.setMipRenormalize(true)
  }
  const buffer = new Uint8Array(width * height * 4 + (1 << 20))
  const bytes = enc.encode(buffer)
  enc.delete()
  if (!bytes) throw new Error(`${job.name}: the encoder produced nothing`)
  const file = path.join(out, `${job.name}.ktx2`)
  writeFileSync(file, buffer.subarray(0, bytes))
  console.log(`${job.name}.ktx2  ${width}x${height}  ${(bytes / 1024).toFixed(0)} KB  ${((Date.now() - started) / 1000).toFixed(1)}s`)
}
