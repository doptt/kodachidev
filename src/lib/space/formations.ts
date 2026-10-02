import { DISK } from './camera'
import { mulberry32 } from './sky'

// Particle positions for the three hero shapes. Every particle has a spot in
// each shape and the vertex shader blends between them while you scroll.
// Each shape is shuffled separately, so particles take a random path from
// one shape to the next instead of sliding across.

export type Formations = {
  count: number
  /** Accretion disk, in Schwarzschild radii */
  disk: Float32Array
  /** Orion and its celestial sphere */
  orion: Float32Array
  /** Tunnel as (angle, depth 0-1, radial jitter); the shader makes it 3D */
  tunnel: Float32Array
  /** Brightness in each shape. Anything over 3 is drawn as a flared star. */
  glow: Float32Array
  /** Per particle: stagger, size, colour, spare random number */
  seed: Float32Array
}

type Rand = () => number

const TAU = Math.PI * 2

class Cloud {
  readonly pos: Float32Array
  readonly glow: Float32Array
  private i = 0

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

  share(fraction: number) {
    return Math.max(1, Math.round(this.n * fraction))
  }

  jitter(amount: number) {
    return (this.rand() - 0.5) * amount
  }

  point(x: number, y: number, z: number, glow: number) {
    if (this.full) return
    this.pos.set([x, y, z], this.i * 3)
    this.glow[this.i++] = glow
  }

  /** A few points packed together, which reads as one bright star */
  node(x: number, y: number, z: number, glow: number, count: number) {
    for (let k = 0; k < count; k++) this.point(x + this.jitter(0.012), y + this.jitter(0.012), z, glow)
  }

  shuffle() {
    const { pos, glow, rand } = this
    for (let i = this.n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      for (let k = 0; k < 3; k++) [pos[i * 3 + k], pos[j * 3 + k]] = [pos[j * 3 + k], pos[i * 3 + k]]
      ;[glow[i], glow[j]] = [glow[j], glow[i]]
    }
  }
}

function accretionDisk(c: Cloud) {
  const { rand } = c
  const { inner, outer } = DISK

  // Gas, denser near the hole and bunched into the same lanes the shader draws
  const gas = c.share(0.6)
  for (let k = 0; k < gas; ) {
    const r = inner + (outer - inner) * Math.pow(rand(), 1.7)
    if (rand() > 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(r * 4.3))) continue
    const a = rand() * TAU
    const thickness = (rand() + rand() + rand() - 1.5) * (0.02 + 0.014 * r)
    c.point(Math.cos(a) * r, thickness, Math.sin(a) * r, Math.pow(inner / r, 0.85) * (0.3 + rand() * 0.45))
    k++
  }

  const edge = c.share(0.06)
  for (let k = 0; k < edge; k++) {
    const r = inner * (1 + rand() * 0.12)
    const a = rand() * TAU
    c.point(Math.cos(a) * r, (rand() - 0.5) * 0.04, Math.sin(a) * r, 0.6 + rand() * 0.3)
  }

  // The rest is faint dust well outside the disk
  while (!c.full) {
    const r = outer * (1 + Math.pow(rand(), 0.8) * 1.8)
    const a = rand() * TAU
    c.point(Math.cos(a) * r, (rand() - 0.5) * r * 0.22, Math.sin(a) * r, 0.08 + rand() * 0.22)
  }
}

// Right ascension (hours), declination (degrees), distance (light years), magnitude
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
  // belt
  ['mintaka', 'alnilam'],
  ['alnilam', 'alnitak'],
  // body and head
  ['bellatrix', 'mintaka'],
  ['betelgeuse', 'alnitak'],
  ['mintaka', 'rigel'],
  ['alnitak', 'saiph'],
  ['bellatrix', 'meissa'],
  ['meissa', 'betelgeuse'],
  // club
  ['betelgeuse', 'mu'],
  ['mu', 'xi'],
  ['xi', 'chi2'],
  ['xi', 'nu'],
  ['nu', 'chi1'],
  // shield
  ['bellatrix', 'pi3'],
  ['pi1', 'pi2'],
  ['pi2', 'pi3'],
  ['pi3', 'pi4'],
  ['pi4', 'pi5'],
  ['pi5', 'pi6'],
  // sword
  ['ori42', 'm42'],
  ['m42', 'hatysa'],
]

// x/y are the real sky positions and z is the real distance (log scaled),
// so the figure only lines up when you look at it straight on.
function starPosition(name: string) {
  const [ra, dec, ly] = ORION[name]
  const depth = Math.max(-1.2, Math.min(1.2, -0.5 * Math.log(ly / 700)))
  return [-(ra - 5.55) * 1.425, (dec - 5.3) * 0.095, depth]
}

