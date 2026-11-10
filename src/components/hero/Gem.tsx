import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

type Vec = [number, number, number]

// Icosahedron: 12 vertices, 20 triangular faces
const T = (1 + Math.sqrt(5)) / 2
const VERTS: Vec[] = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
  [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
  [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
]
const FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

const LIGHT = norm([-0.55, 0.8, 0.65])
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1])
const DARK: Vec = [16, 20, 62] // near navy-800
const LIT: Vec = [190, 195, 255] // near periwinkle-200

function rotate([x, y, z]: Vec, ax: number, ay: number): Vec {
  // yaw (around y), then pitch (around x)
  const cy = Math.cos(ay), sy = Math.sin(ay)
  const x1 = x * cy + z * sy
  const z1 = -x * sy + z * cy
  const cx = Math.cos(ax), sx = Math.sin(ax)
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx]
}

/**
 * Slowly turning low-poly gem drawn on a 2D canvas with flat shading in the
 * site's navy/periwinkle palette. Leans toward the pointer. Static under
 * reduced motion; pauses while off screen.
 */
export function Gem({ size = 132, className }: { size?: number; className?: string }) {
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

    const scale = size * 0.27
    const target = { x: 0, y: 0 }
    const tilt = { x: 0, y: 0 }
    let raf = 0
    let visible = true
    const start = performance.now()

    const draw = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000
      tilt.x += (target.x - tilt.x) * 0.06
      tilt.y += (target.y - tilt.y) * 0.06
      const ax = 0.42 + tilt.y * 0.5 + Math.sin(t * 0.4) * 0.08
      const ay = 0.6 + t * 0.32 + tilt.x * 0.6

      const pts = VERTS.map((v) => rotate(v, ax, ay))
      const faces = FACES.map((f) => {
        const [a, b, c] = f.map((i) => pts[i]) as [Vec, Vec, Vec]
        let n = norm(cross(sub(b, a), sub(c, a)))
        const centre: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
        if (dot(n, centre) < 0) n = [-n[0], -n[1], -n[2]]
        return { a, b, c, n, z: centre[2] }
      })
        .filter((f) => f.n[2] > 0)
        .sort((p, q) => p.z - q.z)

      ctx.clearRect(0, 0, size, size)
      const cx = size / 2
      const cy = size / 2
      const project = (p: Vec) => {
        const k = 1 + p[2] * 0.06 // a touch of perspective
        return [cx + p[0] * scale * k, cy - p[1] * scale * k] as const
      }

      for (const f of faces) {
        const diffuse = Math.max(0, dot(f.n, LIGHT))
        const spec = Math.pow(Math.max(0, dot(f.n, HALF)), 28)
        const rim = Math.pow(1 - f.n[2], 2) * 0.35
        const m = Math.min(1, 0.12 + diffuse * 0.78 + rim)
        const col = DARK.map((d, i) => Math.round(d + (LIT[i] - d) * m + spec * 120))
        const [p1, p2, p3] = [project(f.a), project(f.b), project(f.c)]
        ctx.beginPath()
        ctx.moveTo(p1[0], p1[1])
        ctx.lineTo(p2[0], p2[1])
        ctx.lineTo(p3[0], p3[1])
        ctx.closePath()
        ctx.fillStyle = `rgb(${Math.min(255, col[0])} ${Math.min(255, col[1])} ${Math.min(255, col[2])})`
        ctx.fill()
        ctx.lineWidth = 0.75
        ctx.lineJoin = 'round'
        ctx.strokeStyle = `rgb(225 228 255 / ${0.14 + spec * 0.5})`
        ctx.stroke()
      }

      if (!reduced && visible) raf = requestAnimationFrame(draw)
    }

    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2
      target.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    const io = new IntersectionObserver(([entry]) => {
      const was = visible
      visible = entry.isIntersecting
      if (visible && !was && !reduced) raf = requestAnimationFrame(draw)
    })
    io.observe(canvas)
    if (!reduced) window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
    }
  }, [size, reduced])

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }} aria-hidden="true">
      {/* Halo behind the gem */}
      <div
        className="absolute -inset-[60%] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgb(142 150 255 / 0.32), rgb(142 150 255 / 0) 70%)' }}
      />
      <canvas ref={canvasRef} className="relative block size-full" />
    </div>
  )
}
