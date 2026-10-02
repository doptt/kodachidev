import { DISK } from './camera'
import { mulberry32 } from './sky'

/*
 * Point clouds for the hero scene. Every particle has one position in each
 * formation, and the vertex shader blends between them as you scroll:
 *
 *   A  disk      the black hole's accretion disk (in Schwarzschild radii)
 *   B  orion     the Orion constellation in 3D, inside a celestial sphere
 *   C  devices   a website on a laptop and a phone
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
  /** Brightness in A, B, C, D. Over 3 = a star drawn with diffraction spikes. */
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

// A: the accretion disk around the black hole, in Schwarzschild radii (the
// ray tracer draws the smooth gas; these points add glitter on top, and are
// what flies off when you scroll). Glow falls off outward like the gas does.
function accretionDisk(c: Cloud) {
  const { rand } = c
  const { inner, outer } = DISK

  const gas = c.share(0.6)
  for (let k = 0; k < gas; ) {
    const r = inner + (outer - inner) * Math.pow(rand(), 1.7)
    // Crowd into the same kind of lanes the shader draws
    if (rand() > 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(r * 4.3))) continue
    const a = rand() * TAU
    const thick = (rand() + rand() + rand() - 1.5) * (0.02 + 0.014 * r)
    c.point(Math.cos(a) * r, thick, Math.sin(a) * r, Math.pow(inner / r, 0.85) * (0.3 + rand() * 0.45))
    k++
  }

  // Bright inner edge
  const edge = c.share(0.06)
  for (let k = 0; k < edge; k++) {
    const r = inner * (1 + rand() * 0.12)
    const a = rand() * TAU
    c.point(Math.cos(a) * r, (rand() - 0.5) * 0.04, Math.sin(a) * r, 0.6 + rand() * 0.3)
  }

  // Everything else: a wide, faint haze of dust well outside the disk
  while (!c.full) {
    const r = outer * (1 + Math.pow(rand(), 0.8) * 1.8)
    const a = rand() * TAU
    c.point(Math.cos(a) * r, (rand() - 0.5) * r * 0.22, Math.sin(a) * r, 0.08 + rand() * 0.22)
  }
}

/* -------------------------------------------------------------------------- */

// B: Orion, in 3D. x/y come from each star's real sky position and z from
// its real distance (log-compressed), so the figure only lines up when you
// look at it head-on and drifts apart in depth as it turns.
//            right ascension (h), declination (°), distance (ly), magnitude
const ORION: Record<string, [number, number, number, number]> = {
  betelgeuse: [5.919, 7.41, 548, 0.5],
  rigel: [5.242, -8.2, 860, 0.13],
  bellatrix: [5.419, 6.35, 250, 1.64],
  mintaka: [5.533, -0.3, 1200, 2.23],
  alnilam: [5.603, -1.2, 2000, 1.69],
  alnitak: [5.679, -1.94, 1260, 1.77],
  saiph: [5.796, -9.67, 650, 2.06],
  meissa: [5.585, 9.93, 1100, 3.33],
  hatysa: [5.59, -5.91, 1300, 2.77],
  m42: [5.588, -5.39, 1344, 4.0],
  ori42: [5.59, -4.84, 1300, 4.6],
  pi1: [4.915, 10.15, 116, 4.65],
  pi2: [4.843, 8.9, 194, 4.35],
  pi3: [4.83, 6.96, 26, 3.19],
  pi4: [4.853, 5.6, 1000, 3.68],
  pi5: [4.904, 2.44, 1340, 3.71],
  pi6: [4.976, 1.71, 950, 4.47],
  mu: [6.04, 9.65, 155, 4.12],
  nu: [6.126, 14.77, 520, 4.42],
  xi: [6.199, 14.21, 630, 4.48],
  chi1: [5.907, 20.28, 28, 4.39],
  chi2: [6.065, 20.14, 4900, 4.63],
}

const FIGURE: [string, string][] = [
  ['mintaka', 'alnilam'], ['alnilam', 'alnitak'], // belt
  ['bellatrix', 'mintaka'], ['betelgeuse', 'alnitak'], ['mintaka', 'rigel'], ['alnitak', 'saiph'],
  ['bellatrix', 'meissa'], ['meissa', 'betelgeuse'],
  ['betelgeuse', 'mu'], ['mu', 'xi'], ['xi', 'chi2'], ['xi', 'nu'], ['nu', 'chi1'], // raised club
  ['bellatrix', 'pi3'], ['pi1', 'pi2'], ['pi2', 'pi3'], ['pi3', 'pi4'], ['pi4', 'pi5'], ['pi5', 'pi6'], // shield
  ['ori42', 'm42'], ['m42', 'hatysa'], // sword
]

