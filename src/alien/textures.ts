import * as THREE from 'three'

/**
 * Every picture the props need, painted on canvases at start-up so nothing
 * waits on a download: the chair's webbing, the glass and label of the beer
 * bottle, and the soft blob the contact shadows are made of. Sizes halve on
 * the low tiers.
 */

/** A seeded random number generator (mulberry32), so the same textures come out every time. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas is not available')
  return { c, ctx }
}

/** Tangent-space normal map from a height field (heights in pixels of relief), wrapping at the edges. */
function normalsFromHeight(height: Float32Array, width: number, rows: number, strength: number) {
  const { c, ctx } = canvas(width, rows)
  const image = ctx.createImageData(width, rows)
  for (let y = 0; y < rows; y++) {
    const up = ((y + rows - 1) % rows) * width
    const down = ((y + 1) % rows) * width
    for (let x = 0; x < width; x++) {
      const left = (x + width - 1) % width
      const right = (x + 1) % width
      const dx = (height[y * width + right] - height[y * width + left]) * 0.5 * strength
      // Canvas rows run downward and texture v runs upward
      const dy = (height[up + x] - height[down + x]) * 0.5 * strength
      const inv = 1 / Math.hypot(dx, dy, 1)
      const o = (y * width + x) * 4
      image.data[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255)
      image.data[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255)
      image.data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255)
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return c
}

function texture(source: HTMLCanvasElement, opts: { srgb?: boolean; repeatS?: boolean; repeatT?: boolean; anisotropy?: number } = {}) {
  const t = new THREE.CanvasTexture(source)
  t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = opts.repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.wrapT = opts.repeatT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.anisotropy = opts.anisotropy ?? 4
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

// ---------------------------------------------------------------- webbing ----

/** The two straps of the chair, as columns of one atlas. */
const STRAP_STYLES = ['tan', 'white'] as const
export type StrapStyle = (typeof STRAP_STYLES)[number]

/** Threads across one strap's width. The colour atlas and the normal tile agree on it. */
const THREADS = 40
/** Threads in one tile of the weave's normal map. */
const NORMAL_THREADS = 8

/**
 * The coloured strap is the site's own tan, as it is seen: on screen, in the
 * moon's sun, it should be the tan the page draws its small type in
 * (`--color-bh-accent`, #bca68e, in src/styles/index.css). The sun is five
 * times a plain light and the film curve lifts and pales everything bright, so
 * the cloth itself has to be darker and richer than that to come out as it:
 * painted #bca68e it showed as cream (#d6c7b0) beside the white straps.
 * Painted this, the sunlit strap measures #c3ad8b in the settled moon view
 * and #bda37f in the harness (scripts/alien-shots.mjs --set props). If the
 * theme's tan, the sun or the film curve changes, tune it again by measuring.
 */
const TAN = '#8b7252'
/** The cream the pins and their badges glow in (`--color-bh-highlight`; CHAMPAGNE in src/moon/config.ts is the same, in linear light). */
const CREAM = '#ffedc1'

/** A colour part of the way from one to another, channel by channel, as written (sRGB). */
function between(from: string, to: string, share: number) {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * share).toString(16).padStart(2, '0')).join('')}`
}

type Stripe = [centre: number, width: number, colour: string]
const STRAPS: Record<StrapStyle, { base: string; stripes: Stripe[] }> = {
  tan: {
    base: TAN,
    stripes: [
      // A broad band down the middle, a shade nearer the cream: tone on tone, as it was when the strap was green
      [0.5, 0.3, between(TAN, CREAM, 0.22)],
      [0.16, 0.06, '#ece5c2'],
      [0.84, 0.06, '#ece5c2'],
    ],
  },
  white: {
    base: '#ecebe0',
    stripes: [
      [0.27, 0.09, TAN],
      [0.73, 0.09, TAN],
      [0.5, 0.035, '#d6c688'],
    ],
  },
}

/** Height of a plain weave at (x, y) measured in threads: warp and weft threads taking turns on top. */
function weaveHeight(x: number, y: number) {
  const i = Math.floor(x)
  const j = Math.floor(y)
  const fx = x - i - 0.5
  const fy = y - j - 0.5
  const across = Math.cos(Math.PI * fx)
  const along = Math.cos(Math.PI * fy)
  return (i + j) % 2 === 0 ? across * (0.55 + 0.45 * along) : along * (0.55 + 0.45 * across)
}

/**
 * The webbing: woven polypropylene strap in tan and in white, side by side
 * in one atlas (u picks the strap, v runs along it and tiles), and a tileable
 * normal map of the weave itself. One unit of v is one strap width of length.
 */
export function makeWebbing(cell: number) {
  const { c, ctx } = canvas(cell * STRAP_STYLES.length, cell)
  STRAP_STYLES.forEach((style, column) => {
    const { base, stripes } = STRAPS[style]
    const x0 = column * cell
    ctx.fillStyle = base
    ctx.fillRect(x0, 0, cell, cell)
    for (const [centre, width, colour] of stripes) {
      ctx.fillStyle = colour
      ctx.fillRect(x0 + (centre - width / 2) * cell, 0, width * cell, cell)
    }
  })
  // The weave, as light and shade on the threads, and a slightly darker bound edge
  const image = ctx.getImageData(0, 0, c.width, c.height)
  const pitch = cell / THREADS
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const inCell = (x % cell) / cell
      const edge = 1 - 0.1 * (1 - THREE.MathUtils.smoothstep(Math.min(inCell, 1 - inCell), 0, 0.035))
      const shade = (0.87 + 0.13 * weaveHeight(x / pitch, y / pitch)) * edge
      const o = (y * c.width + x) * 4
      image.data[o] *= shade
      image.data[o + 1] *= shade
      image.data[o + 2] *= shade
    }
  }
  ctx.putImageData(image, 0, 0)

  const n = Math.max(32, cell / 4)
  const height = new Float32Array(n * n)
  const threadPx = n / NORMAL_THREADS
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) height[y * n + x] = weaveHeight(x / threadPx, y / threadPx) * threadPx * 0.32
  const normal = normalsFromHeight(height, n, n, 1)

  const map = texture(c, { srgb: true, repeatT: true, anisotropy: 8 })
  const normalMap = texture(normal, { repeatS: true, repeatT: true, anisotropy: 4 })
  // The atlas holds the straps side by side; the normal tile repeats so its threads match the atlas's
  normalMap.repeat.set((THREADS / NORMAL_THREADS) * STRAP_STYLES.length, THREADS / NORMAL_THREADS)
  return { map, normalMap }
}

/** Where a strap's width sits in the atlas: u for the two edges, pulled in a hair so neighbours never bleed. */
export function strapColumn(style: StrapStyle): [number, number] {
  const i = STRAP_STYLES.indexOf(style)
  const inset = 0.006
  return [(i + inset) / STRAP_STYLES.length, (i + 1 - inset) / STRAP_STYLES.length]
}

// ------------------------------------------------------------- the beer ----

/**
 * How the picture of the beer bottle is laid out: u goes once round the
 * bottle, with the middle of the label at u = 0; v runs from the base to the
 * lip over 0..`wall`, and `inside` is a v in the dark strip above that, for
 * the bore of the mouth.
 */
export const BEER_UV = { wall: 0.94, inside: 0.97 }

/** What the picture needs to know of the bottle, in metres: see BEER in props/beer.ts. */
export type BeerShape = { height: number; radius: number; shoulder: number; level: number; label: readonly [number, number]; neckLabel: readonly [number, number] }

/** How much of the way round the bottle the body label goes. */
const LABEL_WRAP = 0.64

/**
 * The beer bottle: amber glass, darker and denser where there is beer behind
 * it and paler and clearer above, a cream paper label lettered MOON BREW and
 * a band of the same paper round the neck. A colour map whose alpha says how
 * much can be seen through (paper nothing, beer hardly anything, empty glass
 * a good deal), and a roughness map: smooth glass with a mist of condensation
 * and clear beads in it on the cold part, and matt paper.
 */
export function makeBeerTextures(size: number, shape: BeerShape) {
  const rand = rng(23)
  const { c, ctx } = canvas(size, size)
  const rough = canvas(size, size)
  const px = size / 512
  /** The row of the picture for a height on the bottle. */
  const row = (y: number) => size * (1 - (y / shape.height) * BEER_UV.wall)
  const grey = (value: number) => `rgb(${Math.round(value * 255)}, ${Math.round(value * 255)}, ${Math.round(value * 255)})`

  // Glass: empty above the beer, full below it, with a line of foam between
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(138, 74, 18, 0.5)'
  ctx.fillRect(0, row(shape.height), size, size - row(shape.height))
  ctx.fillStyle = 'rgba(88, 40, 9, 0.96)'
  ctx.fillRect(0, row(shape.level), size, size - row(shape.level))
  ctx.fillStyle = 'rgba(176, 124, 58, 0.9)'
  ctx.fillRect(0, row(shape.level + 0.0018), size, row(shape.level) - row(shape.level + 0.0018))
  // The bore of the mouth
  ctx.fillStyle = 'rgb(16, 8, 3)'
  ctx.fillRect(0, 0, size, row(shape.height))

  // Roughness: a mist on the cold glass, thinning toward the neck, with clear beads in it
  const mist = rough.ctx.createLinearGradient(0, row(shape.height), 0, row(shape.level))
  mist.addColorStop(0, grey(0.08))
  mist.addColorStop(1, grey(0.26))
  rough.ctx.fillStyle = mist
  rough.ctx.fillRect(0, 0, size, size)
  rough.ctx.fillStyle = grey(0.04)
  const beads = Math.round(1100 * px * px)
  for (let i = 0; i < beads; i++) {
    const r = (0.5 + rand() * rand() * 2.4) * px
    rough.ctx.beginPath()
    rough.ctx.arc(rand() * size, row(shape.shoulder * 1.15) + rand() * (size - row(shape.shoulder * 1.15)), r, 0, Math.PI * 2)
    rough.ctx.fill()
  }

  // Paper: the band round the neck, and the label on the body
  const paper = '#f2e7c8'
  const ink = '#3b1a08'
  const strip = (from: number, to: number, x: number, width: number) => {
    const top = row(to)
    const height = row(from) - top
    ctx.fillStyle = paper
    ctx.fillRect(x, top, width, height)
    rough.ctx.fillStyle = grey(0.82)
    rough.ctx.fillRect(x, top, width, height)
    // A rule inside the top and bottom edges
    ctx.fillStyle = ink
    ctx.fillRect(x, top + height * 0.07, width, Math.max(1, height * 0.035))
    ctx.fillRect(x, top + height * 0.895, width, Math.max(1, height * 0.035))
    return { top, height }
  }
  strip(shape.neckLabel[0], shape.neckLabel[1], 0, size)
  // The label is centred on u = 0, so it lies across the seam of the picture: half at each side
  const half = (LABEL_WRAP / 2) * size
  strip(shape.label[0], shape.label[1], 0, half)
  const { top, height } = strip(shape.label[0], shape.label[1], size - half, half)

  // Two lines of plain bold capitals. The picture is stretched round the bottle, so the type is drawn wider to come out true.
  const squeeze = shape.height / (2 * Math.PI * shape.radius * BEER_UV.wall)
  const cap = height * 0.22
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.round(cap / 0.72)}px "Helvetica Neue", Helvetica, Arial, sans-serif`
  for (const x of [0, size]) {
    ctx.save()
    ctx.translate(x, top + height * 0.5)
    ctx.scale(squeeze, 1)
    ctx.fillText('MOON', 0, -cap * 0.74)
    ctx.fillText('BREW', 0, cap * 0.74)
    ctx.restore()
  }

  return { map: texture(c, { srgb: true, repeatS: true, anisotropy: 8 }), roughnessMap: texture(rough.c, { repeatS: true, anisotropy: 4 }) }
}

// ------------------------------------------------------- contact shadow ----

/** A soft round blob, dark in the middle: one contact shadow. Stretched and stamped where things touch the ground. */
export function makeShadowBlob() {
  const size = 64
  const { c, ctx } = canvas(size, size)
  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)
      const a = Math.pow(1 - THREE.MathUtils.smoothstep(d, 0, 1), 1.6)
      const o = (y * size + x) * 4
      image.data[o] = image.data[o + 1] = image.data[o + 2] = 255
      image.data[o + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(image, 0, 0)
  const t = texture(c, {})
  t.anisotropy = 1
  return t
}
