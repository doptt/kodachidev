import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../../lib/space/sky'
import { SkyRenderer } from '../../lib/space/skyRenderer'

/*
 * Fixed background sky behind every page. The drawing lives in
 * SkyRenderer; this component sizes the canvas, feeds it scroll and cursor
 * input, and runs the animation loop.
 *
 * With reduced motion on, the sky is drawn once (and again on resize):
 * no twinkle, no parallax, no comets.
 */
export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const sky = new SkyRenderer(canvas)
    const reduced = prefersReducedMotion()

    // The canvas is sized to the *largest* viewport (lvh), so a phone's
    // address bar sliding in and out doesn't resize it and reshuffle stars
    let size = ''
    const resize = () => {
      const width = canvas.clientWidth || window.innerWidth
      const height = canvas.clientHeight || window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, width < 768 ? 1.5 : 2)
      const next = `${width}x${height}@${dpr}`
      if (next === size) return
      size = next
      sky.resize(width, height, dpr)
      if (reduced) sky.frame(0, 0, 0, 0, 0, false)
    }
    resize()
    window.addEventListener('resize', resize, { passive: true })
    if (reduced) return () => window.removeEventListener('resize', resize)

    let targetX = 0
    let targetY = 0
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      targetX = (e.clientX / window.innerWidth) * 2 - 1
      targetY = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    let raf = 0
    let last = performance.now()
    let lastScroll = Math.max(0, window.scrollY)
    let velocity = 0
    let mx = 0
    let my = 0

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const ease = (rate: number) => 1 - Math.exp(-dt * rate)

      const scroll = Math.max(0, window.scrollY) // ignore iOS overscroll bounce
      if (dt > 0) velocity += ((scroll - lastScroll) / dt - velocity) * ease(8)
      lastScroll = scroll
      mx += (targetX - mx) * ease(2)
      my += (targetY - my) * ease(2)

      sky.frame(dt, scroll, velocity, mx, my, true)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh w-full" aria-hidden />
}
