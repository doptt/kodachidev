import { mulberry32 } from './sky'

/*
 * Point clouds for the hero scene. Every particle has one position in each
 * formation, and the vertex shader blends between them as you scroll:
 *
 *   A  planet    a ringed gas giant with a small moon
 *   B  design    an exploded, layered website, drawn like a constellation
 *   C  devices   the same site reflowed onto a laptop and a phone
 *   D  launch    a warp tunnel (stored as angle / depth / jitter; the
 *                shader turns it into xyz so it can flow)
 *
 * Each formation is shuffled on its own, so a particle's spot in one shape
 * has nothing to do with its spot in the next. That's what makes the
 * transitions dissolve and re-form instead of sliding.
 */

export type Formations = {
  count: number
  a: Float32Array
  b: Float32Array
  c: Float32Array
  d: Float32Array
  /** Brightness in A, B, C, D. Negative in A means "lit by the sun". */
  glow: Float32Array
  /** Per particle: stagger, size, color tone, spare random */
  seed: Float32Array
}

type Rand = () => number
type Xf = (x: number, y: number, z: number) => [number, number, number]

const TAU = Math.PI * 2
const identity: Xf = (x, y, z) => [x, y, z]

/** Collects points for one formation, with simple 2D/3D drawing helpers */
class Cloud {
  readonly pos: Float32Array
  readonly glow: Float32Array
  private i = 0
  xf: Xf = identity

  constructor(
    readonly n: number,
    readonly rand: Rand,
  ) {
    this.pos = new Float32Array(n * 3)
    this.glow = new Float32Array(n)
  }

  get full() {
    return this.i >= this.n
  }

  /** Number of particles for a share of the total */
  share(fraction: number) {
    return Math.max(1, Math.round(this.n * fraction))
  }

  point(x: number, y: number, z: number, b: number) {
    if (this.full) return
    const [px, py, pz] = this.xf(x, y, z)
    this.pos[this.i * 3] = px
    this.pos[this.i * 3 + 1] = py
    this.pos[this.i * 3 + 2] = pz
    this.glow[this.i] = b
    this.i++
  }

  jitter(amount: number) {
    return (this.rand() - 0.5) * amount
  }

  line(x0: number, y0: number, x1: number, y1: number, z: number, count: number, b: number, j = 0.006) {
    for (let k = 0; k < count; k++) {
      const t = this.rand()
      this.point(x0 + (x1 - x0) * t + this.jitter(j), y0 + (y1 - y0) * t + this.jitter(j), z + this.jitter(j), b)
    }
  }

  /** Rounded rectangle outline centred on (cx, cy) */
  rect(cx: number, cy: number, z: number, w: number, h: number, r: number, count: number, b: number) {
    const sx = w - 2 * r
    const sy = h - 2 * r
    const arc = (Math.PI / 2) * r
    const total = 2 * sx + 2 * sy + 4 * arc
    for (let k = 0; k < count; k++) {
      let s = this.rand() * total
      let x = 0
      let y = 0
      // Walk the perimeter: top, right, bottom, left, then the four corners
      if ((s -= sx) < 0) [x, y] = [-sx / 2 + s + sx, h / 2]
      else if ((s -= sy) < 0) [x, y] = [w / 2, -sy / 2 + s + sy]
      else if ((s -= sx) < 0) [x, y] = [-sx / 2 + s + sx, -h / 2]
      else if ((s -= sy) < 0) [x, y] = [-w / 2, -sy / 2 + s + sy]
      else {
        const corner = Math.floor(this.rand() * 4)
        const a = (corner + this.rand()) * (Math.PI / 2)
        x = Math.sign(Math.cos(a)) * (sx / 2) + Math.cos(a) * r
        y = Math.sign(Math.sin(a)) * (sy / 2) + Math.sin(a) * r
      }
      this.point(cx + x + this.jitter(0.008), cy + y + this.jitter(0.008), z + this.jitter(0.01), b)
    }
  }

  fill(cx: number, cy: number, z: number, w: number, h: number, count: number, b: number) {
    for (let k = 0; k < count; k++) {
      this.point(cx + this.jitter(w), cy + this.jitter(h), z + this.jitter(0.02), b * (0.6 + this.rand() * 0.8))
    }
  }

