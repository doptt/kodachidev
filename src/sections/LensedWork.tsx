import { useEffect, useRef, useState } from 'react'
import { PROJECTS, WORK_INTRO, type Project } from '@/content/projects'
import { startLensDriver } from '@/lens/driver'
import { INTRO, PER_PROJECT, SIDE_BY_SIDE, caption, lensTimeline, pictureBox, settledAt, span, type Tune } from '@/lens/timeline'
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
 * What the page needs of the scene's framing: room under the navigation, and a shadow deep enough
 * for the words. Both are so many pixels whatever the height of the screen, so the section works
 * them out and the scene reads them every frame.
 */
let lensTune: Tune = {}

/**
 * Registers the lensed sky with the stage. The scene's code, shaders and
 * renderer are a separate chunk, fetched the first time the stage is asked for
 * the scene. Above the black hole's stage in priority, so it takes over the
 * moment the two overlap at the hand-over.
 */
function defineLensScene() {
  stage.define('lens', async (ctx) => (await import('@/lens/scene')).createLensScene({ progress: () => lensProgress, images, tune: () => lensTune })(ctx), { priority: 2 })
}

const meta = 'lens-meta font-mono text-[0.72rem] tracking-[0.06em] text-bh-glow'
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
 * The words for one project. On a wide screen they are a column beside the
 * picture (`side`); on a narrow one a row in the shadow under it. Every
 * project's words are always on the page, stacked in the same place; only the
 * one whose picture has settled is visible. They change by opacity and
 * position alone (see .lens-caption): anything heavier would be re-drawn over
 * a canvas that is itself drawing every frame.
 */
function Words({ project, index, shown, side, compact, onFocus }: { project: Project; index: number; shown: boolean; side: boolean; compact: boolean; onFocus: () => void }) {
  return (
    <li className={cn('lens-caption col-start-1 row-start-1', side ? 'flex flex-col gap-5' : 'grid items-end gap-x-10 gap-y-3 lg:grid-cols-12', shown && 'is-shown')}>
      <div className={side ? undefined : 'lg:col-span-5'}>
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
      <p className={cn('max-w-[34rem] text-[0.92rem] leading-[1.6] text-pretty text-[#c9bda6]', !side && 'lg:col-span-4 lg:pb-1', compact && 'line-clamp-3')}>
        {project.summary}
        <span className="sr-only"> Pictured: {project.imageAlt}.</span>
      </p>
      <div className={side ? undefined : 'lg:col-span-3 lg:pb-1'}>
        {/* On a short screen the list of what it is built with is kept for screen readers and not shown */}
        <ul role="list" aria-label="Built with" className={compact ? 'sr-only' : 'flex flex-wrap gap-1.5'}>
          {project.stack.map((s) => (
            <li key={s} className={pill}>
              {s}
            </li>
          ))}
        </ul>
        <div className={compact ? undefined : 'mt-2'}>
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

  // Where the words go follows from where the scene puts the picture, which follows from the
  // shape of the screen: beside the picture where there is room, in the shadow under it where
  // there is not. `left` is how much of the width lies left of the picture and `middle` how
  // far down the screen the middle of the picture is, both 0..1; `under` is where the
  // navigation ends, in pixels. On a short screen there is not the height for all of the words
  // and a picture worth looking at, and the words are shortened (`compact`).
  const [place, setPlace] = useState({ side: false, compact: false, left: 0, middle: 0, under: 72 })
  const wordsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const pin = sectionRef.current?.querySelector<HTMLElement>('[data-lens-pin]')
    const box = wordsRef.current
    if (!pin || !box) return
    const measure = () => {
      const width = pin.clientWidth
      const height = Math.max(1, pin.clientHeight)
      const aspect = width / height
      const side = aspect >= SIDE_BY_SIDE
      // The navigation is so many pixels deep whatever the screen. (Held to a sensible range: it may be mid-move when this is read.)
      const bar = document.querySelector('header')?.firstElementChild?.getBoundingClientRect().bottom ?? 64
      const under = Math.min(96, Math.max(48, bar)) + 14
      // In the shadow the words need their own height, and a little more: toward the sides of the
      // screen the limb dips, and its line glows. Beside the picture they need none of it; there the
      // scene is only asked to keep some of the limb in view.
      const dip = 0.06 * width + 12
      lensTune = { ceiling: 1 - (2 * under) / height, shadow: side ? 0.08 : Math.min(0.5, (box.offsetHeight + dip) / height) }
      const picture = pictureBox(aspect, lensTune)
      // Decided by the height alone, not by whether the words fit as they stand: that would
      // depend on which layout is up, and flip back and forth
      const compact = height < (side ? 560 : 760)
      const next = { side, compact, left: (1 + picture.left) / 2, middle: (1 - (picture.top + picture.bottom) / 2) / 2, under }
      setPlace((prev) =>
        prev.side === next.side && prev.compact === next.compact && prev.left === next.left && prev.middle === next.middle && prev.under === next.under ? prev : next,
      )
    }
    measure()
    // The words change height when their type arrives or they wrap differently
    const observer = new ResizeObserver(measure)
    observer.observe(pin)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

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
        <div
          ref={wordsRef}
          className={
            place.side
              ? // Beside the picture, level with its middle: a box from under the navigation to as far below the
                // picture's middle as that is above it, with the words in the middle of it. On a short screen
                // the words are taller than the box, and then they start under the navigation and run down.
                // The sky is behind them here, so they carry a dark halo and their small print is lighter.
                'pointer-events-none absolute left-0 flex flex-col pr-10 pl-8 [text-shadow:0_0_16px_rgb(0_0_0/0.95),0_1px_3px_rgb(0_0_0/0.9)] lg:pr-14 lg:pl-14 [&_.lens-meta]:text-[#c9bda6]'
              : 'pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-14 lg:pb-10'
          }
          style={
            place.side
              ? { top: `${place.under}px`, height: `max(0px, calc(2 * (${place.middle * 100}% - ${place.under}px)))`, width: `${place.left * 100}%` }
              : undefined
          }
        >
          <h2 id="work-projects-title" className="sr-only">
            {WORK_INTRO.title}
          </h2>
          <ol role="list" className={place.side ? 'my-auto grid' : 'mx-auto grid max-w-[84rem]'}>
            {projects.map((p, i) => (
              <Words key={p.slug} project={p} index={i} shown={words.shown && words.index === i} side={place.side} compact={place.compact} onFocus={() => goTo(i)} />
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
 * above the black hole; the hole's shadow is the dark dome at the bottom of
 * the screen. The lens is the real one. Each project waits behind the hole,
 * where the lens makes a ring of it, and unrolls into its picture as you
 * scroll, coming to rest flat; its words sit beside it on a wide screen, and
 * in the shadow under it on a narrow one. After the last one the camera drops
 * the rest of the way and the sky closes overhead.
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
