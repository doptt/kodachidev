import { useEffect, useRef } from 'react'
import HeroIntro, { ArrowIcon } from './HeroIntro'
import { RIPPLES } from '../../lib/space/blackHole'
import { DISK, diskHit, focalFor, type View } from '../../lib/space/camera'
import { buildFormations, type Formations } from '../../lib/space/formations'
import { HeroScene } from '../../lib/space/heroScene'
import { clamp01, lerp, prefersReducedMotion, sky, smooth } from '../../lib/space/sky'

// The full hero for desktops and tablets: a tall section with a sticky stage. Scrolling moves
// through a timeline of camera poses: the black hole rises behind the
// headline, moves aside for the first chapter, breaks apart into Orion,
// then everything pours into a tunnel and the camera dives in.
//
// The animation loop writes straight to the canvas and the DOM, so React
// doesn't re-render while you scroll.

type Pose = {
  /** Scroll progress (0-1) this pose sits at */
  p: number
  /** Shape: 0 black hole, 1 Orion, 2 tunnel */
  shape: number
  yaw: number
  pitch: number
  roll: number
  cam: number
  x: number
  y: number
  scale: number
  fade: number
  /** Opacity and size of the CSS glow behind the shape */
  glow: number
  glowSize: number
  hole: number
  /** x, y and scale on portrait screens (tablets) */
  mobile: [number, number, number]
}

const POSES: Pose[] = [
  { p: 0, shape: 0, yaw: 0, pitch: 0.02, roll: 0, cam: 7, x: 0, y: -0.83, scale: 1.3, fade: 1, glow: 0.45, glowSize: 2.6, hole: 1, mobile: [0, -0.62, 1.25] },
  { p: 0.12, shape: 0, yaw: 0.06, pitch: 0.03, roll: 0, cam: 7, x: 0.4, y: -0.02, scale: 0.95, fade: 1, glow: 0.4, glowSize: 2.8, hole: 1, mobile: [0, 0.22, 1.1] },
  { p: 0.27, shape: 0, yaw: -0.08, pitch: 0.06, roll: 0, cam: 6.6, x: 0.4, y: -0.02, scale: 0.95, fade: 1, glow: 0.4, glowSize: 2.8, hole: 1, mobile: [0, 0.22, 1.1] },
  { p: 0.39, shape: 1, yaw: -0.75, pitch: 0.22, roll: 0, cam: 7.4, x: 0.3, y: 0, scale: 0.95, fade: 1, glow: 0.3, glowSize: 3, hole: 0, mobile: [0, 0.28, 0.9] },
  { p: 0.56, shape: 1, yaw: -0.05, pitch: 0.04, roll: 0, cam: 7.2, x: 0.3, y: 0, scale: 0.95, fade: 1, glow: 0.3, glowSize: 3, hole: 0, mobile: [0, 0.28, 0.9] },
  { p: 0.7, shape: 2, yaw: 0.08, pitch: 0.05, roll: 0, cam: 12, x: 0, y: 0.12, scale: 1, fade: 1, glow: 0.7, glowSize: 1.2, hole: 0, mobile: [0, 0.2, 0.95] },
  { p: 0.84, shape: 2, yaw: 0.08, pitch: 0.05, roll: 0.2, cam: 6.5, x: 0, y: 0.12, scale: 1, fade: 1, glow: 0.9, glowSize: 1.1, hole: 0, mobile: [0, 0.2, 0.95] },
  { p: 1, shape: 2, yaw: 0, pitch: 0, roll: 0.7, cam: 0.6, x: 0, y: 0, scale: 1, fade: 0, glow: 0, glowSize: 1, hole: 0, mobile: [0, 0, 1] },
]

type Chapter = {
  label: string
  title: string
  accent: string
  body: string
  /** Where the text sits on wide screens. On phones it's always at the bottom. */
  align: 'left' | 'center'
  /** Scroll progress where it starts fading in, is fully in, starts fading out, is gone */
  show: [number, number, number, number]
  cta?: boolean
}

const CHAPTERS: Chapter[] = [
  {
    label: 'Event horizon',
    title: 'Pulled in by',
    accent: 'great design.',
    body: 'A website that draws visitors in and keeps them there: a clear message, a smooth experience, and every page built to turn interest into potential clients.',
    align: 'left',
    show: [0.09, 0.14, 0.25, 0.3],
  },
  {
    label: 'Design',
    title: 'Every detail,',
    accent: 'placed with intent.',
    body: 'Layouts shaped around your brand and your customers, polished down to the last pixel.',
    align: 'left',
    show: [0.35, 0.41, 0.56, 0.61],
  },
  {
    label: 'Launch',
    title: 'Launched, and',
    accent: 'kept in orbit.',
    body: 'Hosting, domains and deployment handled for you, with security built in from day one.',
    align: 'center',
    show: [0.74, 0.79, 0.93, 0.98],
    cta: true,
  },
]