  circle(cx: number, cy: number, z: number, r: number, count: number, b: number) {
    for (let k = 0; k < count; k++) {
      const a = this.rand() * TAU
      this.point(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z + this.jitter(0.01), b)
    }
  }

  disc(cx: number, cy: number, z: number, r: number, count: number, b: number) {
    for (let k = 0; k < count; k++) {
      const a = this.rand() * TAU
      const d = Math.sqrt(this.rand()) * r
      this.point(cx + Math.cos(a) * d, cy + Math.sin(a) * d, z, b)
    }
  }

  /** A line of "text": a few word-shaped bars with small gaps */
  text(x: number, y: number, z: number, w: number, thick: number, count: number, b: number) {
    const words: [number, number][] = []
    let cursor = 0
    while (cursor < w) {
      const len = Math.min(w - cursor, w * (0.14 + this.rand() * 0.22))
      words.push([cursor, len])
      cursor += len + thick * 0.9 + w * 0.02
    }
    const inked = words.reduce((sum, [, len]) => sum + len, 0)
    for (let k = 0; k < count; k++) {
      let s = this.rand() * inked
      for (const [start, len] of words) {
        if (s <= len) {
          this.point(x + start + s, y + this.jitter(thick), z + this.jitter(0.01), b)
          break
        }
        s -= len
      }
    }
  }

  /** A few tightly packed particles: reads as one bright star */
  node(x: number, y: number, z: number, b = 2.6, count = 5) {
    for (let k = 0; k < count; k++) this.point(x + this.jitter(0.012), y + this.jitter(0.012), z, b)
  }

  /** Brackets every corner of a rect with a node */
  corners(cx: number, cy: number, z: number, w: number, h: number, b = 2.6) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.node(cx + (sx * w) / 2, cy + (sy * h) / 2, z, b)
  }

  /** Anything left over becomes faint dust around the shape */
  dust(radius: [number, number], flatten: number, b: [number, number]) {
    this.xf = identity
    while (!this.full) {
      const u = this.rand() * 2 - 1
      const a = this.rand() * TAU
      const s = Math.sqrt(1 - u * u)
      const r = radius[0] + Math.pow(this.rand(), 0.7) * (radius[1] - radius[0])
      this.point(Math.cos(a) * s * r, u * r * flatten, Math.sin(a) * s * r, b[0] + this.rand() * (b[1] - b[0]))
    }
  }

  /** Fisher-Yates over whole points, so each formation is ordered randomly */
  shuffle(stride: number, data = this.pos) {
    const tmp = new Float32Array(stride)
    for (let i = this.n - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1))
      tmp.set(data.subarray(i * stride, i * stride + stride))
      data.copyWithin(i * stride, j * stride, j * stride + stride)
      data.set(tmp, j * stride)
      const g = this.glow[i]
      this.glow[i] = this.glow[j]
      this.glow[j] = g
    }
  }
}

/* -------------------------------------------------------------------------- */

