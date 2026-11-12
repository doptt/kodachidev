import { publish, reset } from './state'
import { derive, scrollPosition, type ScrollPosition } from './timeline'

/** How long the eased progress takes to catch up with the scrollbar, seconds. */
const EASE = 0.17

/**
 * TEMPORARY BRIDGE. Nothing follows the black screen yet, so as the sequence
 * scrolls away the page below simply comes back as it was: the theme and the
 * dim both release while the bottom of the section crosses the viewport. Set
 * this to false to hold the gold/black state past the end instead, which is
 * what the next scene will want to start from.
 */
const RELEASE_AFTER = true

/**
 * Drives the sequence from scroll: reads where `section` (the pinned stage)
 * and `runIn` (the stretch of page before it where the background fades to
 * black) are, eases that, and publishes the result. Runs a frame loop only while the section is near the
 * viewport. Returns a function that stops it and restores the page.
 */
export function startDriver(section: HTMLElement, runIn: HTMLElement, opts: { reducedMotion: boolean }) {
  let raf = 0
  let last = 0
  let near = false
  let stopped = false
  let primed = false
  const eased: ScrollPosition = { fade: 0, enter: 0, pin: 0, exit: 0 }

  const read = () => {
    const rect = section.getBoundingClientRect()
    // The stage is one "large viewport" tall; measure it rather than assume
    const stage = section.firstElementChild as HTMLElement | null
    const lead = runIn.getBoundingClientRect()
    return scrollPosition(rect.top, rect.height, stage?.offsetHeight || window.innerHeight, lead.top, lead.height)
  }

  const step = (now: number) => {
    raf = 0
    if (stopped) return
    const dt = Math.min(last ? (now - last) / 1000 : 1 / 60, 0.1)
    last = now
    const target = read()
    // Reduced motion and the first frame after a jump: no easing, go straight there
    const k = opts.reducedMotion || !primed ? 1 : 1 - Math.exp(-dt / EASE)
    primed = true
    eased.fade += (target.fade - eased.fade) * k
    eased.enter += (target.enter - eased.enter) * k
    eased.pin += (target.pin - eased.pin) * k
    eased.exit += (target.exit - eased.exit) * k

    const out = derive(eased, RELEASE_AFTER)
    // Reduced motion swaps the theme at the halfway point; CSS crossfades it
    if (opts.reducedMotion) out.theme = out.theme >= 0.5 ? 1 : 0
    publish(out)

    const settled =
      Math.abs(target.fade - eased.fade) < 1e-4 &&
      Math.abs(target.enter - eased.enter) < 1e-4 && Math.abs(target.pin - eased.pin) < 1e-4 && Math.abs(target.exit - eased.exit) < 1e-4
    // Keep ticking while there is easing left to do or the section is close by
    if (near || !settled) raf = requestAnimationFrame(step)
    else last = 0
  }

  const wake = () => {
    if (!raf && !stopped) raf = requestAnimationFrame(step)
  }

  const io = new IntersectionObserver(
    (entries) => {
      near = entries.some((e) => e.isIntersecting)
      if (near) wake()
    },
    { rootMargin: '100% 0px' },
  )
  io.observe(section)
  io.observe(runIn)
  // A jump from far away (a nav link, the keyboard) may skip the observer's margin
  window.addEventListener('scroll', wake, { passive: true })
  window.addEventListener('resize', wake)
  if (opts.reducedMotion) document.documentElement.dataset.bhReduced = 'true'
  wake()

  return () => {
    stopped = true
    if (raf) cancelAnimationFrame(raf)
    io.disconnect()
    window.removeEventListener('scroll', wake)
    window.removeEventListener('resize', wake)
    delete document.documentElement.dataset.bhReduced
    reset()
  }
}
