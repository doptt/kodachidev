import { mulberry32, sky } from './sky'

/*
 * The fixed background sky, drawn on a 2D canvas:
 *
 *   - a faint nebula band, rendered once into a small offscreen canvas
 *   - three depths of stars that twinkle, parallax on scroll and mouse,
 *     smear slightly when you scroll fast, and streak outward when the
 *     hero dives into its warp tunnel (`sky.warp`)
 *   - meteors and comets on curved paths, at random intervals, shedding
 *     little sparks as they go
 *
 * Star glows are pre-rendered sprites, so each star is a single drawImage.
 */

type Star = {
  x: number
  y: number
  layer: number
  size: number
  color: number
  base: number
  amp: number
  speed: number
  phase: number
  spike: boolean
}

type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number }

type Flyer = {
  kind: 'meteor' | 'comet'
  x0: number
  y0: number
  cx: number
  cy: number
  x1: number
  y1: number
  age: number
  duration: number
  /** Tail length, as a fraction of the path */
  tail: number
  width: number
  sparkDebt: number
}

const COLORS = ['#F5F2FF', '#F5F2FF', '#F5F2FF', '#DCE8FF', '#C6A9FF', '#FFEFD6']

const LAYERS = [
  { area: 3800, min: 150, size: [0.5, 1.15], alpha: [0.22, 0.62], parallax: 0.012, spike: 0, depth: 0.25 },
  { area: 14000, min: 50, size: [0.9, 1.7], alpha: [0.4, 0.85], parallax: 0.03, spike: 0.06, depth: 0.55 },
  { area: 52000, min: 14, size: [1.4, 2.5], alpha: [0.6, 1], parallax: 0.06, spike: 0.4, depth: 1 },
] as const

const TAU = Math.PI * 2
const mod = (v: number, m: number) => ((v % m) + m) % m

function sprite(color: string, spikes: boolean) {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  if (spikes) {
    // Thin diffraction cross for the brightest stars
    for (const [w, h] of [[s, 1.6], [1.6, s]]) {
      const grad = w > h ? g.createLinearGradient(0, 0, s, 0) : g.createLinearGradient(0, 0, 0, s)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(0.5, color)
      grad.addColorStop(1, 'transparent')
      g.fillStyle = grad
      g.fillRect((s - w) / 2, (s - h) / 2, w, h)
    }
    return c
  }
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.08, color)
  grad.addColorStop(0.22, `${color}55`)
  grad.addColorStop(0.5, `${color}12`)
  grad.addColorStop(1, `${color}00`)
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  return c
}

