import { trackProgress } from '@/motion/scroll'
import { DAMP } from '@/motion/tokens'
import { publish, reset } from './state'
import { LEAD, derive, type Release, type ScrollPosition } from './timeline'

/**
 * How long the eased progress takes to catch up with the page, seconds. The
 * wheel is already smoothed by Lenis; this is the little that is left so that
 * touch scrolling and the scrollbar, which are not, do not look stepped.
 */
const EASE = DAMP.scroll * 0.5

/**
 * What lets go as the sequence scrolls away. Everything after the black hole
 * is set in the same dark (the lensed sky, then the rest of the page down to
 * the moon), so the black page is held. The UI that dimmed for the fall comes
 * back, in its cream colours.
 */
const RELEASE_AFTER: Release = { theme: false, dim: true }

/**
 * Drives the sequence from scroll: follows where `section` (the pinned stage)
 * and `runIn` (the stretch of page before it where the background fades to
 * black) are, eases that, and publishes the result. Where they are comes from
 * ScrollTrigger; the four stretches below are the same ones `scrollPosition`
 * in timeline.ts describes. Runs a frame loop only while there is easing left
 * to do. Returns a function that stops it and restores the page.
 */
export function startDriver(section: HTMLElement, runIn: HTMLElement, opts: { reducedMotion: boolean }) {
  let raf = 0
  let last = 0
  let stopped = false
  let primed = false
  const target: ScrollPosition = { fade: 0, enter: 0, pin: 0, exit: 0 }
  const eased: ScrollPosition = { fade: 0, enter: 0, pin: 0, exit: 0 }

  const step = (now: number) => {
    raf = 0
    if (stopped) return
    const dt = Math.min(last ? (now - last) / 1000 : 1 / 60, 0.1)
    last = now
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
      Math.abs(target.enter - eased.enter) < 1e-4 &&
      Math.abs(target.pin - eased.pin) < 1e-4 &&
      Math.abs(target.exit - eased.exit) < 1e-4
    if (!settled) raf = requestAnimationFrame(step)
    else last = 0
  }

  const wake = () => {
    if (!raf && !stopped) raf = requestAnimationFrame(step)
  }
  const follow = (key: keyof ScrollPosition) => (value: number) => {
    target[key] = value
    wake()
  }

  const stops = [
    // The run-in: from its top edge halfway up the screen, to its bottom edge about to come into view
    trackProgress(runIn, 'top 50%', 'bottom 95%', follow('fade')),
    // The approach: from the top of the stage LEAD screens below the top of the screen, to pinned
    trackProgress(section, `top ${LEAD * 100}%`, 'top top', follow('enter')),
    trackProgress(section, 'top top', 'bottom bottom', follow('pin')),
    // Leaving: from its bottom edge at the bottom of the screen, to gone
    trackProgress(section, 'bottom bottom', 'bottom top', follow('exit')),
  ]
  if (opts.reducedMotion) document.documentElement.dataset.bhReduced = 'true'
  wake()

  return () => {
    stopped = true
    if (raf) cancelAnimationFrame(raf)
    for (const stop of stops) stop()
    delete document.documentElement.dataset.bhReduced
    reset()
  }
}
