import * as THREE from 'three'

/**
 * What the shiny things reflect. The moon scene has one sun and a faint fill
 * and no environment map, so polished aluminium, the bottle and his eyes would
 * have nothing to mirror but a single highlight. This is a small picture of
 * where he is, as seen from his chair: sunlit regolith below the horizon,
 * black sky above it, and the Earth hanging in front of him as the one bright
 * thing overhead. It is set on those materials only (never on the scene), in
 * the actor's own frame, and its brightness is tied to the moon scene's sun
 * each frame (see `EnvLink` in actor.ts), so the ground in a reflection is as
 * bright as the ground beside it.
 *
 * Radiance is stored relative to sunlit ground = 1.
 */
export const ENV_EARTH_DIRECTION = new THREE.Vector3(0.42, 0.56, 0.71).normalize()

const WIDTH = 256
const HEIGHT = 128
const EARTH_RADIUS = 0.13 // radians: far larger than life, so a curved mirror still shows a disc
const EARTH_RADIANCE = 7

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Smooth value noise, periodic in x over `period` cells so the picture wraps round the horizon. */
function noise(x: number, y: number, period: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const wrap = (i: number) => ((i % period) + period) % period
  const a = hash(wrap(xi), yi)
  const b = hash(wrap(xi + 1), yi)
  const c = hash(wrap(xi), yi + 1)
  const d = hash(wrap(xi + 1), yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

export function makeEnvironment(renderer: THREE.WebGLRenderer): { texture: THREE.Texture; dispose: () => void } {
  const data = new Uint16Array(WIDTH * HEIGHT * 4)
  const half = THREE.DataUtils.toHalfFloat
  const dir = new THREE.Vector3()
  for (let j = 0; j < HEIGHT; j++) {
    // Row 0 is straight up
    const polar = ((j + 0.5) / HEIGHT) * Math.PI
    for (let i = 0; i < WIDTH; i++) {
      const u = (i + 0.5) / WIDTH
      const azimuth = (u - 0.5) * Math.PI * 2
      dir.set(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), -Math.sin(polar) * Math.cos(azimuth))
      let r = 0.0015
      let g = 0.0017
      let b = 0.0022
      if (dir.y < 0) {
        // Regolith: mottled, a touch warm, darker straight down where his own shadow and the chair's are
        const depth = -dir.y
        const mottle = 0.72 + 0.4 * noise(u * 24, depth * 9, 24) + 0.22 * noise(u * 64, depth * 30, 64)
        const underfoot = 1 - 0.55 * THREE.MathUtils.smoothstep(depth, 0.75, 1)
        const haze = 1 + 0.25 * (1 - THREE.MathUtils.smoothstep(depth, 0, 0.12))
        const v = mottle * underfoot * haze
        r = v * 1.02
        g = v
        b = v * 0.96
      } else {
        const toEarth = Math.acos(THREE.MathUtils.clamp(dir.dot(ENV_EARTH_DIRECTION), -1, 1))
        const disc = 1 - THREE.MathUtils.smoothstep(toEarth, EARTH_RADIUS * 0.82, EARTH_RADIUS)
        const glow = Math.exp(-toEarth * 5) * 0.05
        r += disc * EARTH_RADIANCE * 0.55 + glow * 0.5
        g += disc * EARTH_RADIANCE * 0.78 + glow * 0.75
        b += disc * EARTH_RADIANCE + glow
      }
      const o = (j * WIDTH + i) * 4
      data[o] = half(r)
      data[o + 1] = half(g)
      data[o + 2] = half(b)
      data[o + 3] = half(1)
    }
  }
  const equirect = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat, THREE.HalfFloatType)
  equirect.mapping = THREE.EquirectangularReflectionMapping
  equirect.colorSpace = THREE.LinearSRGBColorSpace
  equirect.minFilter = THREE.LinearFilter
  equirect.magFilter = THREE.LinearFilter
  equirect.wrapS = THREE.RepeatWrapping
  equirect.needsUpdate = true

  // Drawn with the site's shared renderer, possibly between two frames of another scene: three.js is
  // told to forget the GL state it remembers before and after (see readTexture in measure.ts)
  renderer.resetState()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(equirect)
  pmrem.dispose()
  renderer.resetState()
  equirect.dispose()
  return { texture: target.texture, dispose: () => target.dispose() }
}
