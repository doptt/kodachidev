import { useEffect, useRef } from 'react'
import { RIPPLES } from '../../lib/space/blackHole'
import { DISK, diskHit, focalFor, type View } from '../../lib/space/camera'
import { buildFormations, type Formations } from '../../lib/space/formations'
import { HeroScene } from '../../lib/space/heroScene'
import { clamp01, lerp, prefersReducedMotion, sky, smooth } from '../../lib/space/sky'

/*
 * The hero is a tall section with a pinned "stage". While you scroll through
 * it, one particle cloud re-forms into a new shape for each chapter:
 *
 *   intro    a black hole, its lensed disk arching up behind the headline
 *   01       the disk tears away and re-forms as Orion, in 3D
 *   02       a website on a laptop and a phone
 *   03       everything pours into a warp tunnel and the camera dives in
 *
 * Scroll position is eased, then mapped through the POSES timeline below.
 * The loop writes straight to the DOM and the canvas, so React never
 * re-renders while scrolling.
 */

type Pose = {
  /** Scroll progress (0..1) this pose belongs to */
  p: number
  /** Formation: 0 black hole disk, 1 constellation, 2 devices, 3 tunnel */
  m: number
  yaw: number
  pitch: number
  roll: number
  cam: number
  x: number
  y: number
  scale: number
  fade: number
  /** Soft CSS glow behind the shape: opacity and size (in model units) */
  glow: number
  glowSize: number
  /** How present the ray-traced black hole is (it fades as the disk leaves) */
  hole: number
  /** x, y, scale used instead on narrow screens */
  compact: [number, number, number]
}

const POSES: Pose[] = [
  { p: 0.0, m: 0, yaw: 0, pitch: 0.02, roll: 0, cam: 7, x: 0, y: -1.06, scale: 1.3, fade: 1, glow: 0.45, glowSize: 2.6, hole: 1, compact: [0, -0.76, 0.85] },
  { p: 0.11, m: 0, yaw: 0.06, pitch: 0.03, roll: 0, cam: 7, x: 0, y: -0.02, scale: 1.12, fade: 1, glow: 0.4, glowSize: 2.8, hole: 1, compact: [0, 0.1, 0.8] },
  { p: 0.24, m: 1, yaw: -0.75, pitch: 0.22, roll: 0, cam: 7.4, x: 0.3, y: 0, scale: 0.95, fade: 1, glow: 0.3, glowSize: 3, hole: 0, compact: [0, 0.3, 0.68] },
  { p: 0.41, m: 1, yaw: -0.05, pitch: 0.04, roll: 0, cam: 7.2, x: 0.3, y: 0, scale: 0.95, fade: 1, glow: 0.3, glowSize: 3, hole: 0, compact: [0, 0.3, 0.68] },
  { p: 0.54, m: 2, yaw: 0.5, pitch: 0.24, roll: 0, cam: 7.4, x: -0.36, y: -0.02, scale: 0.8, fade: 1, glow: 0.4, glowSize: 3.4, hole: 0, compact: [0, 0.3, 0.68] },
  { p: 0.7, m: 2, yaw: 0.14, pitch: 0.16, roll: 0, cam: 7.1, x: -0.36, y: -0.02, scale: 0.8, fade: 1, glow: 0.4, glowSize: 3.4, hole: 0, compact: [0, 0.3, 0.68] },
  { p: 0.82, m: 3, yaw: 0.08, pitch: 0.05, roll: 0, cam: 12, x: 0, y: 0.12, scale: 1, fade: 1, glow: 0.7, glowSize: 1.2, hole: 0, compact: [0, 0.22, 0.8] },
  { p: 0.9, m: 3, yaw: 0.08, pitch: 0.05, roll: 0.2, cam: 6.5, x: 0, y: 0.12, scale: 1, fade: 1, glow: 0.9, glowSize: 1.1, hole: 0, compact: [0, 0.22, 0.8] },
  { p: 1.0, m: 3, yaw: 0, pitch: 0, roll: 0.7, cam: 0.6, x: 0, y: 0, scale: 1, fade: 0, glow: 0, glowSize: 1, hole: 0, compact: [0, 0, 1] },
]

