import { trackProgress } from '@/motion/scroll'
import { DAMP } from '@/motion/tokens'
import { glide, lensTimeline, type Glide } from './timeline'

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
