import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { PROJECTS, WORK_INTRO, type Project } from '@/content/projects'
import { startLensDriver } from '@/lens/driver'
import { RING_KEEP, createRings } from '@/lens/ring'
import { attachSwipe, frameTime, framing } from '@/lens/swipe'
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

type View = { image: string; imageAlt: string; label: string }
/** What a project's first picture is called among its views: every one of them is its home page. */
const FIRST_VIEW = 'Home'
/** Every project's views, its first picture and then the further ones: the cards of its ring. */
const views: readonly (readonly View[])[] = projects.map((p) => [{ image: p.image, imageAlt: p.imageAlt, label: FIRST_VIEW }, ...(p.more ?? [])])
const more = projects.map((p) => (p.more ?? []).map((m) => m.image))

/** Scroll progress through the pinned stage, 0..1. Written by the section, read by the scene every frame. */
let lensProgress = 0
/** Which project the sky is on, as drawn: glided by the driver from one to the next. Unset until the driver has run. */
let lensPhase: number | undefined
/**
 * Each project's ring of cards: where it has been turned to. Written by the
 * section as the visitor drags, clicks or uses the controls; read by the scene
 * every frame. React hears only when the card in the middle changes.
 */
const rings = createRings(views.map((v) => v.length))

/**
 * Registers the lensed sky with the stage. The scene's code, shaders and
 * renderer are a separate chunk, fetched the first time the stage is asked for
 * the scene. Above the black hole's stage in priority, so it takes over the
 * moment the two overlap at the hand-over.
 */
function defineLensScene() {
  stage.define(
    'lens',
    async (ctx) =>
      (await import('@/lens/scene')).createLensScene({
        progress: () => lensProgress,
        phase: () => lensPhase,
        images,
        more,
        ring: (i) => rings.read(i, frameTime()),
        held: rings.holding,
      })(ctx),
    { priority: 2 },
  )
}

/** How the stars over the end of the fall start out. One object, so React never writes over what the driver has set since. */
const STARS_UNSEEN = { display: 'none', opacity: 0 } as const

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
function Words({
  project,
  index,
  shown,
  card,
  under,
  onFocus,
  onPick,
}: {
  project: Project
  index: number
  shown: boolean
  /** Which of the project's views is in the middle of its ring. */
  card: number
  /** How far down the screen the bottom of the picture is, 0..1. */
  under: number
  onFocus: () => void
  onPick: (card: number) => void
}) {
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
      {views[index].length > 1 && <Views name={project.name} list={views[index]} shown={shown} card={card} under={under} onFocus={onFocus} onPick={onPick} />}
    </li>
  )
}

const arrow =
  // Under a finger the target reaches past the circle that is drawn, to 44px
  'relative grid size-8 place-items-center rounded-full pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-[\'\'] bg-black/30 text-bh-highlight shadow-[inset_0_0_0_1px_rgb(188_166_142/0.3)] transition-[box-shadow,opacity] duration-(--duration-base) ease-(--ease-glass) hover:shadow-[inset_0_0_0_1px_rgb(255_237_193/0.7)] focus-ring aria-disabled:opacity-35 aria-disabled:hover:shadow-[inset_0_0_0_1px_rgb(188_166_142/0.3)]'

/**
 * The controls for a project's ring of cards, set just under its picture:
 * back, a dot for each view, on, and the name of the view in the middle. They
 * do with buttons what a drag across the sky does, so the keyboard and
 * assistive technology reach every view: the arrow keys turn the ring from any
 * of them, and each dot carries its view's name and the description of its
 * picture. The dots are one stop in the tab order, as a row of tabs is.
 */
