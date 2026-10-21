import { useEffect, useRef, useState } from 'react'
import Reveal from '../ui/Reveal'
import { createPlanetScene, type PlanetLook, type PlanetPlace } from '../../lib/space/planets'

type Project = {
  name: string
  url: string
  /** one line under the name */
  kind: string
  summary: string
  tags: string[]
  /** screenshot in public/work, 16:10 works best */
  image: string
  planet: PlanetLook
}

// Each project is a planet. Add one here and it shows up in the system,
// up to six of them.
const PROJECTS: Project[] = [
  {
    name: 'Starblossom',
    url: 'https://starblossom.org',
    kind: 'Website',
    summary: 'Designed and built from scratch, with a layout that holds up on every screen from phones to wide monitors.',
    tags: ['Design', 'Development', 'Responsive'],
    image: '/work/starblossom.png',
    // a soft pink desert under a thin lavender sky, lit from the right
    planet: {
      kind: 'dust',
      colors: ['#7a3450', '#e8889a', '#ffd8cc'],
      air: '#b8a8d8',
      haze: 0.7,
      sun: [0.7, 0.3, 0.72],
      tilt: 0.3,
      seed: 3.1,
    },
  },
  {
    name: 'Timmy',
    url: 'https://timmypage.vercel.app',
    kind: 'Personal page',
    summary: 'A personal page, designed and built by me and deployed on Vercel.',
    tags: ['Design', 'Development', 'Vercel'],
    image: '/work/timmypage.png',
    // a cracked bronze world in wide amber rings, the sun just past its limb
    planet: {
      kind: 'cracked',
      colors: ['#5a3418', '#c89650', '#f8e0ac'],
      air: '#f0b878',
      haze: 0.3,
      sun: [0.75, 0.5, 0.4],
      flare: 1,
      ring: [1.35, 2.15],
      ringColor: '#f0b25a',
      rocks: 1,
      tilt: -0.35,
      seed: 11.4,
    },
  },
]

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Same breakpoint as Tailwind's lg, where the details sit beside the planet
const sideBySide = () => window.matchMedia('(min-width: 1024px)').matches

const domain = (url: string) => new URL(url).host

function ArrowIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className={flip ? 'rotate-180' : ''}>
      <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M4.5 2.5h5v5M9.5 2.5L3 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The screenshot, in a little browser window. Until there's an image for a
// project it shows the planet's colours with the address instead.
function Screenshot({ project }: { project: Project }) {
  const [broken, setBroken] = useState<string | null>(null)
  const [deep, mid] = project.planet.colors
  const missing = broken === project.image

  return (
    <figure className="overflow-hidden rounded-xl border border-accent/15 bg-night/80 shadow-[0_20px_60px_rgb(0_0_0/0.45)]">
      <div className="flex items-center gap-2 border-b border-accent/10 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-accent/25" />
        <span className="h-2 w-2 rounded-full bg-accent/25" />
        <span className="h-2 w-2 rounded-full bg-accent/25" />
        <span className="ml-2 truncate rounded-md bg-accent/6 px-2.5 py-0.5 font-mono text-[10px] text-muted">
          {domain(project.url)}
        </span>
      </div>
      <div className="aspect-[16/10]">
        {missing ? (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `radial-gradient(circle at 30% 30%, ${mid}55, ${deep}88 55%, #020104)` }}
          >
            <span className="font-display text-lg font-semibold tracking-tight text-ink/80">{domain(project.url)}</span>
          </div>
        ) : (
          <img
            key={project.image}
            src={project.image}
            alt={`The ${project.name} website`}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(project.image)}
            className="h-full w-full object-cover object-top"
          />
        )}
      </div>
    </figure>
  )
}

// Planet layouts, in pixels from the stage's top left
type Layout = { x: number; y: number; r: number; opacity: number }

function overview(i: number, n: number, w: number, h: number, wide: boolean): Layout {
  if (wide) {
    // a loose row, every other one a little higher
    const gap = Math.min(0.34, 0.82 / n)
    const r = Math.min(h * 0.19, (w * gap) / 2.9)
    return { x: w * (0.5 + (i - (n - 1) / 2) * gap), y: h * (i % 2 ? 0.42 : 0.56), r, opacity: 1 }
  }
  // zigzag down the stage
  const r = Math.min(w * 0.24, h / (n * 2.9), 130)
  return { x: w * (i % 2 ? 0.64 : 0.36), y: h * ((i + 0.5) / n), r, opacity: 1 }
}