function planet(c: Cloud) {
  const { rand } = c

  // Gas giant body. Particles crowd into latitude bands, so the stripes
  // show even at low density. Negative glow = lit by the sun.
  const body = c.share(0.3)
  for (let k = 0; k < body; ) {
    const y = rand() * 2 - 1
    const lat = Math.asin(y)
    const band = 0.5 + 0.5 * Math.sin(lat * 11 + Math.sin(lat * 4) * 1.8)
    if (rand() > 0.25 + band * 0.75) continue
    const a = rand() * TAU
    const s = Math.sqrt(1 - y * y)
    const r = 1 + (rand() - 0.5) * 0.02
    c.point(Math.cos(a) * s * r, y * r, Math.sin(a) * s * r, -(0.45 + band * (0.8 + rand() * 0.6)))
    k++
  }

  // A storm, so the spin is visible
  const storm = c.share(0.008)
  for (let k = 0; k < storm; k++) {
    const lat = -0.38 + (rand() - 0.5) * 0.12
    const lon = 0.9 + (rand() - 0.5) * 0.34
    c.point(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon), -1.9)
  }

  // Thin atmosphere hugging the surface
  const air = c.share(0.06)
  for (let k = 0; k < air; k++) {
    const y = rand() * 2 - 1
    const a = rand() * TAU
    const s = Math.sqrt(1 - y * y)
    const r = 1.012 + rand() * rand() * 0.09
    c.point(Math.cos(a) * s * r, y * r, Math.sin(a) * s * r, -0.6)
  }

  // Rings, with a few gaps carved out of them
  const density = (r: number) => {
    if (r < 1.62) return 0.22
    if (r < 2.0) return 1
    if (r < 2.08) return 0.04 // the big gap
    if (r < 2.36) return Math.abs(r - 2.27) < 0.012 ? 0.05 : 0.72
    if (r < 2.43) return 0.06
    if (r < 2.47) return 0.6 // narrow outer ring
    return 0
  }
  const ring = c.share(0.46)
  for (let k = 0; k < ring; ) {
    const r = 1.38 + rand() * 1.1
    const d = density(r)
    if (rand() > d) continue
    const a = rand() * TAU
    const thick = (rand() + rand() - 1) * 0.012
    c.point(Math.cos(a) * r, thick, Math.sin(a) * r, 0.35 + d * 1.05 + rand() * 0.25)
    k++
  }

  // Small moon
  const moon = c.share(0.016)
  for (let k = 0; k < moon; k++) {
    const y = rand() * 2 - 1
    const a = rand() * TAU
    const s = Math.sqrt(1 - y * y)
    c.point(2.95 + Math.cos(a) * s * 0.11, 0.06 + y * 0.11, 0.9 + Math.sin(a) * s * 0.11, -1.2)
  }

  c.dust([2.8, 7.5], 0.3, [0.12, 0.36])
}

/* -------------------------------------------------------------------------- */

function design(c: Cloud) {
  const W = 3.6
  const H = 2.3
  const back = -0.45
  const mid = 0
  const front = 0.45
  const s = (f: number) => c.share(f * 1.2)

  // Back layer: the browser window itself
  c.rect(0, 0, back, W, H, 0.14, s(0.07), 1.1)
  c.line(-W / 2, H / 2 - 0.26, W / 2, H / 2 - 0.26, back, s(0.014), 0.75)
  for (const dx of [0.2, 0.33, 0.46]) c.disc(-W / 2 + dx, H / 2 - 0.13, back, 0.035, s(0.003), 1.7)
  c.rect(0.25, H / 2 - 0.13, back, 1.5, 0.1, 0.05, s(0.012), 0.55)
  c.fill(0, -0.13, back, W - 0.1, H - 0.36, s(0.05), 0.16)
  c.corners(0, 0, back, W, H)

  // Middle layer: nav, headline, buttons and a hero image
  c.fill(-1.45, 0.74, mid, 0.34, 0.08, s(0.006), 1.3)
  for (let k = 0; k < 4; k++) c.text(0.3 + k * 0.32, 0.74, mid, 0.2, 0.02, s(0.004), 0.75)
  c.text(-1.62, 0.38, mid, 1.75, 0.09, s(0.05), 1.3)
  c.text(-1.62, 0.17, mid, 1.2, 0.09, s(0.035), 1.3)
  c.text(-1.62, -0.05, mid, 1.5, 0.024, s(0.012), 0.6)
  c.text(-1.62, -0.15, mid, 1.05, 0.024, s(0.01), 0.6)
  c.rect(-1.3, -0.44, mid, 0.62, 0.17, 0.085, s(0.015), 1.6)
  c.fill(-1.3, -0.44, mid, 0.5, 0.1, s(0.01), 0.9)
  c.rect(-0.56, -0.44, mid, 0.56, 0.17, 0.085, s(0.011), 0.75)
  c.node(-1.61, -0.44, mid)
  c.node(-0.99, -0.44, mid)

  c.rect(0.95, 0.14, mid, 1.2, 0.95, 0.08, s(0.03), 1.0)
  c.corners(0.95, 0.14, mid, 1.2, 0.95, 2.2)
  const ridge: [number, number][] = [[0.42, -0.24], [0.72, 0.12], [0.92, -0.06], [1.2, 0.28], [1.48, -0.24]]
  for (let k = 0; k < ridge.length - 1; k++) {
    const [x0, y0] = ridge[k]
    const [x1, y1] = ridge[k + 1]
    c.line(x0, y0, x1, y1, mid, s(0.004), 1.15)
  }
  c.circle(1.22, 0.4, mid, 0.075, s(0.004), 1.5)
  c.disc(1.22, 0.4, mid, 0.05, s(0.003), 1.2)

  // Front layer: three cards
  for (const x of [-1.15, 0, 1.15]) {
    const y = -0.8
    c.rect(x, y, front, 1.0, 0.42, 0.06, s(0.018), 1.0)
    c.fill(x, y, front, 0.94, 0.36, s(0.006), 0.22)
    c.circle(x - 0.36, y + 0.08, front, 0.055, s(0.003), 1.4)
    c.text(x - 0.24, y + 0.09, front, 0.5, 0.02, s(0.004), 0.75)
    c.text(x - 0.4, y - 0.08, front, 0.76, 0.016, s(0.004), 0.5)
    c.corners(x, y, front, 1.0, 0.42, 2.2)
  }

  // Exploded-view guides tying the layers together
  for (const [x, y] of [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]]) {
    const n = s(0.004)
    for (let k = 0; k < n; k++) c.point(x, y, back + c.rand() * (front - back) * 1.4, 0.32)
  }

  c.dust([2.6, 6], 0.55, [0.08, 0.26])
}

