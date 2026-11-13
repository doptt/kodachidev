import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { blackHole, type BlackHoleSnapshot } from '@/blackhole/state'
import { startDriver } from '@/blackhole/driver'
import { StarField } from '@/blackhole/StarField'
import { NoiseBackground } from '@/components/effects/NoiseBackground'
import { WORK_INTRO } from '@/content/projects'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'
import { AboutSpace } from './AboutSpace'

// The scene, its shaders and the renderer stay out of the main bundle
const BlackHoleScene = lazy(() => import('@/blackhole/BlackHoleScene'))

const FALLBACK = '/work/blackhole.jpg'
/** The moving border of the button: the black hole's two colours and the site's periwinkle. */
const NOISE_COLORS = ['rgb(255, 237, 193)', 'rgb(142, 150, 255)', 'rgb(188, 166, 142)']

type Mode = 'pending' | 'live' | 'fallback'

export type WorkIntroProps = {
  /** Fires the moment the screen has gone fully black. */
  onEntered?: (state: BlackHoleSnapshot) => void
  /** Fires when the user scrolls back up out of the black. */
  onExited?: (state: BlackHoleSnapshot) => void
  /** Fires on every change of progress, theme or dim (at most once a frame). */
  onProgress?: (state: BlackHoleSnapshot) => void
}

/**
 * Caption over the idle black hole, in the dark corner below the disk: a few
 * words and the way on to the projects. It is up while the scene idles and
 * leaves as the fall begins.
 *
 * It is always rendered (faded out, and inert so it is out of the tab order),
 * so that showing it is only a change of opacity. And it keeps its own state:
 * the moment it appears, nothing else on the page has to re-render.
 */
