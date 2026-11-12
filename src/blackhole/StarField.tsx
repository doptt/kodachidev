import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'

/** Stars per million CSS pixels: about forty-five on a laptop screen, most of them faint. */
const DENSITY = 34
/** How fast the field drifts, in CSS pixels per second, and which way (up and a little to the left). */
const DRIFT = { speed: 7, x: -0.35, y: -1 }

/** Small deterministic random generator (mulberry32), so the sky is the same every visit. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Star = {
  /** Position as fractions of the box, so a resize moves the stars with it. */
  x: number
  y: number
  size: number
  /** Own share of the drift: nearer stars slide faster, which gives the field depth. */
  pace: number
  /** Twinkle: speed and phase of the slow shimmer. */
  rate: number
  phase: number
  /** Sparkle: seconds between flares, and where in that cycle this star starts. */
  every: number
  offset: number
}

/**
 * A thin scatter of small stars that fills its (positioned) parent.
 *
 * It is ordinary page content, not a fixed backdrop: it scrolls with whatever
 * it sits in. The black hole sequence uses two, one after the other: one in
 * the lower part of the run-in, which scrolls past as the page fades to black,
 * and one in the stage, which comes up behind the black hole and pins with it.
 * Fading and the push outward during the fall are done in CSS (.bh-stars).
 *
 * The stars are alive: the field drifts slowly, every star shimmers at its own
 * pace, and now and then one flares into a small four-pointed glint. It only
 * draws while it is on screen, and holds still under reduced motion.
 */
export function StarField({ seed, className, vars = 'theme dim' }: { seed: number; className?: string; /** Scroll values its CSS uses. */ vars?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const box = root.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!box || !canvas || !ctx) return

    let stars: Star[] = []
    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let visible = false
    let start = 0

    const layout = () => {
      w = box.clientWidth
      h = box.clientHeight
      if (w < 1 || h < 1) return
      // A field can be several screens tall: cap its canvas at about three megapixels
      dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3e6 / (w * h)))
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const next = random(seed)
      stars = Array.from({ length: Math.round((w * h * DENSITY) / 1e6) }, () => ({
        x: next(),
        y: next(),
        size: next(),
        pace: 0.45 + next() * 0.9,
        rate: 0.5 + next() * 1.6,
        phase: next() * Math.PI * 2,
        every: 7 + next() * 16,
        offset: next(),
      }))
      draw(0)
    }

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        // Drift, wrapping round the box
        const travel = t * DRIFT.speed * s.pace
        const x = (((s.x * w + travel * DRIFT.x) % w) + w) % w
        const y = (((s.y * h + travel * DRIFT.y) % h) + h) % h

        // Shimmer: a slow rise and fall, different for every star
        const shimmer = 0.62 + 0.38 * Math.sin(t * s.rate + s.phase)
        // Sparkle: a short flare once per cycle, sharp up and soft down
        const cycle = (t / s.every + s.offset) % 1
        const flare = cycle < 0.07 ? Math.sin((cycle / 0.07) * Math.PI) ** 2 : 0

        const radius = (0.55 + 0.65 * s.size * s.size) * (1 + 0.7 * flare)
        const alpha = Math.min(1, (0.45 + 0.5 * s.size) * shimmer + flare)
        ctx.fillStyle = `rgba(255, 243, 220, ${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()

        if (flare > 0.02) {
          // The glint: two hairlines crossing on the star, fading toward their tips
          const reach = (3 + 5 * s.size) * flare
          const glint = ctx.createRadialGradient(x, y, 0, x, y, reach)
          glint.addColorStop(0, `rgba(255, 243, 220, ${(0.9 * flare).toFixed(3)})`)
          glint.addColorStop(1, 'rgba(255, 243, 220, 0)')
          ctx.strokeStyle = glint
          ctx.lineWidth = 0.7
          ctx.beginPath()
          ctx.moveTo(x - reach, y)
          ctx.lineTo(x + reach, y)
          ctx.moveTo(x, y - reach)
          ctx.lineTo(x, y + reach)
          ctx.stroke()
        }
      }
    }

    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      if (!start) start = now
      draw((now - start) / 1000)
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (!raf && visible && !document.hidden && !reduced) raf = requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting)
      wake()
    })
    io.observe(box)
    const ro = new ResizeObserver(layout)
    ro.observe(box)
    document.addEventListener('visibilitychange', wake)
    layout()

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', wake)
    }
  }, [seed, reduced])

  return (
    // The scroll values are set on the field itself (data-bh-vars), not on whatever section it sits
    // in: a section full of text would have every element restyled on every frame of the scroll
    <div ref={root} aria-hidden="true" data-bh-vars={vars} className={cn('bh-stars', className)}>
      <canvas ref={canvasRef} />
    </div>
  )
}
