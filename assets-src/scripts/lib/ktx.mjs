// Encodes every texture of a glTF-Transform document to KTX2 with the KTX-Software `ktx` command-line tool.
import { KHRTextureBasisu } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Colour and roughness textures go to Basis ETC1S: small on the wire and a fifth of the GPU memory of an
 * uncompressed texture. Normal maps go to UASTC (with rate-distortion optimisation and Zstandard), because
 * ETC1S turns their smooth gradients into visible blocks. All get mipmaps. Colour textures (base colour,
 * emissive) are tagged sRGB and the rest linear, which the transcoder needs to know. `quality` is the ETC1S
 * quality level, 1 to 255.
 */
export async function texturesToKtx2(doc, tool, quality = 255) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ktx-'))
  doc.createExtension(KHRTextureBasisu).setRequired(true)
  const materials = doc.getRoot().listMaterials()
  const colour = new Set(materials.flatMap((material) => [material.getBaseColorTexture(), material.getEmissiveTexture()]))
  const normal = new Set(materials.map((material) => material.getNormalTexture()))
  for (const [i, texture] of doc.getRoot().listTextures().entries()) {
    const png = path.join(dir, `${i}.png`)
    const ktx = path.join(dir, `${i}.ktx2`)
    writeFileSync(png, await sharp(texture.getImage()).removeAlpha().png().toBuffer())
    const srgb = colour.has(texture)
    const input = ['--format', srgb ? 'R8G8B8_SRGB' : 'R8G8B8_UNORM', '--assign-tf', srgb ? 'srgb' : 'linear', '--generate-mipmap']
    const codec = normal.has(texture)
      ? ['--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--uastc-rdo-l', '3', '--zstd', '18']
      : ['--encode', 'basis-lz', '--clevel', '5', '--qlevel', String(quality)]
    execFileSync(tool, ['create', ...input, ...codec, png, ktx])
    texture.setImage(readFileSync(ktx)).setMimeType('image/ktx2')
  }
  rmSync(dir, { recursive: true, force: true })
}
