import * as THREE from 'three'
import { createKTX2Loader } from '../stage/ktx2'

/**
 * The scene's files (see assets-src/README-moon.md for where each comes from):
 *
 *   /moon/moon-color-{4k,2k}.ktx2    LROC WAC colour mosaic: the broad tone of the ground
 *   /moon/moon-normal-2k.ktx2        slopes of the LOLA elevation model: the broad lie of the land
 *   /moon/site-{2k,1k}.ktx2          the ground round the chair, with its shadows baked in
 *   /moon/moon-detail.ktx2           the tiling grain
 *   /moon/earth-{2k,1k}.ktx2         Blue Marble, clouds in alpha
 *   /sky/{1024,512}/*.webp           NASA's star map as a cube (see assets-src/README-sky.md)
 *   /basis/                          the Basis transcoder KTX2Loader runs in a worker
 */
export type MoonAssets = {
  color: THREE.Texture
  normal: THREE.Texture
  detail: THREE.Texture
  site: THREE.Texture
  earth: THREE.Texture
  /** Null if the star map could not be fetched: the sky is then plain black. */
  sky: THREE.CubeTexture | null
  dispose(): void
}

export type AssetSizes = { moon: '4k' | '2k'; site: '2k' | '1k'; earth: '2k' | '1k'; sky: 1024 | 512 }

const SKY_FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']

/**
 * Fetches everything, in parallel. `onProgress` hears how many of the files
 * are in. Rejects if anything the moon cannot be drawn without is missing.
 */
export async function loadAssets(renderer: THREE.WebGLRenderer, sizes: AssetSizes, onProgress: (done: number, total: number) => void): Promise<MoonAssets> {
  const base = import.meta.env.BASE_URL
  const ktx2 = createKTX2Loader(renderer)
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const total = 6
  let done = 0
  const count = <T>(promise: Promise<T>) =>
    promise.then((value) => {
      onProgress(++done, total)
      return value
    })

  const map = async (name: string, wrap: 'round' | 'tile' | 'none') => {
    const texture = await ktx2.loadAsync(`${base}moon/${name}.ktx2`)
    // The maps wrap round the moon east to west; the grain tiles both ways; the site picture is a single patch
    texture.wrapS = wrap === 'none' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
    texture.wrapT = wrap === 'tile' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
    texture.anisotropy = anisotropy
    return texture
  }

  const sky = new THREE.CubeTextureLoader()
    .setPath(`${base}sky/${sizes.sky}/`)
    .loadAsync(SKY_FACES.map((face) => `${face}.webp`))
    .then(
      (texture) => {
        // Stored through a cube root, not as sRGB: the shader undoes it. Never minified, so no mips.
        texture.colorSpace = THREE.NoColorSpace
        texture.generateMipmaps = false
        texture.minFilter = THREE.LinearFilter
        return texture
      },
      () => null,
    )

  try {
    const [color, normal, detail, site, earth, stars] = await Promise.all([
      count(map(`moon-color-${sizes.moon}`, 'round')),
      count(map('moon-normal-2k', 'round')),
      count(map('moon-detail', 'tile')),
      count(map(`site-${sizes.site}`, 'none')),
      count(map(`earth-${sizes.earth}`, 'round')),
      count(sky),
    ])
    return {
      color,
      normal,
      detail,
      site,
      earth,
      sky: stars,
      dispose() {
        for (const texture of [color, normal, detail, site, earth, stars]) texture?.dispose()
      },
    }
  } finally {
    // The transcoder's workers are only needed while the files come in
    ktx2.dispose()
  }
}