// Chapter rail on the right: where each stop scrolls to and where it lights up
const STOPS = [
  { label: 'Intro', at: 0, from: 0 },
  { label: 'Event horizon', at: 0.19, from: 0.07 },
  { label: 'Design', at: 0.5, from: 0.32 },
  { label: 'Launch', at: 0.85, from: 0.66 },
]

const ALIGN_CLASSES: Record<Chapter['align'], string> = {
  left: 'wide:top-1/2 wide:bottom-auto wide:right-auto wide:left-[max(2rem,calc(50%-36rem))] wide:w-[min(27rem,40vw)] wide:-translate-y-1/2 wide:text-left',
  center: 'wide:bottom-[7vh] wide:left-1/2 wide:right-auto wide:w-[min(36rem,80vw)] wide:-translate-x-1/2 wide:text-center',
}

function poseAt(p: number, mobile: boolean) {
  let i = 0
  while (i < POSES.length - 2 && p > POSES[i + 1].p) i++
  const a = POSES[i]
  const b = POSES[i + 1]
  const t = smooth(clamp01((p - a.p) / (b.p - a.p)))
  const mix = (key: Exclude<keyof Pose, 'mobile'>) => lerp(a[key], b[key], t)

  return {
    shape: mix('shape'),
    yaw: mix('yaw'),
    pitch: mix('pitch'),
    roll: mix('roll'),
    cam: mix('cam'),
    x: mobile ? lerp(a.mobile[0], b.mobile[0], t) : mix('x'),
    y: mobile ? lerp(a.mobile[1], b.mobile[1], t) : mix('y'),
    scale: mobile ? lerp(a.mobile[2], b.mobile[2], t) : mix('scale'),
    fade: mix('fade'),
    glow: mix('glow'),
    glowSize: mix('glowSize'),
    hole: mix('hole'),
  }
}

/** Fades 0 -> 1 -> 0 across the four points */
function fadeInOut(p: number, [a, b, c, d]: [number, number, number, number]) {
  if (p <= a || p >= d) return 0
  if (p < b) return smooth((p - a) / (b - a))
  if (p <= c) return 1
  return 1 - smooth((p - c) / (d - c))
}

/** Fully hidden layers also get visibility: hidden so they can't be tabbed to */
function showLayer(el: HTMLElement | null, opacity: number, offsetY: number) {
  if (!el) return
  const hidden = opacity < 0.01
  el.style.opacity = hidden ? '0' : opacity.toFixed(3)
  el.style.transform = `translate3d(0, ${offsetY.toFixed(1)}px, 0)`
  el.style.visibility = hidden ? 'hidden' : 'visible'
}