export class SkyRenderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly glows = COLORS.map((c) => sprite(c, false))
  private readonly spikes = COLORS.map((c) => sprite(c, true))
  private readonly rand = Math.random
  private stars: Star[] = []
  private nebula: HTMLCanvasElement | null = null
  private flyers: Flyer[] = []
  private sparks: Spark[] = []
  private nextFlyer = 1.4
  private time = 0
  private warp = 0
  private w = 1
  private h = 1
  private dpr = 1

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  resize(width: number, height: number, dpr: number) {
    this.w = Math.max(1, width)
    this.h = Math.max(1, height)
    this.dpr = dpr
    this.canvas.width = Math.round(this.w * dpr)
    this.canvas.height = Math.round(this.h * dpr)
    this.makeStars()
    this.nebula = this.makeNebula()
  }

  private makeStars() {
    const r = mulberry32(7)
    const { w, h } = this
    const stars: Star[] = []
    // The milky-way band runs corner to corner; a third of the far stars
    // crowd around it
    const band = (x: number) => h * (0.92 - (0.78 * x) / w)

    LAYERS.forEach((layer, li) => {
      const count = Math.max(layer.min, Math.round((w * h) / layer.area))
      for (let i = 0; i < count; i++) {
        const x = r() * w
        const inBand = li === 0 && r() < 0.35
        const y = inBand ? band(x) + (r() + r() + r() - 1.5) * h * 0.11 : r() * h
        const bright = r()
        stars.push({
          x,
          y: mod(y, h),
          layer: li,
          size: layer.size[0] + Math.pow(bright, 2) * (layer.size[1] - layer.size[0]),
          color: Math.floor(r() * COLORS.length),
          base: layer.alpha[0] + bright * (layer.alpha[1] - layer.alpha[0]),
          amp: 0.15 + r() * 0.35,
          speed: 0.5 + r() * 1.8,
          phase: r() * TAU,
          spike: r() < layer.spike,
        })
      }
    })
    this.stars = stars
  }

  /** Soft clouds, drawn once at low resolution. Tiles seamlessly in y. */
  private makeNebula() {
    const scale = 0.33
    const cw = Math.max(1, Math.round(this.w * scale))
    const ch = Math.max(1, Math.round(this.h * scale))
    const c = document.createElement('canvas')
    c.width = cw
    c.height = ch
    const g = c.getContext('2d')!
    g.globalCompositeOperation = 'lighter'
    const r = mulberry32(21)

    const blob = (x: number, y: number, radius: number, rgb: string, alpha: number) => {
      for (const dy of [-ch, 0, ch]) {
        const grad = g.createRadialGradient(x, y + dy, 0, x, y + dy, radius)
        grad.addColorStop(0, `rgb(${rgb} / ${alpha})`)
        grad.addColorStop(0.5, `rgb(${rgb} / ${alpha * 0.4})`)
        grad.addColorStop(1, `rgb(${rgb} / 0)`)
        g.fillStyle = grad
        g.fillRect(x - radius, y + dy - radius, radius * 2, radius * 2)
      }
    }

    // Band
    for (let i = 0; i < 26; i++) {
      const t = i / 25
      const x = (t * 1.2 - 0.1) * cw
      const y = ch * (0.92 - 0.78 * (t * 1.2 - 0.1)) + (r() - 0.5) * ch * 0.12
      const tone = r() < 0.5 ? '117 71 255' : '86 96 230'
      blob(x, y, ch * (0.14 + r() * 0.16), tone, 0.022 + r() * 0.03)
    }
    // A few larger clouds of colour
    blob(cw * 0.82, ch * 0.18, ch * 0.5, '198 169 255', 0.03)
    blob(cw * 0.1, ch * 0.62, ch * 0.55, '117 71 255', 0.045)
    blob(cw * 0.55, ch * 0.9, ch * 0.45, '170 90 255', 0.025)
    return c
  }

  private spawn() {
    const { w, h, rand } = this
    const meteor = rand() < 0.68
    const ltr = rand() < 0.5
    let x0: number, y0: number, x1: number, y1: number, duration: number

    if (meteor) {
      // Short, fast and steep, starting somewhere in the upper sky
      x0 = w * (0.1 + rand() * 0.8)
      y0 = h * (rand() * 0.45)
      const angle = 0.35 + rand() * 0.5 // below the horizon, in radians
      const len = Math.hypot(w, h) * (0.22 + rand() * 0.2)
      x1 = x0 + Math.cos(angle) * len * (ltr ? 1 : -1)
      y1 = y0 + Math.sin(angle) * len
      duration = 0.7 + rand() * 0.6
    } else {
      // Long, slow arc from one edge to the other
      x0 = ltr ? -w * 0.08 : w * 1.08
      x1 = ltr ? w * 1.08 : -w * 0.08
      y0 = h * (0.05 + rand() * 0.4)
      y1 = y0 + h * (0.12 + rand() * 0.3)
      duration = 7 + rand() * 4
    }

    // Bend the path a little so nothing moves on rails
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    const len = Math.hypot(x1 - x0, y1 - y0)
    const bend = (rand() - 0.3) * (meteor ? 0.06 : 0.18) * len
    const nx = -(y1 - y0) / len
    const ny = (x1 - x0) / len

    this.flyers.push({
      kind: meteor ? 'meteor' : 'comet',
      x0,
      y0,
      cx: mx + nx * bend,
      cy: my + ny * bend,
      x1,
      y1,
      age: 0,
      duration,
      tail: meteor ? 0.32 + rand() * 0.15 : 0.16 + rand() * 0.06,
      width: meteor ? 1.4 + rand() * 0.8 : 2.4 + rand() * 0.9,
      sparkDebt: 0,
    })
  }

  private at(f: Flyer, u: number): [number, number] {
    const v = 1 - u
    return [v * v * f.x0 + 2 * v * u * f.cx + u * u * f.x1, v * v * f.y0 + 2 * v * u * f.cy + u * u * f.y1]
  }

  /**
   * Draws one frame. `scroll` is window.scrollY, `velocity` its eased rate
   * in px/s, and `mx`/`my` the eased cursor position in -1..1.
   */
  frame(dt: number, scroll: number, velocity: number, mx: number, my: number, animate: boolean) {
    const { ctx, w, h } = this
    if (animate) this.time += dt
    const t = this.time
    // Eased, so streaks wind down smoothly when the hero stops driving them
    this.warp += ((animate ? sky.warp : 0) - this.warp) * (1 - Math.exp(-dt * 5))
    const warp = this.warp < 0.002 ? 0 : this.warp

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, w, h)

    if (this.nebula) {
      const ny = mod(-scroll * LAYERS[0].parallax, h)
      ctx.globalAlpha = 1 - warp * 0.4
      ctx.drawImage(this.nebula, 0, ny - h, w, h + 1)
      ctx.drawImage(this.nebula, 0, ny, w, h + 1)
    }

    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    const cx = w / 2
    const cy = h / 2
    const reach = Math.hypot(cx, cy)
    const smear = Math.max(-40, Math.min(40, velocity * 0.012))

    for (const s of this.stars) {
      const layer = LAYERS[s.layer]
      const x = mod(s.x + mx * layer.depth * 14, w)
      const y = mod(s.y - scroll * layer.parallax + my * layer.depth * 10, h)
      const twinkle = animate ? Math.sin(t * s.speed + s.phase) * 0.5 + Math.sin(t * s.speed * 2.7 + s.phase * 1.3) * 0.2 : 0
      const alpha = Math.max(0.05, Math.min(1, s.base * (1 + s.amp * twinkle)))
      const color = COLORS[s.color]

      // Motion streaks: outward during the warp dive, vertical while scrolling fast
      const dx = x - cx
      const dy = y - cy
      const dist = Math.hypot(dx, dy) || 1
      const radial = warp * layer.depth * (dist / reach) * 260
      const vertical = smear * layer.depth
      if (radial > 1.5 || Math.abs(vertical) > 1.5) {
        ctx.globalAlpha = alpha * (radial > 1.5 ? 0.35 + warp * 0.5 : 0.45)
        ctx.strokeStyle = color
        ctx.lineWidth = s.size * 0.9
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (dx / dist) * radial, y + (dy / dist) * radial + vertical)
        ctx.stroke()
      }

      const r = s.size * 4.2
      ctx.globalAlpha = alpha
      ctx.drawImage(this.glows[s.color], x - r, y - r, r * 2, r * 2)
      if (s.spike) {
        const k = s.size * 7 * (0.85 + twinkle * 0.25)
        ctx.globalAlpha = alpha * 0.55
        ctx.drawImage(this.spikes[s.color], x - k, y - k, k * 2, k * 2)
      }
    }

    if (animate) this.drawFlyers(dt)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawFlyers(dt: number) {
    const { ctx, rand } = this

    this.nextFlyer -= dt
    if (this.nextFlyer <= 0 && this.warp < 0.05) {
      if (this.flyers.length < 2) this.spawn()
      this.nextFlyer = 2.8 + rand() * 5.5
    }

    for (const f of this.flyers) {
      f.age += dt
      const raw = Math.min(1, f.age / f.duration)
      // Meteors speed up as they burn in; comets glide
      const u = f.kind === 'meteor' ? raw * (0.55 + 0.45 * raw) : raw
      const [hx, hy] = this.at(f, u)
      const envelope = f.kind === 'meteor' ? Math.pow(Math.sin(Math.PI * raw), 0.7) : Math.min(1, raw / 0.06, (1 - raw) / 0.06)
      if (envelope <= 0) continue

      // Tapered tail following the curve back
      const steps = 20
      const back = f.tail * (f.kind === 'meteor' ? Math.min(1, raw * 3) : 1)
      let [px, py] = [hx, hy]
      for (let i = 1; i <= steps; i++) {
        const k = i / steps
        const [tx, ty] = this.at(f, Math.max(0, u - back * k))
        ctx.globalAlpha = envelope * Math.pow(1 - k, 1.6) * (f.kind === 'meteor' ? 0.9 : 0.7)
        ctx.strokeStyle = k < 0.25 ? '#F5F2FF' : k < 0.6 ? '#C6A9FF' : '#9B6DFF'
        ctx.lineWidth = f.width * (1 - k * 0.85)
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        px = tx
        py = ty
      }

      // Comets also get a faint, straight blue ion tail
      const [bx, by] = this.at(f, Math.max(0, u - 0.01))
      const vx = hx - bx
      const vy = hy - by
      const vl = Math.hypot(vx, vy) || 1
      if (f.kind === 'comet') {
        const len = Math.hypot(f.x1 - f.x0, f.y1 - f.y0) * f.tail * 1.25
        const a = Math.atan2(-vy, -vx) - 0.12
        const ex = hx + Math.cos(a) * len
        const ey = hy + Math.sin(a) * len
        const grad = ctx.createLinearGradient(hx, hy, ex, ey)
        grad.addColorStop(0, 'rgb(190 215 255 / 0.45)')
        grad.addColorStop(1, 'rgb(120 150 255 / 0)')
        ctx.globalAlpha = envelope
        ctx.strokeStyle = grad
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }

      // Sparks shed from the head
      f.sparkDebt += dt * (f.kind === 'meteor' ? 45 : 30)
      while (f.sparkDebt >= 1) {
        f.sparkDebt -= 1
        const speed = 8 + rand() * 30
        const side = (rand() - 0.5) * 24
        this.sparks.push({
          x: hx,
          y: hy,
          vx: (-vx / vl) * speed + (-vy / vl) * side,
          vy: (-vy / vl) * speed + (vx / vl) * side,
          age: 0,
          life: f.kind === 'meteor' ? 0.3 + rand() * 0.4 : 1 + rand() * 1.2,
          size: 0.5 + rand() * 0.9,
        })
      }

      // Head: wide coma, then a bright core
      const coma = f.width * (f.kind === 'comet' ? 9 : 5)
      ctx.globalAlpha = envelope * 0.55
      ctx.drawImage(this.glows[4], hx - coma, hy - coma, coma * 2, coma * 2)
      const core = f.width * 3.2
      ctx.globalAlpha = envelope
      ctx.drawImage(this.glows[0], hx - core, hy - core, core * 2, core * 2)
    }
    this.flyers = this.flyers.filter((f) => f.age < f.duration)

    for (const s of this.sparks) {
      s.age += dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      const left = 1 - s.age / s.life
      if (left <= 0) continue
      const r = s.size * 2.5
      ctx.globalAlpha = left * 0.8
      ctx.drawImage(this.glows[s.size > 1 ? 4 : 0], s.x - r, s.y - r, r * 2, r * 2)
    }
    this.sparks = this.sparks.filter((s) => s.age < s.life)
  }
}