/* -------------------------------------------------------------------------- */

function devices(c: Cloud) {
  const s = (f: number) => c.share(f * 1.15)

  // Laptop. Screen coords start at the hinge (y = 0) and go up.
  const W = 2.6
  const H = 1.62
  const D = 1.7
  const hx = -0.78
  const hy = -0.55
  const hz = -0.2
  const tilt = 0.24
  c.xf = (x, y, z) => [hx + x, hy + y * Math.cos(tilt) - z * Math.sin(tilt), hz - y * Math.sin(tilt) + z * Math.cos(tilt)]

  c.rect(0, H / 2, 0, W, H, 0.08, s(0.05), 1.15)
  c.rect(0, H / 2 + 0.02, 0.01, W - 0.16, H - 0.2, 0.03, s(0.025), 0.55)
  c.fill(0, H / 2 + 0.02, 0.01, W - 0.2, H - 0.24, s(0.035), 0.14)
  c.node(0, H - 0.05, 0, 1.6, 3)
  c.corners(0, H / 2, 0, W, H)
  // Desktop layout on the screen
  c.fill(-0.98, H - 0.26, 0.02, 0.22, 0.05, s(0.003), 1.2)
  for (let k = 0; k < 4; k++) c.text(0.25 + k * 0.24, H - 0.26, 0.02, 0.14, 0.015, s(0.002), 0.7)
  c.text(-1.08, H - 0.52, 0.02, 1.15, 0.065, s(0.026), 1.25)
  c.text(-1.08, H - 0.67, 0.02, 0.8, 0.065, s(0.018), 1.25)
  c.text(-1.08, H - 0.82, 0.02, 0.95, 0.016, s(0.006), 0.55)
  c.rect(-0.85, H - 1.0, 0.02, 0.44, 0.12, 0.06, s(0.008), 1.5)
  c.rect(0.62, H - 0.62, 0.02, 0.82, 0.58, 0.05, s(0.016), 0.95)
  for (const x of [-0.78, 0, 0.78]) c.rect(x, 0.36, 0.02, 0.68, 0.3, 0.04, s(0.01), 0.85)

  // Laptop deck, lying flat in front of the hinge
  c.xf = (x, y, z) => [hx + x, hy + z, hz + y]
  c.rect(0, D / 2, 0, W + 0.12, D, 0.09, s(0.045), 0.95)
  c.fill(0, D / 2, 0, W, D - 0.1, s(0.025), 0.12)
  c.corners(0, D / 2, 0, W + 0.12, D)
  const cols = 13
  const rows = 5
  const per = Math.max(2, Math.round(s(0.034) / (cols * rows)))
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = -1.08 + (k / (cols - 1)) * 2.16
      const y = 0.22 + r * 0.15
      for (let p = 0; p < per; p++) c.point(x + c.jitter(0.07), y + c.jitter(0.06), 0, 0.75)
    }
  }
  c.rect(0, 1.3, 0, 0.9, 0.48, 0.05, s(0.012), 0.7)

  // Phone, turned toward the laptop. Same content, reflowed into one column.
  const px = 1.68
  const py = -0.1
  const pz = 0.95
  const yaw = -0.38
  c.xf = (x, y, z) => [px + x * Math.cos(yaw) + z * Math.sin(yaw), py + y, pz - x * Math.sin(yaw) + z * Math.cos(yaw)]

  c.rect(0, 0, 0, 0.8, 1.62, 0.13, s(0.035), 1.2)
  c.rect(0, 0, 0.01, 0.7, 1.5, 0.09, s(0.014), 0.5)
  c.fill(0, 0, 0.01, 0.66, 1.46, s(0.012), 0.14)
  c.fill(0, 0.71, 0.02, 0.18, 0.035, s(0.002), 1.4)
  c.corners(0, 0, 0, 0.8, 1.62)
  c.fill(-0.22, 0.56, 0.02, 0.14, 0.04, s(0.002), 1.2)
  for (let k = 0; k < 3; k++) c.line(0.17, 0.585 - k * 0.03, 0.27, 0.585 - k * 0.03, 0.02, s(0.0008), 0.9, 0.002)
  c.text(-0.27, 0.38, 0.02, 0.52, 0.05, s(0.01), 1.25)
  c.text(-0.27, 0.27, 0.02, 0.4, 0.05, s(0.008), 1.25)
  c.rect(0, -0.04, 0.02, 0.56, 0.34, 0.04, s(0.01), 0.95)
  c.rect(0, -0.36, 0.02, 0.48, 0.1, 0.05, s(0.006), 1.5)
  c.rect(0, -0.58, 0.02, 0.56, 0.16, 0.03, s(0.006), 0.8)

  c.dust([2.8, 6.2], 0.5, [0.08, 0.26])
}