type Chapter = {
  label: string
  title: string
  accent: string
  body: string
  /** Where the text sits on wide screens (the shape takes the other side) */
  side: 'left' | 'right' | 'center'
  /** Fade in from..to, fade out from..to, in scroll progress */
  show: [number, number, number, number]
  cta?: boolean
}

const CHAPTERS: Chapter[] = [
  {
    label: 'Design',
    title: 'Every detail,',
    accent: 'placed with intent.',
    body: 'Layouts shaped around your brand and your customers, polished down to the last pixel while navigation stays simple.',
    side: 'left',
    show: [0.2, 0.26, 0.41, 0.46],
  },
  {
    label: 'Every screen',
    title: 'One website,',
    accent: 'every screen.',
    body: 'From wide desktop monitors to the phone in your pocket, your site adapts without losing a thing.',
    side: 'right',
    show: [0.5, 0.56, 0.69, 0.74],
  },
  {
    label: 'Launch',
    title: 'Launched, and',
    accent: 'kept in orbit.',
    body: 'Hosting, domains and deployment handled for you, with security and uptime built in from day one.',
    side: 'center',
    show: [0.8, 0.85, 0.95, 0.99],
    cta: true,
  },
]

// Progress rail: where each stop scrolls to, and where it becomes active
const STOPS = [
  { label: 'Intro', at: 0, from: 0 },
  { label: 'Design', at: 0.33, from: 0.17 },
  { label: 'Every screen', at: 0.62, from: 0.47 },
  { label: 'Launch', at: 0.9, from: 0.76 },
]

// Phones: every chapter sits at the bottom, full width. Wider screens: each
// side sets its own anchors, so no two classes fight over the same property.
const SIDE_CLASSES: Record<Chapter['side'], string> = {
  left: 'md:top-1/2 md:bottom-auto md:right-auto md:left-[max(2rem,calc(50%-36rem))] md:w-[min(27rem,40vw)] md:-translate-y-1/2 md:text-left',
  right:
    'md:top-1/2 md:bottom-auto md:left-auto md:right-[max(2rem,calc(50%-36rem))] md:w-[min(27rem,40vw)] md:-translate-y-1/2 md:text-left lg:right-[max(8rem,calc(50%-36rem))]',
  center: 'md:bottom-[7vh] md:left-1/2 md:right-auto md:w-[min(36rem,80vw)] md:-translate-x-1/2 md:text-center',
}

/** Interpolates the pose timeline at scroll progress p */
function poseAt(p: number, compact: boolean) {
  let i = 0
  while (i < POSES.length - 2 && p > POSES[i + 1].p) i++
  const a = POSES[i]
  const b = POSES[i + 1]
  const t = smooth(clamp01((p - a.p) / (b.p - a.p)))
  const mix = (k: Exclude<keyof Pose, 'compact'>) => lerp(a[k], b[k], t)
  return {
    m: mix('m'),
    yaw: mix('yaw'),
    pitch: mix('pitch'),
    roll: mix('roll'),
    cam: mix('cam'),
    x: compact ? lerp(a.compact[0], b.compact[0], t) : mix('x'),
    y: compact ? lerp(a.compact[1], b.compact[1], t) : mix('y'),
    scale: compact ? lerp(a.compact[2], b.compact[2], t) : mix('scale'),
    fade: mix('fade'),
    glow: mix('glow'),
    glowSize: mix('glowSize'),
    hole: mix('hole'),
  }
}

/** 0 -> 1 -> 0 over [in start, in end, out start, out end] */
function band(p: number, [a, b, c, d]: [number, number, number, number]) {
  if (p <= a || p >= d) return 0
  if (p < b) return smooth((p - a) / (b - a))
  if (p <= c) return 1
  return 1 - smooth((p - c) / (d - c))
}

