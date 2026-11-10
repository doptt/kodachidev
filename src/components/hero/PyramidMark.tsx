import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

type Vec = [number, number, number]

// Apex is near-white, the base fades into periwinkle blue
const TOP: Vec = [238, 237, 255]
const BOTTOM: Vec = [128, 130, 255]
const TINTS = 8

// Square pyramid in unit space, centred on the spin axis
const APEX_Y = 0.76
const BASE_Y = -0.62
const HALF = 0.7
const APEX: Vec = [0, APEX_Y, 0]
const CORNERS: Vec[] = [
  [-HALF, BASE_Y, -HALF],
  [HALF, BASE_Y, -HALF],
  [HALF, BASE_Y, HALF],
  [-HALF, BASE_Y, HALF],
]
type Particle = {
  target: Vec
  from: Vec
  delay: number
  phase: number
  speed: number
  size: number
  tint: number
  alpha: number
}

const lerp = (a: Vec, b: Vec, t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

function buildParticles(count: number): Particle[] {
  const rand = (a: number, b: number) => a + Math.random() * (b - a)
  // Roughly normal spread so each stroke has a dense core and a soft edge
  const spread = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
  const list: Particle[] = []

  const add = (target: Vec, alpha: number, size: number) => {
    // Start scattered in a loose shell, then gather into the mark
    const theta = rand(0, Math.PI * 2)
    const phi = Math.acos(rand(-1, 1))
    const r = rand(1.6, 2.6)
    const shade = (APEX_Y - target[1]) / (APEX_Y - BASE_Y) + rand(-0.08, 0.08)
    list.push({
      target,
      from: [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)],
      delay: rand(0, 0.55),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.8, 2.4),
      size,
      tint: Math.round(Math.min(1, Math.max(0, shade)) * (TINTS - 1)),
      alpha,
    })
  }

  const stroke = (a: Vec, b: Vec, n: number, width: number, bright: number) => {
    for (let i = 0; i < n; i++) {
      // Run a little past each corner so the joints read as sharp points
      const p = lerp(a, b, rand(-0.015, 1.015))
      const off: Vec = [spread() * width, spread() * width, spread() * width]
      const core = Math.hypot(off[0], off[1], off[2]) < width * 0.45
      add(
        [p[0] + off[0], p[1] + off[1], p[2] + off[2]],
        (core ? rand(0.6, 0.95) : rand(0.2, 0.55)) * bright,
        rand(0.8, 1.9),
      )
    }
  }

  // Eight main edges: four rising to the apex, four around the base
  const edgeN = Math.round((count * 0.72) / 8)
  CORNERS.forEach((c, i) => {
    stroke(c, APEX, Math.round(edgeN * 1.15), 0.05, 1)
    stroke(c, CORNERS[(i + 1) % 4], Math.round(edgeN * 0.85), 0.05, 1)
  })

  // Sparse dust across the four faces so the form reads as solid
  const faceN = Math.round((count * 0.2) / 4)
  CORNERS.forEach((c, i) => {
    const d = CORNERS[(i + 1) % 4]
    for (let k = 0; k < faceN; k++) {
      let u = Math.random()
      let v = Math.random()
      if (u + v > 1) {
        u = 1 - u
        v = 1 - v
      }
      const w = 1 - u - v
      add(
        [
          APEX[0] * w + c[0] * u + d[0] * v,
          APEX[1] * w + c[1] * u + d[1] * v,
          APEX[2] * w + c[2] * u + d[2] * v,
        ],
        rand(0.08, 0.3),
        rand(0.6, 1.3),
      )
    }
  })

  // A brighter knot of light at the apex
  const apexN = Math.round(count * 0.06)
  for (let i = 0; i < apexN; i++) {
    add([spread() * 0.055, APEX_Y + spread() * 0.055, spread() * 0.055], rand(0.5, 0.95), rand(0.9, 2.1))
  }

  return list
}