function Caption({ reduced }: { reduced: boolean }) {
  const [shown, setShown] = useState(false)
  useEffect(() => blackHole.subscribe((s) => setShown(s.intro > 0.02)), [])
  return (
    <div
      inert={!shown}
      className={cn(
        'bh-intro absolute bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] left-5 z-10 max-w-[23rem] sm:left-8 md:bottom-16 lg:left-14',
        // A soft pool of shadow behind the words, for narrow screens where the disk reaches into this corner
        'before:absolute before:-inset-x-10 before:-inset-y-8 before:-z-10 before:bg-[radial-gradient(closest-side,rgb(0_0_0/0.78),rgb(0_0_0/0.5)_60%,transparent)]',
        !shown && 'pointer-events-none',
      )}
    >
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-bh-accent">{WORK_INTRO.eyebrow}</p>
      <p className="mt-3 font-hero text-[clamp(1.9rem,1.3rem+2.1vw,3.1rem)] leading-[1.04] tracking-[-0.02em] text-bh-highlight">
        {WORK_INTRO.title}
      </p>
      <p className="mt-3 text-[0.95rem] leading-[1.6] text-pretty text-[#c9bda6]">{WORK_INTRO.lede}</p>
      <NoiseBackground
        containerClassName="mt-6 w-fit rounded-full p-1.5"
        gradientColors={NOISE_COLORS}
        noiseIntensity={0.3}
        animating={shown && !reduced}
      >
        <a
          href="#work-projects"
          className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-linear-to-b from-[#fff6de] to-bh-highlight px-6 font-nav text-[0.95rem] text-navy-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_1px_2px_rgb(0_0_0/0.5)] transition-transform duration-(--duration-base) ease-(--ease-glass) hover:scale-[1.02] active:scale-[0.98] focus-ring"
        >
          See more
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M8 3v10M4 9l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </NoiseBackground>
    </div>
  )
}

/**
 * The way into the Work section, in three parts down the page:
 *
 *   1. a run-in of nothing but the page's background, where it fades to black
 *      and the first stars drift in;
 *   2. About, set in that dark (see AboutSpace);
 *   3. the black hole: the page pins on it, with a short caption and a button
 *      while it idles, and scrolling falls into it until the screen is black.
 *
 * What follows the black screen is the lensed sky (LensedWork), which pins the
 * moment this stage lets go. `onEntered` (or `blackHole` from
 * '@/blackhole/state') still reports the moment of black. The black hole itself
 * is decoration and hidden from assistive tech; the caption and button are
 * not. Without WebGL, or on a device that can't run it, a still stands in and
 * fades to black over the same scroll.
 */
export function WorkIntro({ onEntered, onExited, onProgress }: WorkIntroProps) {
  const runInRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const [near, setNear] = useState(false)
  const [mode, setMode] = useState<Mode>('pending')

  // Scroll → progress, theme and dim, published to CSS and to `blackHole`
  useEffect(() => {
    const section = sectionRef.current
    const runIn = runInRef.current
    if (!section || !runIn) return
    return startDriver(section, runIn, { reducedMotion: reduced })
  }, [reduced])

  // Load the scene ahead of time: once the page has been idle for a few seconds
  // after loading, or when it is about to scroll into view, whichever is first.
  // Starting it costs a moment (a WebGL context, its render targets), and that
  // moment is better spent while the visitor is reading than in mid-scroll.
  useEffect(() => {
    const section = sectionRef.current
    if (!section || near) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true)
      },
      { rootMargin: '250% 0px' },
    )
    io.observe(section)
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1))
    const timer = saveData ? 0 : window.setTimeout(() => idle(() => setNear(true)), 3500)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
    }
  }, [near])

  // Hand-off hooks
  const hooks = useRef({ onEntered, onExited, onProgress })
  hooks.current = { onEntered, onExited, onProgress }
  useEffect(() => {
    const offs = [
      blackHole.onEntered((s) => hooks.current.onEntered?.(s)),
      blackHole.onExited((s) => hooks.current.onExited?.(s)),
      blackHole.subscribe((s) => hooks.current.onProgress?.(s)),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  const progress = useCallback(() => blackHole.progress, [])
  const arrive = useCallback(() => blackHole.arrive, [])
  const onLive = useCallback(() => setMode('live'), [])
  const onFail = useCallback(() => setMode('fallback'), [])

  const forceStill = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nogl')
  const useImage = mode === 'fallback' || forceStill
  // The reduced-motion canvas and the still image don't animate their own way to black
  const needsCover = reduced || useImage

  return (
    <>
      {/*
        Run-in: a stretch of nothing but the page's own background, after the
        section above. This is where the page fades to black (the driver times
        the fade against this element), so the fade has the screen to itself.
      */}
      <div
        ref={runInRef}
        aria-hidden="true"
        data-bg-scene="blackhole"
        className={cn('relative', reduced ? 'h-[60lvh]' : 'h-[150lvh]')}
      >
        {/* Stars scroll up into view over the second half of that fade, thin at first */}
        <div className={cn('absolute inset-x-0 bottom-0', reduced ? 'h-[45lvh]' : 'h-[100lvh]')}>
          <StarField seed={0x51a7} className="bh-stars-runin" />
        </div>
      </div>

      <AboutSpace />

      <div
        ref={sectionRef}
        id="work"
        data-bh-stage
        data-bh-vars="arrive intro fade cue"
        data-bh-mode={useImage ? 'fallback' : mode}
        data-bg-scene="blackhole"
        className={cn('relative', reduced ? 'h-[240lvh]' : 'h-[600lvh]')}
      >
        {/* No background of its own: the page shows through wherever the scene is empty */}
        <div className="bh-stage sticky top-0 h-lvh overflow-clip">
          {/* The same scatter of stars carries on behind the black hole, and pins with it */}
          <StarField seed={0x2f09} className="bh-stars-stage" vars="theme dim progress" />

          {useImage ? (
            <img
              src={FALLBACK}
              alt=""
              decoding="async"
              loading="lazy"
              draggable={false}
              className="bh-scene absolute inset-0 size-full select-none object-cover object-[50%_42%]"
            />
          ) : (
            near && (
              <Suspense fallback={null}>
                <div aria-hidden="true" className="bh-scene absolute inset-0">
                  <div
                    className={cn(
                      'absolute inset-0 transition-opacity duration-[900ms] ease-out',
                      mode === 'live' ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    <BlackHoleScene progress={progress} arrive={arrive} still={reduced} onLive={onLive} onFail={onFail} />
                  </div>
                </div>
              </Suspense>
            )
          )}

          {needsCover && <div aria-hidden="true" className="absolute inset-0 bg-black" style={{ opacity: 'var(--bh-fade, 0)' }} />}

          <Caption reduced={reduced} />

          <div
            aria-hidden="true"
            className="bh-cue pointer-events-none absolute inset-x-0 bottom-[max(2.25rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3"
          >
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-bh-accent [text-shadow:0_0_14px_rgb(0_0_0/0.9)]">
              Scroll to enter
            </span>
            <span className="relative h-9 w-px overflow-hidden bg-bh-accent/20">
              <span className="bh-cue-line absolute inset-x-0 top-0 h-1/2 bg-bh-highlight" />
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