/* -------------------------------------------------------------------------- */

// The tunnel is stored as (angle, depth 0..1, radial jitter) and shaped in
// the shader, so it can flow toward the camera forever.
function tunnel(n: number, rand: Rand) {
  const params = new Float32Array(n * 3)
  const glow = new Float32Array(n)
  const arms = 7
  for (let i = 0; i < n; i++) {
    const kind = rand()
    let angle: number
    let jitter: number
    let b: number
    if (kind < 0.62) {
      // Helical arms
      angle = (Math.floor(rand() * arms) / arms) * TAU + (rand() - 0.5) * 0.22
      jitter = (rand() - 0.5) * 0.12
      b = 0.9 + rand() * 0.6
    } else if (kind < 0.92) {
      angle = rand() * TAU
      jitter = (rand() - 0.5) * 0.4
      b = 0.35 + rand() * 0.35
    } else {
      // Loose outer haze
      angle = rand() * TAU
      jitter = 0.4 + rand() * 1.6
      b = 0.18 + rand() * 0.2
    }
    params[i * 3] = angle
    params[i * 3 + 1] = rand()
    params[i * 3 + 2] = jitter
    glow[i] = b
  }
  return { params, glow }
}

/* -------------------------------------------------------------------------- */

export function buildFormations(count: number): Formations {
  const rand = mulberry32(0x6b6f6461) // "koda"

  const shapes = [planet, design, devices].map((draw) => {
    const cloud = new Cloud(count, rand)
    draw(cloud)
    cloud.shuffle(3)
    return cloud
  })
  const warp = tunnel(count, rand)

  const glow = new Float32Array(count * 4)
  const seed = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    glow[i * 4] = shapes[0].glow[i]
    glow[i * 4 + 1] = shapes[1].glow[i]
    glow[i * 4 + 2] = shapes[2].glow[i]
    glow[i * 4 + 3] = warp.glow[i]

    const big = rand() < 0.025
    seed[i * 4] = rand() // stagger
    seed[i * 4 + 1] = big ? 1.9 + rand() * 0.8 : 0.55 + rand() * rand() * 1.1 // size
    seed[i * 4 + 2] = Math.pow(rand(), 0.8) // tone: violet -> lavender
    seed[i * 4 + 3] = rand()
  }

  return { count, a: shapes[0].pos, b: shapes[1].pos, c: shapes[2].pos, d: warp.params, glow, seed }
}
