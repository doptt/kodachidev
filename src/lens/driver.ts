import { trackProgress } from '@/motion/scroll'
import { DAMP } from '@/motion/tokens'

/** How long the eased progress takes to catch up with the page, seconds. Matches the black hole's driver. */
const EASE = DAMP.scroll * 0.5

/**
 * Drives a pinned, scroll-driven stage: follows how far `section` has been
 * scrolled through (from its top reaching the top of the screen to its bottom
 * reaching the bottom), eases that, and hands it to `onProgress` (0..1) once a
 * frame while it is changing, along with whether the stage is on screen: from
 * the moment it pins until its bottom edge has left. Where the section is
 * comes from ScrollTrigger. Returns a function that stops it.
 */
export function startLensDriver(section: HTMLElement, onProgress: (p: number, pinned: boolean) => void) {
  let raf = 0
  let last = 0
  let stopped = false
  let primed = false
  let target = 0
  let eased = 0
  // 0 before the stage pins, 1 once its bottom edge has left the screen
  let through = 0
  let leaving = 0

  const step = (now: number) => {
    raf = 0
    if (stopped) return
    const dt = Math.min(last ? (now - last) / 1000 : 1 / 60, 0.1)
    last = now
    // The first frame after a jump goes straight there
    const k = primed ? 1 - Math.exp(-dt / EASE) : 1
    primed = true
    eased += (target - eased) * k
    const settled = Math.abs(target - eased) < 1e-4
    if (settled) eased = target
    onProgress(eased, through > 0 && leaving < 1)
    if (!settled) raf = requestAnimationFrame(step)
    else last = 0
  }
  const wake = () => {
    if (!raf && !stopped) raf = requestAnimationFrame(step)
  }

  const stops = [
    trackProgress(section, 'top top', 'bottom bottom', (p) => {
      target = p
      wake()
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

  return () => {
    stopped = true
    if (raf) cancelAnimationFrame(raf)
    for (const stop of stops) stop()
  }
}