function closeUp(w: number, h: number, wide: boolean, panelTop: number, zoom: number): Layout {
  if (wide) return { x: w * 0.25, y: h * 0.5, r: Math.min(h * 0.36, w * 0.19) * zoom, opacity: 1 }
  return { x: w * 0.5, y: panelTop * 0.52, r: Math.min(w * 0.34, panelTop * 0.4) * zoom, opacity: 1 }
}

// How far the open planet can be zoomed in
const MAX_ZOOM = 3

export default function Work() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const backRef = useRef<HTMLButtonElement>(null)

  const [focus, setFocus] = useState(-1)
  // what the panel shows, kept after closing so it doesn't blank while fading
  const [shown, setShown] = useState(0)
  const [noGl, setNoGl] = useState(false)

  // the render loop reads these instead of re-subscribing on every change
  const focusRef = useRef(focus)
  const hoverRef = useRef(-1)
  focusRef.current = focus

  const open = (i: number) => {
    setFocus(i)
    setShown(i)
    // on narrow screens the close up is at the top of the stage, which can
    // be off screen if the planet was further down
    const stage = stageRef.current
    if (stage && !sideBySide() && stage.getBoundingClientRect().top < 0) stage.scrollIntoView({ block: 'start' })
  }
  const close = () => {
    const was = focusRef.current
    setFocus(-1)
    // hand focus back to the planet that was open
    if (was >= 0) requestAnimationFrame(() => buttonRefs.current[was]?.focus({ preventScroll: true }))
  }
  const step = (by: number) => open((focusRef.current + by + PROJECTS.length) % PROJECTS.length)

  // Keys while a planet is open
  useEffect(() => {
    if (focus < 0) return
    backRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' && PROJECTS.length > 1) step(1)
      else if (e.key === 'ArrowLeft' && PROJECTS.length > 1) step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus])

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    const panel = panelRef.current
    if (!section || !stage || !canvas || !panel) return

    const scene = createPlanetScene(canvas)
    if (!scene) setNoGl(true)

    const n = PROJECTS.length
    const looks = PROJECTS.map((p) => p.planet)
    const still = reducedMotion()

    // where each planet is now, eased towards where it should be
    const now: (Layout & { spin: number })[] = PROJECTS.map((_, i) => ({ x: 0, y: 0, r: 0, opacity: 0, spin: i * 2.4 }))
    let placed = false
    let wide = sideBySide()
    let stageX = 0
    let stageY = 0
    let stageW = 0
    let stageH = 0
    let panelTop = 0
    // zoom on the open planet, eased towards what the wheel or a pinch asks for
    let zoom = 1
    let zoomTarget = 1
    let zoomed = -1

    const measure = () => {
      wide = sideBySide()
      // the canvas covers the whole section, the stage is somewhere inside it
      const outer = section.getBoundingClientRect()
      const inner = stage.getBoundingClientRect()
      stageX = inner.left - outer.left
      stageY = inner.top - outer.top
      stageW = stage.clientWidth
      stageH = stage.clientHeight
      panelTop = panel.offsetTop + parseFloat(getComputedStyle(panel).paddingTop) * 0.92
      const dpr = Math.min(window.devicePixelRatio || 1, section.clientWidth < 768 ? 1.5 : 2)
      scene?.resize(section.clientWidth, section.clientHeight, dpr)
    }
    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(section)
    resizeObserver.observe(stage)

    const targetFor = (i: number): Layout => {
      const f = focusRef.current
      const base = overview(i, n, stageW, stageH, wide)
      if (f < 0) {
        const lift = hoverRef.current === i ? 1.07 : 1
        return { ...base, r: base.r * lift }
      }
      if (i === f) return closeUp(stageW, stageH, wide, panelTop, zoom)
      // the rest fly past the camera and out of view
      const from = overview(f, n, stageW, stageH, wide)
      const dx = base.x - from.x || 1
      const dy = base.y - from.y
      const len = Math.hypot(dx, dy)
      return { x: base.x + (dx / len) * stageW * 0.7, y: base.y + (dy / len) * stageH * 0.5, r: base.r * 2.2, opacity: 0 }
    }

    // Dragging spins the open planet, and it keeps turning for a moment after.
    // A second finger turns the drag into a pinch, which zooms instead.
    let drag: { x: number; at: number } | null = null
    let fling = 0
    const fingers = new Map<number, { x: number; y: number }>()
    let pinch = 0

    const overOpenPlanet = (e: { clientX: number; clientY: number }) => {
      const f = focusRef.current
      if (f < 0) return false
      const box = stage.getBoundingClientRect()
      const p = now[f]
      return Math.hypot(e.clientX - box.left - p.x, e.clientY - box.top - p.y) < p.r
    }
    const setZoom = (z: number) => {
      zoomTarget = Math.min(MAX_ZOOM, Math.max(1, z))
    }
    const span = () => {
      const [a, b] = [...fingers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const onDown = (e: PointerEvent) => {
      // the second finger can land a little off the planet
      if (fingers.size === 0 ? !overOpenPlanet(e) : fingers.size >= 2) return
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      stage.setPointerCapture(e.pointerId)
      if (fingers.size === 2) {
        drag = null
        pinch = span()
        return
      }
      drag = { x: e.clientX, at: performance.now() }
      stage.dataset.grabbing = ''
    }
    const onMove = (e: PointerEvent) => {
      const finger = fingers.get(e.pointerId)
      if (finger) {
        finger.x = e.clientX
        finger.y = e.clientY
      }
      if (fingers.size >= 2) {
        const next = span()
        if (pinch > 0) setZoom(zoomTarget * (next / pinch))
        pinch = next
        return
      }
      if (!drag) {
        stage.toggleAttribute('data-grab', overOpenPlanet(e))
        return
      }
      const f = focusRef.current
      if (f < 0) return
      const moved = (e.clientX - drag.x) / Math.max(now[f].r, 1)
      const t = performance.now()
      now[f].spin -= moved
      fling = -moved / Math.max((t - drag.at) / 1000, 0.008)
      drag = { x: e.clientX, at: t }
    }
    const onUp = (e: PointerEvent) => {
      fingers.delete(e.pointerId)
      if (fingers.size < 2) pinch = 0
      drag = null
      delete stage.dataset.grabbing
    }
    // The wheel zooms only while the pointer is over the open planet, so the
    // page still scrolls normally everywhere else
    const onWheel = (e: WheelEvent) => {
      if (!overOpenPlanet(e)) return
      e.preventDefault()
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      setZoom(zoomTarget * Math.exp(-e.deltaY * lines * 0.0018))
    }
    stage.addEventListener('pointerdown', onDown)
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)
    stage.addEventListener('wheel', onWheel, { passive: false })

    let raf = 0
    let last = performance.now()
    const start = performance.now()

    const frame = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05)
      last = t
      const ease = still || !placed ? 1 : 1 - Math.exp(-dt * 3.6)
      const time = (t - start) / 1000
      const f = focusRef.current

      // zoom starts over whenever a different planet is open, or none
      if (f !== zoomed) {
        zoomed = f
        zoom = zoomTarget = 1
        fingers.clear()
        pinch = 0
      }
      zoom += (zoomTarget - zoom) * (still ? 1 : 1 - Math.exp(-dt * 9))

      for (let i = 0; i < n; i++) {
        const target = targetFor(i)
        const p = now[i]
        p.x += (target.x - p.x) * ease
        p.y += (target.y - p.y) * ease
        p.r += (target.r - p.r) * ease
        p.opacity += (target.opacity - p.opacity) * ease
        if (!still) p.spin += dt * (i === f ? 0.06 : 0.1)

        // the planet button sits over the planet so it can be clicked or tabbed to
        const button = buttonRefs.current[i]
        if (button) {
          const bob = still || f >= 0 ? 0 : Math.sin(time * 0.6 + i * 1.7) * 5
          button.style.transform = `translate3d(${p.x - p.r}px, ${p.y - p.r + bob}px, 0)`
          button.style.width = button.style.height = `${p.r * 2}px`
        }
      }
      if (f >= 0 && !drag && !still) {
        now[f].spin += fling * dt
        fling *= Math.exp(-dt * 2.5)
      }
      placed = true

      if (scene) {
        // the focused planet goes last so it draws on top
        const order = [...Array(n).keys()].sort((a, b) => (a === f ? 1 : b === f ? -1 : 0))
        const places: PlanetPlace[] = order.map((i) => {
          const p = now[i]
          const bob = still || f >= 0 ? 0 : Math.sin(time * 0.6 + i * 1.7) * 5
          return { x: stageX + p.x, y: stageY + p.y + bob, r: p.r, opacity: p.opacity, spin: p.spin }
        })
        scene.draw(places, order.map((i) => looks[i]), time)
      }
      raf = requestAnimationFrame(frame)
    }

    // only run while the section is on screen
    const visibility = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf)
      if (entry.isIntersecting) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    })
    visibility.observe(section)

    return () => {
      cancelAnimationFrame(raf)
      visibility.disconnect()
      resizeObserver.disconnect()
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      stage.removeEventListener('wheel', onWheel)
      scene?.dispose()
    }
  }, [])

  const project = PROJECTS[shown]
  const isOpen = focus >= 0

  return (
    <section ref={sectionRef} id="work" className="relative overflow-hidden py-36">
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="section-divider absolute inset-x-0 bottom-0" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal duration={700} className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="eyebrow">Work</span>
            <h2 className="section-title">
              Sites I've built
              <br />
              <span className="text-gradient">so far.</span>
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-[1.7] text-muted">
            Every planet is a project. Click one to fly in for a closer look, then drag to spin it or scroll to zoom.
          </p>
        </Reveal>

        <div
          ref={stageRef}
          data-open={isOpen || undefined}
          data-nogl={noGl || undefined}
          className="work-stage relative grid scroll-mt-20 min-h-[40rem] touch-pan-y lg:min-h-[38rem]"
        >
          {PROJECTS.map((p, i) => (
            <button
              key={p.url}
              ref={(el) => {
                buttonRefs.current[i] = el
              }}
              type="button"
              onClick={() => open(i)}
              onPointerEnter={() => (hoverRef.current = i)}
              onPointerLeave={() => (hoverRef.current = -1)}
              onFocus={() => (hoverRef.current = i)}
              onBlur={() => (hoverRef.current = -1)}
              tabIndex={isOpen ? -1 : 0}
              aria-hidden={isOpen || undefined}
              aria-label={`${p.name}, ${p.kind}. Open details`}
              className="work-planet absolute top-0 left-0 rounded-full"
              style={noGl ? { background: `radial-gradient(circle at 32% 30%, ${p.planet.colors[2]}, ${p.planet.colors[1]} 45%, ${p.planet.colors[0]})` } : undefined}
            >
              <span className="work-planet-label">
                <span className="font-mono text-[10px] tracking-[0.12em] text-accent/60">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-display text-sm font-semibold tracking-tight text-ink">{p.name}</span>
                <span className="font-mono text-[10px] text-muted">{domain(p.url)}</span>
              </span>
            </button>
          ))}

          <div
            ref={panelRef}
            inert={!isOpen}
            data-open={isOpen || undefined}
            className="work-panel col-start-1 row-start-1 self-center pt-72 lg:w-[46%] lg:justify-self-end lg:pt-0"
          >
            <div className="panel rounded-2xl p-6 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <button
                  ref={backRef}
                  type="button"
                  onClick={close}
                  className="inline-flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors duration-200 hover:text-ink"
                >
                  <ArrowIcon flip />
                  All projects
                </button>
                <span className="font-mono text-[10px] tracking-[0.12em] text-accent/60">
                  {String(shown + 1).padStart(2, '0')} / {String(PROJECTS.length).padStart(2, '0')}
                </span>
              </div>

              <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-accent">{project.kind}</span>
              <h3 className="mb-1 font-display text-[clamp(1.8rem,3.4vw,2.4rem)] leading-[1.1] font-semibold tracking-[-0.03em]">
                {project.name}
              </h3>
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs text-lavender transition-colors duration-200 hover:text-ink"
              >
                {domain(project.url)}
                <ExternalIcon />
              </a>
              <p className="mb-5 text-sm leading-[1.7] text-muted">{project.summary}</p>

              <ul className="mb-6 flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <li key={tag} className="chip rounded-lg px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] text-lavender">
                    {tag}
                  </li>
                ))}
              </ul>

              <Screenshot project={project} />

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary rounded-xl px-5 py-2.5 text-sm"
                >
                  Visit site
                  <ExternalIcon />
                </a>
                {PROJECTS.length > 1 && (
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      aria-label="Previous project"
                      className="btn-ghost h-10 w-10 cursor-pointer rounded-xl"
                    >
                      <ArrowIcon flip />
                    </button>
                    <button
                      type="button"
                      onClick={() => step(1)}
                      aria-label="Next project"
                      className="btn-ghost h-10 w-10 cursor-pointer rounded-xl"
                    >
                      <ArrowIcon />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