function constellation(c: Cloud) {
  const { rand } = c
  const R = 2.05

  const at = (name: string) => {
    const [ra, dec, ly] = ORION[name]
    return [-(ra - 5.55) * 1.5 * 0.95, (dec - 5.3) * 0.1 * 0.95, Math.max(-1.2, Math.min(1.2, -0.5 * Math.log(ly / 700)))]
  }

  // Stars: one big flared point (glow over 3 = drawn with spikes) in a
  // tight cluster of bright ones
  for (const [name, [, , , mag]] of Object.entries(ORION)) {
    const [x, y, z] = at(name)
    c.point(x, y, z, 3.3 + (4.7 - mag) * 0.32)
    c.node(x, y, z, 2.2, 5 + Math.round((4.7 - mag) * 2))
  }

  // Constellation lines, stopping short of each star like a star chart
  for (const [from, to] of FIGURE) {
    const a = at(from)
    const b = at(to)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const gap = Math.min(0.3, 0.075 / len)
    const n = Math.round(len * c.n * 0.02)
    for (let k = 0; k < n; k++) {
      const t = gap + rand() * (1 - 2 * gap)
      c.point(a[0] + (b[0] - a[0]) * t + c.jitter(0.006), a[1] + (b[1] - a[1]) * t + c.jitter(0.006), a[2] + (b[2] - a[2]) * t + c.jitter(0.006), 1.05)
    }
  }

  // The Orion Nebula, a soft glow in the sword
  const [nx, ny, nz] = at('m42')
  const neb = c.share(0.014)
  for (let k = 0; k < neb; k++) {
    const g = () => (rand() + rand() + rand() - 1.5) * 0.06
    c.point(nx + g(), ny + g() * 1.2, nz + g() * 0.6, 0.3 + rand() * 0.55)
  }

  // Celestial sphere around it: equator, meridians and a tilted ecliptic
  const ring = (count: number, b: number, tilt: number, turn: number) => {
    for (let k = 0; k < count; k++) {
      const a = rand() * TAU
      let [x, y, z] = [Math.cos(a) * R, 0, Math.sin(a) * R]
      ;[y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)]
      ;[x, z] = [x * Math.cos(turn) + z * Math.sin(turn), -x * Math.sin(turn) + z * Math.cos(turn)]
      c.point(x, y, z, b)
    }
  }
  ring(c.share(0.045), 0.42, 0, 0)
  for (const turn of [0, Math.PI / 3, (2 * Math.PI) / 3]) ring(c.share(0.022), 0.26, Math.PI / 2, turn)
  ring(c.share(0.036), 0.55, 0.409, 0.5)

  // Hour ticks on the equator, and brighter marks along the ecliptic
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * TAU
    const n = h % 6 === 0 ? 14 : 7
    for (let k = 0; k < n; k++) {
      const r = R * (1 + rand() * (h % 6 === 0 ? 0.06 : 0.035))
      c.point(Math.cos(a) * r, 0, Math.sin(a) * r, 0.7)
    }
  }
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * TAU
    const [x0, y0, z0] = [Math.cos(a) * R, 0, Math.sin(a) * R]
    const [y1, z1] = [y0 * Math.cos(0.409) - z0 * Math.sin(0.409), y0 * Math.sin(0.409) + z0 * Math.cos(0.409)]
    c.node(x0 * Math.cos(0.5) + z1 * Math.sin(0.5), y1, -x0 * Math.sin(0.5) + z1 * Math.cos(0.5), 1.5, 3)
  }

  // Leftovers: faint background stars, some on the globe's surface
  while (!c.full) {
    const u = rand() * 2 - 1
    const a = rand() * TAU
    const s = Math.sqrt(1 - u * u)
    const onSphere = rand() < 0.4
    const r = onSphere ? R * (1 + (rand() - 0.5) * 0.02) : 0.4 + Math.pow(rand(), 0.6) * 5
    const bright = rand() < 0.04 ? 0.5 + rand() * 0.5 : 0.06 + rand() * 0.16
    c.point(Math.cos(a) * s * r, u * r, Math.sin(a) * s * r, bright)
  }
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

  const shapes = [accretionDisk, constellation, devices].map((draw) => {
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
