import { useEffect, useRef, useState } from 'react'
import { PROJECTS, WORK_INTRO, type Project } from '@/content/projects'
import { startLensDriver } from '@/lens/driver'
import { INTRO, PER_PROJECT, caption, lensTimeline, settledAt, span } from '@/lens/timeline'
import { StarField } from '@/blackhole/StarField'
import { scrollToTarget } from '@/motion/scroll'
import { defineMoonScene } from '@/moon'
import { useSceneStatus, useShowScene } from '@/stage/react'
import { stage } from '@/stage/stage'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'

const projects: readonly Project[] = PROJECTS
const images = projects.map((p) => p.image)
const host = (url: string) => new URL(url).host

/** Scroll progress through the pinned stage, 0..1. Written by the section, read by the scene every frame. */
let lensProgress = 0

/**
 * Registers the lensed sky with the stage. The scene's code, shaders and
 * renderer are a separate chunk, fetched the first time the stage is asked for
 * the scene. Above the black hole's stage in priority, so it takes over the
 * moment the two overlap at the hand-over.
 */
function defineLensScene() {
  stage.define('lens', async (ctx) => (await import('@/lens/scene')).createLensScene({ progress: () => lensProgress, images })(ctx), { priority: 2 })
}

const meta = 'font-mono text-[0.72rem] tracking-[0.06em] text-bh-glow'
const pill = 'inline-flex items-center rounded-pill px-2.5 py-1 font-mono text-[0.7rem] tracking-[0.03em] text-[#c9bda6] shadow-[inset_0_0_0_1px_rgb(188_166_142/0.28)]'

function VisitLink({ project, onFocus, className }: { project: Project; onFocus?: () => void; className?: string }) {
  if (!project.url) return <p className={meta}>Live soon</p>
  return (
    <a
      href={project.url}
      target="_blank"
      rel="noreferrer"
      onFocus={onFocus}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-pill text-[0.9rem] text-bh-highlight underline decoration-bh-accent/50 underline-offset-4 transition-colors duration-(--duration-base) hover:decoration-bh-highlight focus-ring',
        className,
      )}
    >
      Visit {host(project.url)}
      <span className="sr-only"> (opens in a new tab)</span>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M5 11 11 5M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

/**
 * The words for one project, set in the shadow under the horizon. Every
 * project's words are always on the page, stacked in the same place; only the
 * one whose picture has settled is visible. They change by opacity and
 * position alone (see .lens-caption): anything heavier would be re-drawn over
 * a canvas that is itself drawing every frame.
 */
function Words({ project, index, shown, onFocus }: { project: Project; index: number; shown: boolean; onFocus: () => void }) {
  return (
    <li className={cn('lens-caption col-start-1 row-start-1 grid items-end gap-x-10 gap-y-3 lg:grid-cols-12', shown && 'is-shown')}>
      <div className="lg:col-span-5">
        <p className={meta}>
          {index + 1} of {projects.length}
          <span className="mx-2 text-bh-ember" aria-hidden="true">
            /
          </span>
          {project.kind}, {project.year}
        </p>
        <h3 className="mt-2 font-hero text-[clamp(2.3rem,1.5rem+3.2vw,4.4rem)] leading-[0.95] tracking-[-0.03em] text-bh-highlight">
          {project.name}
        </h3>
      </div>
      <p className="max-w-[34rem] text-[0.92rem] leading-[1.6] text-pretty text-[#c9bda6] lg:col-span-4 lg:pb-1">
        {project.summary}
        <span className="sr-only"> Pictured: {project.imageAlt}.</span>
      </p>
      <div className="lg:col-span-3 lg:pb-1">
        <ul role="list" aria-label="Built with" className="flex flex-wrap gap-1.5">
          {project.stack.map((s) => (
            <li key={s} className={pill}>
              {s}
            </li>
          ))}
        </ul>
        <div className="mt-2">
          {/* Only the project that is up can be clicked: the others are stacked, unseen, in the same place */}
          <VisitLink project={project} onFocus={onFocus} className={shown ? 'pointer-events-auto' : undefined} />
        </div>
      </div>
    </li>
  )
}

/**
 * The pinned stage. The sky itself is drawn on the site's one canvas, fixed
 * behind the page (see src/stage); this section is the stretch of scroll that
 * drives it, and the words laid over it.
 */
