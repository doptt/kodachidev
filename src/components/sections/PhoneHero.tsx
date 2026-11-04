import { useEffect, useRef } from 'react'
import HeroIntro from './HeroIntro'
import { RIPPLES } from '../../lib/space/blackHole'
import { DISK, diskHit, focalFor, type View } from '../../lib/space/camera'
import { buildFormations } from '../../lib/space/formations'
import { HeroScene, NozzleTrail } from '../../lib/space/heroScene'
import { clamp01, prefersReducedMotion } from '../../lib/space/sky'

// The phone hero: the intro, with the same ray traced black hole as the full
// hero sitting below it. No scroll timeline here, just the hole turning
// slowly, and a tap on the disk sends a ripple through it.
//
// To stay smooth on phones it uses fewer particles and traces the hole at a
// lower resolution, which drops further if frames run slow. Without WebGL
// a CSS sketch of the hole shows instead.

/** Disk radius as a share of the screen width. Over 0.5 lets the faint outer edge bleed off. */
const DISK_WIDTH = 0.72
/** Model units from the hole to the disk's outer edge */
const DISK_RADIUS = DISK.outer * DISK.rs
const CAM = 7
const PITCH = 0.07
/** Where the hole sits down the space under the buttons, 0-1. Keep in step with .phone-hole-sketch. */
const CENTRE = 0.46

export default function PhoneHero() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!section || !stage || !canvas) return

    const reduced = prefersReducedMotion()
    const lowEnd = (navigator.hardwareConcurrency || 8) <= 4
    const count = lowEnd ? 5000 : 8000
    const options = { traceDensity: 1, traceFloor: 0.3 }

    const formations = buildFormations(count)
    let scene = HeroScene.create(canvas, formations, options)
    if (!scene) return
    stage.dataset.live = ''

    let width = 1
    let height = 1
    let dpr = 1
    const view: View = { yaw: 0, pitch: PITCH, roll: 0, cam: CAM, x: 0, y: 0, scale: 1 }

    // Centre the hole in the space under the buttons and size it to the screen
    const measure = () => {
      width = section.clientWidth || window.innerWidth
      height = section.clientHeight || window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)

      const box = stage.getBoundingClientRect()
      const top = box.top - section.getBoundingClientRect().top
      const pxPerUnit = (focalFor(width / height) / CAM) * (height / 2)
      const radius = Math.min(width * DISK_WIDTH, box.height * 0.95)
      view.scale = radius / (DISK_RADIUS * pxPerUnit)
      const cy = top + box.height * CENTRE
      view.y = 1 - (2 * cy) / height

      // The glow is a 100px circle, scaled to sit behind the hole
      const glow = glowRef.current
      if (glow) {
        // kept small enough not to hit the bottom of the section, where it would show a hard edge
        const size = Math.min(radius * 1.1, (height - cy) * 1.35)
        glow.style.transform = `translate3d(${(width / 2 - 50).toFixed(1)}px, ${(cy - 50).toFixed(1)}px, 0) scale(${(size / 50).toFixed(3)})`
      }

      scene?.resize(width, height, dpr)
      if (reduced) draw()
    }

    // Phones can drop the WebGL context in the background
    const onContextLost = (e: Event) => {
      e.preventDefault()
      scene = null
    }
    const onContextRestored = () => {
      scene = HeroScene.create(canvas, formations, options)
      scene?.resize(width, height, dpr)
      if (reduced) draw()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)

    // A tap on the disk sends a ripple out from where it landed
    const ripples = new Float32Array(RIPPLES * 4)
    let nextRipple = 0
    const onPointerDown = (e: PointerEvent) => {
      if (reduced) return
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = 1 - ((e.clientY - rect.top) / rect.height) * 2
      const hit = diskHit(view, width / height, x, y)
      const r = hit ? Math.hypot(hit[0], hit[1]) : 0
      if (!hit || r < DISK.inner * 0.8 || r > DISK.outer * 1.15) return
      ripples.set([hit[0], hit[1], time, 1.6], nextRipple * 4)
      nextRipple = (nextRipple + 1) % RIPPLES
    }
    section.addEventListener('pointerdown', onPointerDown, { passive: true })

    const trail = new NozzleTrail()
    const rocket: [number, number, number, number] = [0, 0, 0, 0]
    const rocketPos: [number, number, number] = [0, 0, 0]
    let time = 0
    let dt = 0
    let introStart = -1

    const draw = (now = performance.now()) => {
      if (introStart < 0) introStart = now
      const intro = reduced ? 1 : clamp01((now - introStart) / 2600)
      // a slow sway, so the disk doesn't sit dead still
      view.yaw = reduced ? 0 : Math.sin(time * 0.12) * 0.07
      scene?.render({
        ...view,
        time,
        dt,
        morph: 0,
        intro,
        rocket,
        rocketPos,
        trail,
        mouseX: 0,
        mouseY: 0,
        mouseForce: 0,
        fade: 1,
        hole: intro,
        ripples,
      })
      if (glowRef.current) glowRef.current.style.opacity = (0.45 * intro).toFixed(3)
    }

    let last = performance.now()
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      dt = Math.min(0.05, (now - last) / 1000)
      last = now
      time += dt
      draw(now)
    }

    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(section)
    resizeObserver.observe(stage)

    // Only animate while the hero is on screen. With reduced motion it's a
    // still picture, redrawn on resize.
    const start = () => {
      if (raf || reduced) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const visibility = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()))
    visibility.observe(section)

    return () => {
      stop()
      visibility.disconnect()
      resizeObserver.disconnect()
      section.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      scene?.dispose()
      delete stage.dataset.live
    }
  }, [])

  return (
    <section id="home" ref={sectionRef} className="relative flex min-h-svh flex-col overflow-hidden pt-28">
      <div ref={glowRef} className="hero-glow" style={{ opacity: 0 }} aria-hidden />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />

      <div className="relative z-10 px-6">
        <HeroIntro />
      </div>

      <div ref={stageRef} className="phone-hole" aria-hidden>
        <div className="phone-hole-sketch" />
      </div>
    </section>
  )
}