export default function ScrollHero() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const introRef = useRef<HTMLDivElement>(null)
  const chapterRefs = useRef<(HTMLElement | null)[]>([])
  const railRef = useRef<HTMLOListElement>(null)
  const scrollToRef = useRef<(p: number) => void>(() => {})

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!section || !stage || !canvas) return

    const reduced = prefersReducedMotion()
    const lowEnd = (navigator.hardwareConcurrency || 8) <= 4
    const baseCount = stage.clientWidth >= 1100 ? 22000 : stage.clientWidth >= 700 ? 15000 : 10000
    const count = Math.round(baseCount * (lowEnd ? 0.65 : 1))

    let formations: Formations | null = buildFormations(count)
    let scene = HeroScene.create(canvas, formations)

    let width = 1
    let height = 1
    let dpr = 1
    let mobile = false
    let top = 0
    let range = 1

    const measure = () => {
      width = stage.clientWidth || window.innerWidth
      height = stage.clientHeight || window.innerHeight
      // same rule as the `wide` CSS variant in index.css
      mobile = width < 900 || width / height < 1.05
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

    // Mobile browsers can drop the WebGL context in the background
    const onContextLost = (e: Event) => {
      e.preventDefault()
      scene = null
    }
    const onContextRestored = () => {
      formations ??= buildFormations(count)
      scene = HeroScene.create(canvas, formations)
      scene?.resize(width, height, dpr)
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)

    // Mouse only, touch would just make the scene jump around
    let mouseX = 0
    let mouseY = 0
    let lastMove = -Infinity
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      mouseX = (e.clientX / width) * 2 - 1
      mouseY = 1 - (e.clientY / height) * 2
      lastMove = performance.now()
    }

    // Small ripples follow the cursor across the disk, a click sends a big one
    const ripples = new Float32Array(RIPPLES * 4)
    let nextRipple = 0
    let lastRipple: [number, number] | null = null
    let lastRippleAt = -Infinity
    let clicked = false
    const addRipple = (x: number, z: number, strength: number) => {
      ripples.set([x, z, time, strength], nextRipple * 4)
      nextRipple = (nextRipple + 1) % RIPPLES
      lastRipple = [x, z]
      lastRippleAt = time
    }
    const onPointerDown = (e: PointerEvent) => {
      onPointerMove(e)
      clicked = true
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })

    const scrollProgress = () => clamp01((window.scrollY - top) / range)

    let p = scrollProgress()
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

      // Ease towards the real scroll position so wheel steps don't look jumpy
      const target = scrollProgress()
      p += (target - p) * ease(6)
      if (Math.abs(target - p) < 0.00005) p = target

      const pose = poseAt(p, mobile)
      if (introStart < 0) introStart = now
      const intro = reduced ? 1 : clamp01((now - introStart) / 2600)

      // Warp builds up during the dive and settles as the next section arrives
      const warp = reduced ? 0 : smooth(clamp01((p - 0.8) / 0.08)) * (1 - smooth(clamp01((p - 0.95) / 0.05)) * 0.7)
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
          if (clicked) {
            addRipple(hit[0], hit[1], 1.6)
          } else if (moved > 1.4 || (moved > 0.3 && time - lastRippleAt > 0.3)) {
            addRipple(hit[0], hit[1], Math.min(1, 0.35 + moved * 0.1))
          }
        }
      }
      clicked = false

      scene?.render({
        ...view,
        time,
        dt,
        morph: pose.shape,
        intro,
        flow,
        mouseX,
        mouseY,
        // the disk gets ripples instead of the cursor push
        mouseForce: force * (1 - pose.hole) * (1 - smooth(clamp01((p - 0.66) / 0.08))),
        fade: pose.fade,
        hole: pose.hole * intro,
        ripples,
      })

      // The glow is a 100px circle, moved and scaled to sit behind the shape
      const glow = glowRef.current
      if (glow) {
        const unit = ((focalFor(width / height) * pose.scale) / pose.cam) * (height / 2)
        const cx = ((pose.x + 1) / 2) * width - 50
        const cy = ((1 - pose.y) / 2) * height - 50
        const scale = Math.max(1, unit * pose.glowSize * 2) / 100
        glow.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`
        glow.style.opacity = (pose.glow * intro).toFixed(3)
      }

      showLayer(introRef.current, fadeInOut(p, [-1, 0, 0.025, 0.09]), -p * 260)
      CHAPTERS.forEach((chapter, i) => {
        const opacity = fadeInOut(p, chapter.show)
        const middle = (chapter.show[1] + chapter.show[2]) / 2
        showLayer(chapterRefs.current[i], opacity, (1 - opacity) * (p < middle ? 36 : -36))
      })

      let stop = 0
      while (stop < STOPS.length - 1 && p >= STOPS[stop + 1].from) stop++
      if (stop !== activeStop && railRef.current) {
        activeStop = stop
        Array.from(railRef.current.children).forEach((item, i) => {
          item.toggleAttribute('data-active', i === stop)
          item.querySelector('button')?.setAttribute('aria-current', i === stop ? 'step' : 'false')
        })
      }
    }

    // Only animate while the hero is on screen
    const start = () => {
      if (raf) return
      last = performance.now()
      p = scrollProgress()
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
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      scene?.dispose()
      formations = null
    }
  }, [])

  return (
    <section id="home" ref={sectionRef} className="relative h-[400vh]">
      <div ref={stageRef} className="sticky top-0 h-svh w-full overflow-hidden">
        <div ref={glowRef} className="hero-glow" style={{ opacity: 0 }} aria-hidden />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />

        <div ref={introRef} className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 pt-[100px] pb-28">
          <HeroIntro />

          <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 animate-fade-up flex-col items-center gap-2 delay-700" aria-hidden>
            <span className="font-mono text-xs tracking-[0.1em] text-muted/60">SCROLL</span>
            <div className="relative h-10 w-px overflow-hidden bg-accent/15">
              <div className="animate-scroll-hint absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(to_bottom,var(--color-accent),transparent)]" />
            </div>
          </div>
        </div>

        {CHAPTERS.map((chapter, i) => (
          <article
            key={chapter.label}
            ref={(el) => {
              chapterRefs.current[i] = el
            }}
            className={`hero-chapter absolute inset-x-0 bottom-0 z-10 px-6 pt-28 pb-[max(3rem,env(safe-area-inset-bottom))] text-center wide:p-0 ${ALIGN_CLASSES[chapter.align]}`}
            style={{ opacity: 0, visibility: 'hidden' }}
          >
            <span className="eyebrow">
              {String(i + 1).padStart(2, '0')} / {chapter.label}
            </span>
            <h2 className="section-title text-[clamp(2.1rem,4.4vw,3.4rem)]">
              {chapter.title} <span className="text-gradient">{chapter.accent}</span>
            </h2>
            <p className={`mx-auto mt-5 max-w-md text-base leading-[1.7] text-muted ${chapter.align === 'left' ? 'wide:mx-0' : ''}`}>
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