function Stage() {
  const sectionRef = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [words, setWords] = useState({ index: 0, shown: false })
  const count = projects.length

  // Scroll → progress. The scene reads it every frame; React only hears when the words change.
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    return startLensDriver(section, (p, isPinned) => {
      lensProgress = p
      setPinned(isPinned)
      const next = caption(lensTimeline(p, count), count)
      setWords((prev) => (prev.index === next.index && prev.shown === next.shown ? prev : next))
    })
  }, [count])

  // The sky is the scene on screen for as long as this stage is pinned
  useEffect(defineLensScene, [])
  useShowScene('lens', pinned)

  // While the visitor is here among the projects, the moon further down the page is fetched and
  // built (three.js, its textures, the alien), so that it is ready by the time they reach it.
  // Building it holds the page up for a few tenths of a second, so it waits for a moment when
  // nothing is moving: a project has settled and the visitor has stopped scrolling to read it.
  // Someone who scrolls straight through without stopping gets it at the third project regardless.
  const reading = words.shown
  const pressing = words.index >= 2
  const moonAsked = useRef(false)
  useEffect(() => {
    if (moonAsked.current || !(reading || pressing)) return
    const ask = () => {
      if (moonAsked.current) return
      moonAsked.current = true
      defineMoonScene()
      void stage.preload('moon')
    }
    if (pressing) return ask()
    let timer = window.setTimeout(ask, 450)
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(ask, 450)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [reading, pressing])

  // Load the scene ahead of time: once the page has been idle a while, or when it is a few screens away
  useEffect(() => {
    const section = sectionRef.current
    if (!section || near) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true)
      },
      { rootMargin: '300% 0px' },
    )
    io.observe(section)
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1))
    const timer = saveData ? 0 : window.setTimeout(() => idle(() => setNear(true)), 6000)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
    }
  }, [near])
  useEffect(() => {
    if (near) void stage.preload('lens')
  }, [near])

  // Keyboard focus landing on a project's link brings that project up
  const goTo = (index: number) => {
    const section = sectionRef.current
    if (!section || (words.index === index && words.shown)) return
    const stage = section.querySelector<HTMLElement>('[data-lens-pin]')
    const top = section.getBoundingClientRect().top + window.scrollY
    const range = section.offsetHeight - (stage?.offsetHeight ?? window.innerHeight)
    scrollToTarget(top + range * (settledAt(index, count) + 0.01), { immediate: true })
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby="work-projects-title"
      data-lens-stage
      data-bg-scene="blackhole"
      // Pulled up by one screen so it pins the moment the black hole's stage lets go: black meets black
      className="relative z-10 -mt-[100lvh]"
      style={{ height: `${(span(count) + 1) * 100}lvh` }}
    >
      <div data-lens-pin className="sticky top-0 h-lvh overflow-clip">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-14 lg:pb-10">
          <h2 id="work-projects-title" className="sr-only">
            {WORK_INTRO.title}
          </h2>
          <ol role="list" className="mx-auto grid max-w-[84rem]">
            {projects.map((p, i) => (
              <Words key={p.slug} project={p} index={i} shown={words.shown && words.index === i} onFocus={() => goTo(i)} />
            ))}
          </ol>
        </div>
      </div>

      {/* Where "See more" lands: the first project, already settled */}
      <span id="work-projects" aria-hidden="true" className="absolute" style={{ top: `${(INTRO + 0.08 * PER_PROJECT) * 100}lvh` }} />
    </section>
  )
}

/**
 * The same projects as a plain list on the dark page, for reduced motion and
 * for devices that cannot run the scene: each picture, flat, with its words.
 */
function Flat() {
  return (
    <section id="work-projects" aria-labelledby="work-projects-title" data-bg-scene="blackhole" className="relative overflow-x-clip bg-black py-24 md:py-32">
      <StarField seed={0x3c41} />
      <div className="relative mx-auto max-w-[76rem] px-5 sm:px-8">
        <p className={meta}>{WORK_INTRO.eyebrow}</p>
        <h2 id="work-projects-title" className="mt-3 font-hero text-display-lg text-bh-highlight">
          {WORK_INTRO.title}
        </h2>
        <ol role="list" className="mt-14 flex flex-col gap-20 md:mt-20 md:gap-28">
          {projects.map((p, i) => (
            <li key={p.slug} className="grid items-end gap-x-12 gap-y-6 lg:grid-cols-12">
              <img
                src={p.image}
                alt={p.imageAlt}
                width={1600}
                height={1000}
                loading="lazy"
                decoding="async"
                className="block aspect-[16/10] w-full rounded-glass-sm object-cover object-top shadow-[0_0_0_1px_rgb(255_237_193/0.35),0_0_60px_-20px_rgb(255_237_193/0.35)] lg:col-span-8"
              />
              <div className="lg:col-span-4">
                <p className={meta}>
                  {i + 1} of {projects.length}
                  <span className="mx-2 text-bh-ember" aria-hidden="true">
                    /
                  </span>
                  {p.kind}, {p.year}
                </p>
                <h3 className="mt-2 font-hero text-[clamp(2rem,1.4rem+2vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bh-highlight">{p.name}</h3>
                <p className="mt-4 text-[0.95rem] leading-[1.65] text-pretty text-[#c9bda6]">{p.summary}</p>
                <ul role="list" aria-label="Built with" className="mt-5 flex flex-wrap gap-1.5">
                  {p.stack.map((s) => (
                    <li key={s} className={pill}>
                      {s}
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <VisitLink project={p} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * The work, shown in the sky on the far side of the fall. The camera hovers
 * just above the black hole; the hole's shadow is the dark lower part of the
 * screen and its edge is the horizon. Each project comes up over that horizon
 * as a ring of light, bent round the hole, and unrolls into its picture as you
 * scroll; its words sit in the shadow underneath. After the last one the
 * camera drops the rest of the way and the sky closes overhead.
 *
 * The canvas is decoration and hidden from assistive tech; the words are
 * ordinary page content and all of them are always there to be read. With
 * reduced motion, or where the scene cannot run, the projects are a plain list.
 */
export function LensedWork() {
  const reduced = usePrefersReducedMotion()
  const status = useSceneStatus('lens')
  if (reduced || status === 'failed') return <Flat />
  return <Stage />
}