function orion(c: Cloud) {
  const { rand } = c
  const R = 2.05

  for (const [name, [, , , mag]] of Object.entries(ORION)) {
    const [x, y, z] = starPosition(name)
    c.point(x, y, z, 3.3 + (4.7 - mag) * 0.32)
    c.node(x, y, z, 2.2, 5 + Math.round((4.7 - mag) * 2))
  }

  // Lines stop a little short of each star, like on a star chart
  for (const [from, to] of FIGURE) {
    const a = starPosition(from)
    const b = starPosition(to)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const gap = Math.min(0.3, 0.075 / len)
    const n = Math.round(len * c.n * 0.02)
    for (let k = 0; k < n; k++) {
      const t = gap + rand() * (1 - 2 * gap)
      c.point(
        a[0] + (b[0] - a[0]) * t + c.jitter(0.006),
        a[1] + (b[1] - a[1]) * t + c.jitter(0.006),
        a[2] + (b[2] - a[2]) * t + c.jitter(0.006),
        1.05,
      )
    }
  }

  // Orion Nebula
  const [nx, ny, nz] = starPosition('m42')
  const nebula = c.share(0.014)
  for (let k = 0; k < nebula; k++) {
    const spread = () => (rand() + rand() + rand() - 1.5) * 0.06
    c.point(nx + spread(), ny + spread() * 1.2, nz + spread() * 0.6, 0.3 + rand() * 0.55)
  }

  // Celestial sphere: equator, three meridians and the ecliptic
  const ring = (count: number, glow: number, tilt: number, turn: number) => {
    for (let k = 0; k < count; k++) {
      const a = rand() * TAU
      let [x, y, z] = [Math.cos(a) * R, 0, Math.sin(a) * R]
      ;[y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)]
      ;[x, z] = [x * Math.cos(turn) + z * Math.sin(turn), -x * Math.sin(turn) + z * Math.cos(turn)]
      c.point(x, y, z, glow)
    }
  }
  const ecliptic = 0.409
  ring(c.share(0.045), 0.42, 0, 0)
  for (const turn of [0, Math.PI / 3, (2 * Math.PI) / 3]) ring(c.share(0.022), 0.26, Math.PI / 2, turn)
  ring(c.share(0.036), 0.55, ecliptic, 0.5)

  // Hour marks on the equator
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * TAU
    const major = h % 6 === 0
    for (let k = 0; k < (major ? 14 : 7); k++) {
      const r = R * (1 + rand() * (major ? 0.06 : 0.035))
      c.point(Math.cos(a) * r, 0, Math.sin(a) * r, 0.7)
    }
  }

  // Month marks on the ecliptic
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * TAU
    const x = Math.cos(a) * R
    const z = Math.sin(a) * R
    const [y1, z1] = [-z * Math.sin(ecliptic), z * Math.cos(ecliptic)]
    c.node(x * Math.cos(0.5) + z1 * Math.sin(0.5), y1, -x * Math.sin(0.5) + z1 * Math.cos(0.5), 1.5, 3)
  }

  // Faint background stars, some sitting on the sphere
  while (!c.full) {
    const u = rand() * 2 - 1
    const a = rand() * TAU
    const s = Math.sqrt(1 - u * u)
    const r = rand() < 0.4 ? R * (1 + (rand() - 0.5) * 0.02) : 0.4 + Math.pow(rand(), 0.6) * 5
    const glow = rand() < 0.04 ? 0.5 + rand() * 0.5 : 0.06 + rand() * 0.16
    c.point(Math.cos(a) * s * r, u * r, Math.sin(a) * s * r, glow)
  }
}

function tunnel(n: number, rand: Rand) {
  const params = new Float32Array(n * 3)
  const glow = new Float32Array(n)
  const arms = 7

  for (let i = 0; i < n; i++) {
    const kind = rand()
    let angle = rand() * TAU
    let jitter: number
    if (kind < 0.62) {
      // spiral arms
      angle = (Math.floor(rand() * arms) / arms) * TAU + (rand() - 0.5) * 0.22
      jitter = (rand() - 0.5) * 0.12
      glow[i] = 0.9 + rand() * 0.6
    } else if (kind < 0.92) {
      jitter = (rand() - 0.5) * 0.4
      glow[i] = 0.35 + rand() * 0.35
    } else {
      // loose haze around the outside
      jitter = 0.4 + rand() * 1.6
      glow[i] = 0.18 + rand() * 0.2
    }
    params.set([angle, rand(), jitter], i * 3)
  }
  return { params, glow }
}

export function buildFormations(count: number): Formations {
  const rand = mulberry32(0x6b6f6461)

  const disk = new Cloud(count, rand)
  accretionDisk(disk)
  disk.shuffle()

  const sky = new Cloud(count, rand)
  orion(sky)
  sky.shuffle()

  const warp = tunnel(count, rand)

  const glow = new Float32Array(count * 3)
  const seed = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    glow.set([disk.glow[i], sky.glow[i], warp.glow[i]], i * 3)

    const size = rand() < 0.025 ? 1.9 + rand() * 0.8 : 0.55 + rand() * rand() * 1.1
    seed.set([rand(), size, Math.pow(rand(), 0.8), rand()], i * 4)
  }

  return { count, disk: disk.pos, orion: sky.pos, tunnel: warp.params, glow, seed }
}
