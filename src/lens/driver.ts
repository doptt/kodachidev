import { scrollToTarget, trackProgress } from '@/motion/scroll'
import { DAMP } from '@/motion/tokens'
import { glide, lensTimeline, span, swipeBase, swipeTarget, type Glide } from './timeline'

/** How long the eased progress takes to catch up with the page, seconds. Matches the black hole's driver. */
const EASE = DAMP.scroll * 0.5

/**
 * Drives a pinned, scroll-driven stage: follows how far `section` has been
 * scrolled through (from its top reaching the top of the screen to its bottom
 * reaching the bottom), eases that, and hands it to `onProgress` (0..1) once a
 * frame while anything is changing, along with whether the stage is on screen:
 * from the moment it pins until its bottom edge has left. Where the section is
 * comes from ScrollTrigger. Returns a function that stops it.
 *
 * It also keeps the phase as it is drawn: scroll says which of the `count`
 * projects is wanted, and the sky glides there in its own time (see `glide`
 * in timeline.ts), so the driver goes on running after the page has stopped,
 * until the sky has too.
 *
 * Under a finger the stage is paged, one project to a swipe (see `swipeTarget`
 * in timeline.ts): while a touch and its momentum last the scene is told where
 * the page is headed, not where it is, and once the page has come to rest it
 * is put there. Nothing here runs without a touch, so a wheel, a trackpad and
 * the keyboard scroll it as they always did.
 */
export function startLensDriver(section: HTMLElement, count: number, onProgress: (p: number, pinned: boolean, phase: number) => void) {
  let raf = 0
  let last = 0
  let stopped = false
  let primed = false
  let target = 0
  let eased = 0
  let sky: Glide = { value: 0, velocity: 0 }
  // 0 before the stage pins, 1 once its bottom edge has left the screen
  let through = 0
  let leaving = 0

  // A swipe in progress: what it began on, and where the page was then (screens of pinned scroll)
  const total = span(count)
  let raw = 0
  let swipe: { base: number; from: number } | null = null
  let touching = false
  let idle = 0
  const told = () => (swipe ? swipeTarget(swipe.base, swipe.from, raw * total, count) / total : raw)
  const aim = () => {
    target = told()
    wake()
  }
  /** Puts the page `want` of the way through the stage. It is pinned, and what it shows goes by `want` already: nothing is seen to move. */
  const put = (want: number) => {
    if (!Number.isFinite(want) || want <= 0 || want >= 1) return
    const pin = section.querySelector<HTMLElement>('[data-lens-pin]')
    const top = section.getBoundingClientRect().top + window.scrollY
    const range = section.offsetHeight - (pin?.offsetHeight ?? window.innerHeight)
    scrollToTarget(top + range * want, { immediate: true })
  }
  /** The page has come to rest after a swipe: put it where the scene has been told it is. */
  const rest = () => {
    if (touching || !swipe || stopped) return
    const want = told()
    swipe = null
    if (raw > 0 && raw < 1 && Math.abs(want - raw) * total > 0.004) put(want)
    aim()
  }
  /**
   * A hard throw would carry the page on through the other projects and out of the stage before it
   * came to rest. Once the finger is off and the page has coasted this far past where the swipe was
   * headed, it is brought back there, which also ends the coasting.
   */
  const LEASH = 1.1
  let reined = 0
  const rein = () => {
    if (!swipe || touching) return
    const want = told()
    const now = performance.now()
    if (raw <= 0 || raw >= 1 || Math.abs(want - raw) * total < LEASH || now - reined < 90) return
    reined = now
    put(want)
  }
  // The page is at rest when it has been in the same place for three looks running, a third of a
  // second in all. Going by the place and not by a gap between scroll events: a long frame (the moon
  // being built further down the page takes a third of a second) leaves a gap while the page coasts on.
  let seenAt = 0
  let still = 0
  const watch = () => {
    idle = 0
    if (touching || !swipe || stopped) return
    still = window.scrollY === seenAt ? still + 1 : 0
    seenAt = window.scrollY
    if (still >= 2) rest()
    else idle = window.setTimeout(watch, 150)
  }
  const settleSoon = () => {
    if (idle) return
    seenAt = window.scrollY
    still = 0
    idle = window.setTimeout(watch, 150)
  }
  const onTouchStart = () => {
    // A second swipe before the first has died away starts from the project the first was headed for
    swipe = { base: swipeBase(told() * total, count), from: raw * total }
    touching = true
    window.clearTimeout(idle)
    idle = 0
    aim()
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length > 0) return
    touching = false
    settleSoon()
  }

  const step = (now: number) => {
    raf = 0
    if (stopped) return
    const dt = Math.min(last ? (now - last) / 1000 : 1 / 60, 0.1)
    last = now
    // The first frame after a jump goes straight there
    const k = primed ? 1 - Math.exp(-dt / EASE) : 1
    eased += (target - eased) * k
    const scrolled = Math.abs(target - eased) < 1e-4
    if (scrolled) eased = target

    const headed = lensTimeline(eased, count).phase
    sky = primed ? glide(sky, headed, dt) : { value: headed, velocity: 0 }
    const arrived = Math.abs(sky.value - headed) < 2e-4 && Math.abs(sky.velocity) < 2e-3
    if (arrived) sky = { value: headed, velocity: 0 }
    primed = true

    onProgress(eased, through > 0 && leaving < 1, sky.value)
    if (!scrolled || !arrived) raf = requestAnimationFrame(step)
    else last = 0
  }
  const wake = () => {
    if (!raf && !stopped) raf = requestAnimationFrame(step)
  }

  const stops = [
    trackProgress(section, 'top top', 'bottom bottom', (p) => {
      raw = p
      // Still moving: momentum after the finger has lifted counts as the same swipe
      if (swipe && !touching) {
        settleSoon()
        rein()
      }
      aim()
    }),
    // On screen from one pixel of pinned scroll...
    trackProgress(section, 'top 1px', 'top top', (p) => {
      through = p
      wake()
    }),
    // ...until the bottom edge has gone out through the top
    trackProgress(section, 'bottom bottom', 'bottom top', (p) => {
      leaving = p
      wake()
    }),
  ]
  wake()
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchend', onTouchEnd, { passive: true })
  window.addEventListener('touchcancel', onTouchEnd, { passive: true })

  return () => {
    stopped = true
    window.clearTimeout(idle)
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('touchcancel', onTouchEnd)
    if (raf) cancelAnimationFrame(raf)
    for (const stop of stops) stop()
  }
}
