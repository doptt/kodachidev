import { DAMP, DURATION, damp, easeInOut } from '@/motion/tokens'
import { SETTLED_AT } from './timeline'

/**
 * Scroll, for the moon. This file is the only place the section reads or
 * writes the page's scroll position: `read` and `scrollTo` below are what to
 * swap when the page's scrolling changes hands.
 */

/** How far into the settled stretch a jump lands: far enough that a nudge of the wheel does not unsettle the view. */
const LANDING = SETTLED_AT + (1 - SETTLED_AT) * 0.3

/** How far `section` (the tall, pinned one) has been scrolled through, 0..1. */
function read(section: HTMLElement) {
  const rect = section.getBoundingClientRect()
  // The pinned child is one "large viewport" tall; measure it rather than assume
  const pin = section.querySelector<HTMLElement>('[data-moon-pin]')
  const span = Math.max(1, rect.height - (pin?.offsetHeight || window.innerHeight))
  return Math.min(1, Math.max(0, -rect.top / span))
}

/** Puts the page where `section` is `progress` of the way through. */
function scrollTo(section: HTMLElement, progress: number) {
  const pin = section.querySelector<HTMLElement>('[data-moon-pin]')
  const top = section.getBoundingClientRect().top + window.scrollY
  const span = Math.max(1, section.offsetHeight - (pin?.offsetHeight || window.innerHeight))
  window.scrollTo({ top: top + span * progress, behavior: 'instant' })
}

export type MoonDriver = {
  /**
   * Goes to the settled view. The page jumps there; the camera does not: it
   * flies the whole path, from the black before the opening shot to the
   * settled frame, in its own time. With `instant` (reduced motion) it is
   * simply there.
   */
  flyTo(instant?: boolean): void
  /** Jumps to the settled view if the page is not there already (a pin has been focused from the keyboard). */
  settle(): void
  stop(): void
}

/**
 * Drives the moon from scroll: reads how far `section` has been scrolled
 * through, eases that, and hands it to `onProgress` (0..1) once a frame. Runs
 * only while the section is near the viewport. `ready` says whether the scene
 * is being drawn yet: a flight waits for it, so that it is seen.
 */
export function startMoonDriver(section: HTMLElement, onProgress: (p: number) => void, ready: () => boolean = () => true): MoonDriver {
  let raf = 0
  let last = 0
  let near = false
  let stopped = false
  let primed = false
  let eased = 0
  /** A flight in progress: the camera's own time, not the scrollbar's. */
  let flight: { from: number; t: number; seconds: number } | null = null

  const step = (now: number) => {
    raf = 0
    if (stopped) return
    const dt = Math.min(last ? (now - last) / 1000 : 1 / 60, 0.1)
    last = now
    const target = read(section)
    if (flight) {
      if (ready()) flight.t += dt / flight.seconds
      eased = flight.from + (target - flight.from) * easeInOut(Math.min(1, flight.t))
      if (flight.t >= 1) flight = null
    } else {
      // The first frame after a jump goes straight there
      eased = primed ? damp(eased, target, DAMP.scroll, dt) : target
    }
    primed = true
    const settled = !flight && Math.abs(target - eased) < 1e-4
    if (settled) eased = target
    onProgress(eased)
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
  // A jump from far away (a nav link, the keyboard) may skip the observer's margin
  window.addEventListener('scroll', wake, { passive: true })
  window.addEventListener('resize', wake)
  wake()

  return {
    flyTo(instant = false) {
      const from = read(section)
      // Already somewhere in the section: carry on from here. From anywhere else: from the top, out of the black.
      const inside = from > 0 && from < 1
      scrollTo(section, LANDING)
      if (instant) primed = false
      else flight = { from: inside ? eased : 0, t: 0, seconds: DURATION.scene * (inside ? 1 : 1.6) }
      wake()
    },
    settle() {
      if (read(section) >= SETTLED_AT) return
      scrollTo(section, LANDING)
      primed = false
      wake()
    },
    stop() {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('scroll', wake)
      window.removeEventListener('resize', wake)
    },
  }
}