function Views({
  name,
  list,
  shown,
  card,
  under,
  onFocus,
  onPick,
}: {
  name: string
  list: readonly View[]
  shown: boolean
  card: number
  under: number
  onFocus: () => void
  onPick: (card: number) => void
}) {
  const dots = useRef<(HTMLButtonElement | null)[]>([])
  const last = list.length - 1
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = e.key === 'ArrowRight' ? card + 1 : e.key === 'ArrowLeft' ? card - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (to === null || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    const next = Math.min(last, Math.max(0, to))
    onPick(next)
    // Among the dots, focus goes with the view
    if ((e.target as HTMLElement).dataset.dot !== undefined) dots.current[next]?.focus()
  }

  return (
    // A line across the screen with no height of its own, a little under the picture; the controls hang from it
    <div className="lens-views absolute inset-x-0 flex h-0 justify-center" style={{ bottom: `calc(${((1 - under) * 100).toFixed(2)}lvh - 1.1rem)` }}>
      <div
        role="group"
        aria-label={`Views of ${name}`}
        onKeyDown={onKeyDown}
        className={cn('grid h-max justify-items-center gap-1.5', shown && 'pointer-events-auto')}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={card > 0 ? `Previous view: ${list[card - 1].label}` : 'Previous view'}
            aria-disabled={card === 0}
            tabIndex={shown ? 0 : -1}
            onFocus={onFocus}
            onClick={() => card > 0 && onPick(card - 1)}
            className={arrow}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <ol role="list" className="flex items-center">
            {list.map((v, j) => (
              <li key={v.image} className="flex">
                <button
                  ref={(el) => {
                    dots.current[j] = el
                  }}
                  type="button"
                  data-dot
                  aria-label={`${v.label}, view ${j + 1} of ${list.length}`}
                  aria-current={j === card ? 'true' : undefined}
                  aria-describedby={`view-${slug}-${j}`}
                  tabIndex={j === card ? 0 : -1}
                  onFocus={onFocus}
                  onClick={() => onPick(j)}
                  className="lens-dot relative grid size-6 place-items-center rounded-full pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:inset-x-0 pointer-coarse:after:content-[''] focus-ring"
                >
                  <i aria-hidden="true" className="block size-1.5 rounded-full bg-bh-highlight" />
                </button>
                <span id={`view-${slug}-${j}`} className="sr-only">
                  {v.imageAlt}
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            aria-label={card < last ? `Next view: ${list[card + 1].label}` : 'Next view'}
            aria-disabled={card === last}
            tabIndex={shown ? 0 : -1}
            onFocus={onFocus}
            onClick={() => card < last && onPick(card + 1)}
            className={arrow}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {/* The name of the view in the middle. All of them are stacked in one place; one shows. */}
        <p aria-hidden="true" className="grid justify-items-center font-mono text-[0.68rem] tracking-[0.14em] whitespace-nowrap text-bh-accent uppercase">
          {list.map((v, j) => (
            <span key={v.image} className={cn('lens-view-name col-start-1 row-start-1', j === card && 'is-shown')}>
              {v.label}
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}

/**
 * The pinned stage. The sky itself is drawn on the site's one canvas, fixed
 * behind the page (see src/stage); this section is the stretch of scroll that
 * drives it, and the words laid over it.
 */
function Stage() {
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const swipeRef = useRef<HTMLDivElement>(null)
  const starsRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [words, setWords] = useState({ index: 0, shown: false })
  /** Which card is in the middle of each project's ring. */
  const [middle, setMiddle] = useState<readonly number[]>(() => projects.map(() => 0))
  /** The view last turned to, said aloud for those who cannot see the sky. */
  const [said, setSaid] = useState('')
  /** The project whose ring can be turned just now, or -1. Kept by the driver, read by the pointer's handlers. */
  const turnable = useRef(-1)
  const count = projects.length

  const showCard = useCallback((project: number, card: number) => {
    setMiddle((prev) => (prev[project] === card ? prev : prev.map((v, i) => (i === project ? card : v))))
  }, [])
  /** The visitor has turned a ring: the page follows, and says where it is. */
  const turned = useCallback(
    (project: number, card: number) => {
      showCard(project, card)
      const list = views[project]
      setSaid(`${projects[project].name}: ${list[card].label}, view ${card + 1} of ${list.length}`)
    },
    [showCard],
  )
  const pick = (project: number, card: number) => {
    rings.goTo(project, card, performance.now())
    turned(project, rings.card(project))
  }

  // Scroll → progress. The scene reads it every frame; React only hears when the words change.
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    let starlight: number | undefined
    return startLensDriver(section, count, (p, isPinned, phase) => {
      lensProgress = p
      lensPhase = phase
      setPinned(isPinned)
      const frame = lensTimeline(p, count)
      // The words go by the sky as drawn, so they come up as the picture arrives, not when it sets off
      const next = caption({ ...frame, phase }, count)
      setWords((prev) => (prev.index === next.index && prev.shown === next.shown ? prev : next))
      // A ring can be turned while its project is up and its cards are out. If the sky moves on
      // under a drag, the drag is over: the ring settles on the card nearest the middle.
      const can = next.shown && frame.fall <= 0 ? next.index : -1
      if (can !== turnable.current) {
        const was = turnable.current
        turnable.current = can
        if (was >= 0) {
          rings.releaseAll(performance.now())
          showCard(was, rings.card(was))
        }
      }
      // A project that has gone out of sight goes back to its first picture
      for (let i = 0; i < count; i++) {
        if (rings.away(i) && Math.abs(phase - i) > RING_KEEP) {
          rings.reset(i)
          showCard(i, 0)
        }
      }
      // The stars over the black the fall ends in. Written straight onto their one element: it changes
      // on every frame of the scroll, which is no business of React's or of anything else in the stage.
      const stars = starsRef.current
      if (stars && frame.beyond !== starlight) {
        // Out of the page altogether until they are wanted, so their canvas is not drawn under the projects
        if (starlight === undefined || frame.beyond > 0 !== starlight > 0) stars.style.display = frame.beyond > 0 ? 'block' : 'none'
        stars.style.opacity = frame.beyond.toFixed(3)
        starlight = frame.beyond
      }
    })
  }, [count, showCard])

  // Focus inside a project's words keeps them up (see .lens-caption). Once another project has settled,
  // focus left behind in the last one's controls or link is let go, so its words do not stay over the new ones.
  useEffect(() => {
    const focused = document.activeElement
    const captions = sectionRef.current?.querySelectorAll('.lens-caption')
    if (!(focused instanceof HTMLElement) || !captions) return
    captions.forEach((el, i) => {
      if (!el.contains(focused)) return
      // Focus a click left there goes as soon as the sky moves on; focus the keyboard put there stays
      // until the next project is up, since tabbing to a project is what brings it up
      if (words.shown ? i !== words.index : !focused.matches(':focus-visible')) focused.blur()
    })
  }, [words.index, words.shown])

  // Dragging across the sky at the height of the pictures turns the ring of the project that is up
  useEffect(() => {
    const el = swipeRef.current
    const pin = pinRef.current
    if (!el || !pin) return
    return attachSwipe(el, { rings, project: () => turnable.current, bounds: () => pin.getBoundingClientRect(), onCard: turned })
  }, [turned])

  // Where the picture is on screen, for laying the page's own parts round it: only the shape of the screen changes it
  const [shape, setShape] = useState(() => (window.innerWidth / Math.max(1, window.innerHeight)).toFixed(3))
  useEffect(() => {
    const pin = pinRef.current
    if (!pin) return
    const ro = new ResizeObserver(() => setShape((pin.offsetWidth / Math.max(1, pin.offsetHeight)).toFixed(3)))
    ro.observe(pin)
    return () => ro.disconnect()
  }, [])
  const box = useMemo(() => framing(Number(shape)).box, [shape])
  // Down the screen, 0..1: the picture's top and bottom, and the band across the sky that takes the drag
  const top = (1 - box.top) / 2
  const bottom = (1 - box.bottom) / 2
  const slack = 0.1 * (bottom - top)

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
      <div ref={pinRef} data-lens-pin className="sticky top-0 h-lvh overflow-clip">
        {/*
          The fall ends with the sky gone out over the top and the screen black. The stars of the page
          that follows come up in that black (the driver sets how far, see above), so the stage hands
          over to "How I work" with the same thin scatter already on screen, and scrolls away with it.
        */}
        <div ref={starsRef} data-lens-beyond aria-hidden="true" className="pointer-events-none absolute inset-0" style={STARS_UNSEEN}>
          <StarField seed={0x3c41} />
        </div>
        {/*
          The band of sky the pictures stand in. Pressing here and dragging sideways turns the ring of
          cards; a finger moving up or down still scrolls the page (touch-action), and so does the wheel.
          It is there only while a project with more than one view is up, and stops short of the navigation.
        */}
        <div
          ref={swipeRef}
          data-lens-swipe
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 cursor-grab touch-pan-y select-none data-dragging:cursor-grabbing',
            !(words.shown && views[words.index].length > 1) && 'pointer-events-none',
          )}
          style={{ top: `max(4.75rem, ${((top - slack) * 100).toFixed(2)}%)`, bottom: `${((1 - bottom - slack) * 100).toFixed(2)}%` }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-[calc(max(1.75rem,env(safe-area-inset-bottom))+var(--bar-gap))] sm:px-8 lg:px-14 lg:pb-10">
          <h2 id="work-projects-title" className="sr-only">
            {WORK_INTRO.title}
          </h2>
          <ol role="list" className="mx-auto grid max-w-[84rem]">
            {projects.map((p, i) => (
              <Words
                key={p.slug}
                project={p}
                index={i}
                shown={words.shown && words.index === i}
                card={middle[i]}
                under={bottom}
                onFocus={() => goTo(i)}
                onPick={(card) => pick(i, card)}
              />
            ))}
          </ol>
          <p aria-live="polite" className="sr-only">
            {said}
          </p>
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
              {views[i].length > 1 ? (
                // The project's views in a row that scrolls sideways and stops on each: the first, then the further ones
                <ul
                  role="list"
                  aria-label={`Views of ${p.name}`}
                  tabIndex={0}
                  className="-m-1 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain p-1 pb-3 [scrollbar-color:rgb(188_166_142/0.45)_transparent] [scrollbar-width:thin] focus-ring lg:col-span-8"
                >
                  {views[i].map((v, j) => (
                    <li key={v.image} className="w-[88%] shrink-0 snap-center first:snap-start last:snap-end">
                      <figure>
                        <img
                          src={v.image}
                          alt={v.imageAlt}
                          width={1600}
                          height={1000}
                          loading="lazy"
                          decoding="async"
                          className="block aspect-[16/10] w-full rounded-glass-sm object-cover object-top shadow-[0_0_0_1px_rgb(255_237_193/0.35)]"
                        />
                        <figcaption className={cn(meta, 'mt-2.5')}>
                          {j + 1} of {views[i].length}
                          <span className="mx-2 text-bh-ember" aria-hidden="true">
                            /
                          </span>
                          {v.label}
                        </figcaption>
                      </figure>
                    </li>
                  ))}
                </ul>
              ) : (
                <img
                  src={p.image}
                  alt={p.imageAlt}
                  width={1600}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                  className="block aspect-[16/10] w-full rounded-glass-sm object-cover object-top shadow-[0_0_0_1px_rgb(255_237_193/0.35),0_0_60px_-20px_rgb(255_237_193/0.35)] lg:col-span-8"
                />
              )}
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
 * screen and its edge is the horizon, a band of tan light with streaks
 * running under it. Scrolling sends the sky on: the settled picture leaves
 * over the top and the next comes up over the horizon, pressed flat by the
 * lens, and unrolls into place; its words sit in the shadow underneath. After
 * the last one the camera drops toward the hole and then sinks into the dark:
 * the horizon goes out over the top, and the stars of the next section come up.
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