/** Applies opacity + slide to an overlay, hiding it fully when faded out */
function setLayer(el: HTMLElement | null, visible: number, shift: number) {
  if (!el) return
  const hidden = visible < 0.01
  el.style.opacity = hidden ? '0' : visible.toFixed(3)
  el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`
  el.style.visibility = hidden ? 'hidden' : 'visible'
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const introRef = useRef<HTMLDivElement>(null)
  const chapterRefs = useRef<(HTMLElement | null)[]>([])
  const railRef = useRef<HTMLOListElement>(null)
  // Set by the effect, used by the rail buttons
  const scrollToRef = useRef<(p: number) => void>(() => {})

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!section || !stage || !canvas) return

    const reduced = prefersReducedMotion()
    const wide = stage.clientWidth
    const cores = navigator.hardwareConcurrency || 8
    const count = Math.round((wide >= 1100 ? 22000 : wide >= 700 ? 15000 : 10000) * (cores <= 4 ? 0.65 : 1))

    let formations: Formations | null = buildFormations(count)
    let scene = HeroScene.create(canvas, formations)

    let width = 1
    let height = 1
    let dpr = 1
    let compact = false
    let top = 0
    let range = 1

    const measure = () => {
      width = stage.clientWidth || window.innerWidth
      height = stage.clientHeight || window.innerHeight
      compact = width < 900 || width / height < 1.05
      dpr = Math.min(window.devicePixelRatio || 1, width < 768 ? 1.75 : 2)
      top = section.getBoundingClientRect().top + window.scrollY
      range = Math.max(1, section.offsetHeight - height)
      scene?.resize(width, height, dpr)
    }
    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(stage)
    resizeObserver.observe(section)

    scrollToRef.current = (p) => {
      window.scrollTo({ top: top + p * range, behavior: reduced ? 'auto' : 'smooth' })
    }

    // If the GPU drops the context (tab in background on mobile, driver
    // reset), wait for it to come back and rebuild.
    const onLost = (e: Event) => {
      e.preventDefault()
      scene = null
    }
    const onRestored = () => {
      formations ??= buildFormations(count)
      scene = HeroScene.create(canvas, formations)
      scene?.resize(width, height, dpr)
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    // Cursor, in clip space. Mouse only; touch would just jitter the scene.
    let mouseX = 0
    let mouseY = 0
    let lastMove = -Infinity
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      mouseX = (e.clientX / width) * 2 - 1
      mouseY = 1 - (e.clientY / height) * 2
      lastMove = performance.now()
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    // Ripples through the disk: a stream of small ones while the cursor moves
    // over it, a big one on click. Stored in disk space for the shaders.
    const ripples = new Float32Array(RIPPLES * 4)
    let slot = 0
    let lastRipple: [number, number] | null = null
    let lastRippleAt = -Infinity
    let clicked = false
    const addRipple = (x: number, z: number, strength: number) => {
      ripples.set([x, z, time, strength], slot * 4)
      slot = (slot + 1) % RIPPLES
      lastRipple = [x, z]
      lastRippleAt = time
    }
    const onDown = (e: PointerEvent) => {
      onPointer(e)
      clicked = true
    }
    window.addEventListener('pointerdown', onDown, { passive: true })

    const progressNow = () => clamp01((window.scrollY - top) / range)

    let p = progressNow()
    let time = 0
    let flow = 0
    let force = 0
    let tiltX = 0
    let tiltY = 0
    let introStart = -1
    let activeStop = -1
    let last = performance.now()
    let raf = 0

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const ease = (rate: number) => 1 - Math.exp(-dt * rate)

      // Eased scroll progress: smooth even with a notchy mouse wheel
      const target = progressNow()
      p += (target - p) * ease(6)
      if (Math.abs(target - p) < 0.00005) p = target

      const pose = poseAt(p, compact)
      if (introStart < 0) introStart = now
      const intro = reduced ? 1 : clamp01((now - introStart) / 2600)

      // The dive at the end speeds the tunnel up and streaks the sky
      const warp = reduced ? 0 : smooth(clamp01((p - 0.86) / 0.08)) * (1 - smooth(clamp01((p - 0.96) / 0.04)) * 0.7)
      sky.warp = warp
      if (!reduced) {
        time += dt
        flow += dt * (0.022 + warp * 0.5)
      }

      const moving = !reduced && now - lastMove < 1400
      force += ((moving ? 1 : 0) - force) * ease(moving ? 4 : 1.5)
      tiltX += ((reduced ? 0 : mouseX) - tiltX) * ease(2.5)
      tiltY += ((reduced ? 0 : mouseY) - tiltY) * ease(2.5)

      const view: View = {
        yaw: pose.yaw + tiltX * 0.14,
        pitch: pose.pitch - tiltY * 0.08,
        roll: pose.roll,
        cam: reduced ? Math.max(pose.cam, 5) : pose.cam,
        x: pose.x,
        y: pose.y,
        scale: pose.scale,
      }

      if (!reduced && pose.hole > 0.3 && (moving || clicked)) {
        const hit = diskHit(view, width / height, mouseX, mouseY)
        const r = hit ? Math.hypot(hit[0], hit[1]) : 0
        if (hit && r > DISK.inner * 0.8 && r < DISK.outer * 1.15) {
          const moved = lastRipple ? Math.hypot(hit[0] - lastRipple[0], hit[1] - lastRipple[1]) : Infinity
          if (clicked) addRipple(hit[0], hit[1], 1.6)
          else if (moved > 1.4 || (moved > 0.3 && time - lastRippleAt > 0.3)) addRipple(hit[0], hit[1], Math.min(1, 0.35 + moved * 0.1))
        }
      }
      clicked = false

      scene?.render({
        ...view,
        time,
        dt,
        morph: pose.m,
        intro,
        flow,
        mouseX,
        mouseY,
        // The gravity well is for the particle shapes; the disk gets ripples
        mouseForce: force * (1 - pose.hole) * (1 - smooth(clamp01((p - 0.8) / 0.08))),
        fade: pose.fade,
        hole: pose.hole * intro,
        ripples,
      })

      // Soft bloom that follows the shape around (a 100px circle, moved and
      // scaled into place)
      const glow = glowRef.current
      if (glow) {
        const unit = ((focalFor(width / height) * pose.scale) / pose.cam) * (height / 2)
        const cx = ((pose.x + 1) / 2) * width - 50
        const cy = ((1 - pose.y) / 2) * height - 50
        glow.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) scale(${(Math.max(1, unit * pose.glowSize * 2) / 100).toFixed(3)})`
        glow.style.opacity = (pose.glow * intro).toFixed(3)
      }

      // Text layers
      const introShow = band(p, [-1, 0, 0.025, 0.09])
      setLayer(introRef.current, introShow, -p * 260)
      CHAPTERS.forEach((chapter, i) => {
        const v = band(p, chapter.show)
        const mid = (chapter.show[1] + chapter.show[2]) / 2
        setLayer(chapterRefs.current[i], v, (1 - v) * (p < mid ? 36 : -36))
      })

      let stop = 0
      while (stop < STOPS.length - 1 && p >= STOPS[stop + 1].from) stop++
      if (stop !== activeStop && railRef.current) {
        activeStop = stop
        Array.from(railRef.current.children).forEach((li, i) => {
          li.toggleAttribute('data-active', i === stop)
          li.querySelector('button')?.setAttribute('aria-current', i === stop ? 'step' : 'false')
        })
      }
    }

    // Only animate while the hero is on screen
    const start = () => {
      if (raf) return
      last = performance.now()
      p = progressNow()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
      sky.warp = 0
    }
    const visibility = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()))
    visibility.observe(section)

    return () => {
      stop()
      visibility.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      scene?.dispose()
      formations = null
    }
  }, [])

  return (
    <section id="home" ref={sectionRef} className="relative h-[400vh]">
      <div ref={stageRef} className="sticky top-0 h-svh w-full overflow-hidden">
        <div ref={glowRef} className="hero-glow" style={{ opacity: 0 }} aria-hidden />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />

        {/* Intro: the first thing anyone sees */}
        <div ref={introRef} className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 pt-[100px] pb-28">
          <div className="hero-scrim relative mx-auto flex w-full max-w-5xl flex-col items-center text-center">
            <div className="mb-8 inline-flex animate-fade-up items-center gap-2.5 rounded-full border border-accent/20 bg-accent/8 px-4 py-2 backdrop-blur-md">
              <span className="h-2 w-2 shrink-0 animate-status rounded-full bg-accent" />
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-lavender">Available for Work</span>
            </div>

            <h1 className="max-w-[780px] animate-fade-up font-display text-[clamp(2.4rem,6vw,5rem)] leading-[1.08] font-light tracking-[-0.03em] delay-100">
              Modern websites built to <span className="text-gradient">grow your business.</span>
            </h1>

            <p className="mt-6 max-w-xl animate-fade-up text-base leading-[1.7] text-muted delay-200 sm:text-lg">
              I build fast, responsive websites that turn visitors into customers.
            </p>

            <div className="mt-8 flex animate-fade-up flex-col items-center gap-3 delay-300 sm:flex-row">
              <a href="#contact" className="btn-primary rounded-xl px-7 py-3.5 text-sm">
                Contact me
              </a>
              <a href="#work" className="btn-ghost rounded-xl px-7 py-3.5 text-sm backdrop-blur-md">
                Explore My Work
                <ArrowIcon />
              </a>
            </div>

            <p className="mt-6 animate-fade-up font-mono text-xs tracking-wide text-muted delay-400">
              Projects starting at: <span className="text-lavender">$125</span>
            </p>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 animate-fade-up flex-col items-center gap-2 delay-700" aria-hidden>
            <span className="font-mono text-xs tracking-[0.1em] text-muted/60">SCROLL</span>
            <div className="relative h-10 w-px overflow-hidden bg-accent/15">
              <div className="animate-scroll-hint absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(to_bottom,var(--color-accent),transparent)]" />
            </div>
          </div>
        </div>

        {/* Chapters */}
        {CHAPTERS.map((chapter, i) => (
          <article
            key={chapter.label}
            ref={(el) => {
              chapterRefs.current[i] = el
            }}
            className={`hero-chapter absolute inset-x-0 bottom-0 z-10 px-6 pt-28 pb-[max(3rem,env(safe-area-inset-bottom))] text-center md:p-0 ${SIDE_CLASSES[chapter.side]}`}
            style={{ opacity: 0, visibility: 'hidden' }}
          >
            <span className="eyebrow">
              {String(i + 1).padStart(2, '0')} / {chapter.label}
            </span>
            <h2 className="section-title text-[clamp(2.1rem,4.4vw,3.4rem)]">
              {chapter.title} <span className="text-gradient">{chapter.accent}</span>
            </h2>
            <p className={`mt-5 text-base leading-[1.7] text-muted ${chapter.side === 'center' ? 'mx-auto max-w-md' : 'mx-auto max-w-md md:mx-0'}`}>
              {chapter.body}
            </p>
            {chapter.cta && (
              <a href="#contact" className="btn-primary mt-8 rounded-xl px-7 py-3.5 text-sm">
                Start a project
                <ArrowIcon />
              </a>
            )}
          </article>
        ))}

        {/* Progress rail */}
        <nav aria-label="Hero chapters" className="absolute top-1/2 right-6 z-20 hidden -translate-y-1/2 lg:block">
          <ol ref={railRef} className="hero-rail flex flex-col gap-4">
            {STOPS.map((stop) => (
              <li key={stop.label}>
                <button type="button" onClick={() => scrollToRef.current(stop.at)}>
                  <span className="hero-rail-label">{stop.label}</span>
                  <span className="hero-rail-dot" />
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </section>
  )
}