/** Small soft dots, one per colour step, drawn once and reused every frame. */
function makeSprites(px: number): HTMLCanvasElement[] {
  return Array.from({ length: TINTS }, (_, i) => {
    const k = i / (TINTS - 1)
    const c = TOP.map((v, j) => Math.round(v + (BOTTOM[j] - v) * k))
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = px
    const g = sprite.getContext('2d')!
    const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2)
    grad.addColorStop(0, `rgb(${c[0]} ${c[1]} ${c[2]} / 1)`)
    grad.addColorStop(0.35, `rgb(${c[0]} ${c[1]} ${c[2]} / 0.55)`)
    grad.addColorStop(1, `rgb(${c[0]} ${c[1]} ${c[2]} / 0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, px, px)
    return sprite
  })
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)

/**
 * Glowing pyramid built from a few thousand particles. They gather into the
 * mark on load, then it spins around its vertical axis and leans toward the
 * pointer. It can be dragged to turn it in any direction, coasts when thrown
 * and drifts back upright. Static under reduced motion; pauses while off screen.
 */
export function PyramidMark({ size = 140, className }: { size?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const particles = buildParticles(Math.round(size * 32))
    const sprites = makeSprites(Math.ceil(8 * dpr))
    const radius = size * 0.4
    const assemble = 1.6 // seconds for a particle to fly in
    const target = { x: 0, y: 0 }
    const tilt = { x: 0, y: 0 }
    let raf = 0
    let visible = true
    const start = performance.now()

    // Drag state. `q` is the extra turn the visitor has given the pyramid
    // (quaternion w, x, y, z), applied on top of the resting spin.
    const DRAG = 0.012 // radians per pixel dragged
    let q: [number, number, number, number] = [1, 0, 0, 0]
    const vel = { x: 0, y: 0 } // radians per frame around the screen x / y axes
    let dragging = false
    let last = { x: 0, y: 0 }
    let releasedAt = -Infinity
    let spin = 0
    let spinRate = 1
    let prev = start

    // Turn `q` by `ax` around the screen's x axis and `ay` around its y axis
    const turn = (ax: number, ay: number) => {
      const angle = Math.hypot(ax, ay)
      if (angle < 1e-6) return
      const s = Math.sin(angle / 2) / angle
      const [dw, dx, dy] = [Math.cos(angle / 2), ax * s, ay * s]
      const [w, x, y, z] = q
      // d * q, with d = (dw, dx, dy, 0)
      const n: [number, number, number, number] = [
        dw * w - dx * x - dy * y,
        dw * x + dx * w + dy * z,
        dw * y - dx * z + dy * w,
        dw * z + dx * y - dy * x,
      ]
      const len = Math.hypot(n[0], n[1], n[2], n[3]) || 1
      q = [n[0] / len, n[1] / len, n[2] / len, n[3] / len]
    }

    const draw = (now: number) => {
      const t = reduced ? 10 : (now - start) / 1000
      const dt = Math.min(0.05, (now - prev) / 1000)
      prev = now
      const still = reduced ? 0 : 1
      tilt.x += (target.x - tilt.x) * 0.05
      tilt.y += (target.y - tilt.y) * 0.05

      if (!dragging) {
        // Coast after a throw, then drift back upright once it has settled
        turn(vel.x, vel.y)
        vel.x *= 0.95
        vel.y *= 0.95
        if (now - releasedAt > 1400 && Math.hypot(vel.x, vel.y) < 0.004) {
          const sign = q[0] < 0 ? -1 : 1
          const n = [q[0] + (sign - q[0]) * 0.035, q[1] * 0.965, q[2] * 0.965, q[3] * 0.965]
          const len = Math.hypot(n[0], n[1], n[2], n[3]) || 1
          q = [n[0] / len, n[1] / len, n[2] / len, n[3] / len]
        }
      }
      // The resting spin pauses while held and eases back in afterwards
      spinRate += ((dragging ? 0 : 1) - spinRate) * 0.06
      spin += dt * 0.8 * spinRate

      // One full turn every ~8s; a three-quarter view when motion is reduced
      const yaw = reduced ? 0.6 : spin + tilt.x * 0.5 * spinRate
      // Tipped toward the viewer so the base stays readable
      const pitch = 0.32 + (Math.sin(t * 0.38 + 1) * 0.05 + tilt.y * 0.22 * spinRate) * still
      const cy = Math.cos(yaw), sy = Math.sin(yaw)
      const cp = Math.cos(pitch), sp = Math.sin(pitch)

      // Combined matrix: drag turn * pitch * yaw
      const [qw, qx, qy, qz] = q
      const r00 = 1 - 2 * (qy * qy + qz * qz), r01 = 2 * (qx * qy - qw * qz), r02 = 2 * (qx * qz + qw * qy)
      const r10 = 2 * (qx * qy + qw * qz), r11 = 1 - 2 * (qx * qx + qz * qz), r12 = 2 * (qy * qz - qw * qx)
      const r20 = 2 * (qx * qz - qw * qy), r21 = 2 * (qy * qz + qw * qx), r22 = 1 - 2 * (qx * qx + qy * qy)
      const b00 = cy, b02 = sy
      const b10 = sy * sp, b11 = cp, b12 = -cy * sp
      const b20 = -sy * cp, b21 = sp, b22 = cy * cp
      const m00 = r00 * b00 + r01 * b10 + r02 * b20, m01 = r01 * b11 + r02 * b21, m02 = r00 * b02 + r01 * b12 + r02 * b22
      const m10 = r10 * b00 + r11 * b10 + r12 * b20, m11 = r11 * b11 + r12 * b21, m12 = r10 * b02 + r11 * b12 + r12 * b22
      const m20 = r20 * b00 + r21 * b10 + r22 * b20, m21 = r21 * b11 + r22 * b21, m22 = r20 * b02 + r21 * b12 + r22 * b22

      ctx.clearRect(0, 0, size, size)
      ctx.globalCompositeOperation = 'lighter'
      const mid = size / 2

      for (const p of particles) {
        const k = easeOut(Math.min(1, Math.max(0, (t - p.delay) / assemble)))
        let x = p.from[0] + (p.target[0] - p.from[0]) * k
        let y = p.from[1] + (p.target[1] - p.from[1]) * k
        let z = p.from[2] + (p.target[2] - p.from[2]) * k
        // A faint shimmer once settled
        const drift = 0.01 * still
        x += Math.sin(t * p.speed + p.phase) * drift
        y += Math.cos(t * p.speed * 0.8 + p.phase) * drift

        const rx = m00 * x + m01 * y + m02 * z
        const ry = m10 * x + m11 * y + m12 * z
        z = m20 * x + m21 * y + m22 * z
        x = rx
        y = ry

        const persp = 1 / (1 - z * 0.18)
        const sx = mid + x * radius * persp
        const sy2 = mid - y * radius * persp
        const twinkle = 0.7 + 0.3 * Math.sin(t * p.speed * 2.2 + p.phase * 3) * still
        // Far side dims so the near edges lead as it turns
        const depth = 0.72 + z * 0.38
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha * twinkle * depth * (0.35 + 0.65 * k)))
        const s = p.size * 2.6 * persp
        ctx.drawImage(sprites[p.tint], sx - s / 2, sy2 - s / 2, s, s)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      if (!reduced && visible) raf = requestAnimationFrame(draw)
    }

    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2
      target.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    const io = new IntersectionObserver(([entry]) => {
      const was = visible
      visible = entry.isIntersecting
      if (visible && !was && !reduced) {
        prev = performance.now()
        raf = requestAnimationFrame(draw)
      }
    })
    io.observe(canvas)

    // Grab and turn the pyramid in any direction; a flick keeps it coasting
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      dragging = true
      last = { x: e.clientX, y: e.clientY }
      vel.x = vel.y = 0
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
      e.preventDefault()
    }
    const onDrag = (e: PointerEvent) => {
      if (!dragging) return
      const ax = (e.clientY - last.y) * DRAG
      const ay = (e.clientX - last.x) * DRAG
      last = { x: e.clientX, y: e.clientY }
      turn(ax, ay)
      vel.x = vel.x * 0.5 + ax * 0.5
      vel.y = vel.y * 0.5 + ay * 0.5
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      releasedAt = performance.now()
      canvas.style.cursor = 'grab'
    }

    if (!reduced) {
      window.addEventListener('pointermove', onMove, { passive: true })
      canvas.style.cursor = 'grab'
      canvas.addEventListener('pointerdown', onDown)
      canvas.addEventListener('pointermove', onDrag)
      canvas.addEventListener('pointerup', onUp)
      canvas.addEventListener('pointercancel', onUp)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onDrag)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.style.cursor = ''
    }
  }, [size, reduced])

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }} aria-hidden="true">
      {/* Deep blue glow inside and around the pyramid */}
      <div
        className="absolute -inset-[45%] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgb(94 90 255 / 0.42), rgb(94 90 255 / 0.16) 45%, rgb(94 90 255 / 0) 75%)',
        }}
      />
      <canvas
        ref={canvasRef}
        className="relative block size-full touch-pan-y select-none"
        style={{
          filter:
            'drop-shadow(0 0 3px rgb(216 216 255 / 0.9)) drop-shadow(0 0 9px rgb(134 136 255 / 0.9)) drop-shadow(0 0 22px rgb(104 98 255 / 0.7))',
        }}
      />
    </div>
  )
}
