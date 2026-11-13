import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { easeInOut } from './tokens'

gsap.registerPlugin(ScrollTrigger)

/**
 * The page's scrolling: Lenis smooths the wheel, and ScrollTrigger tells each
 * scroll-driven scene how far through its stretch of the page the visitor is.
 *
 * Lenis only smooths wheel and trackpad input. Touch scrolling, the keyboard
 * and the scrollbar stay native, and under reduced motion Lenis is not started
 * at all. Either way the page's real scroll position is what moves, so sticky
 * sections, anchors and everything that reads `scrollY` behave as usual.
 */

let lenis: Lenis | null = null

/** Starts smooth scrolling. Returns a function that stops it. */
export function startScroll(opts: { reducedMotion: boolean }) {
  let observer: ResizeObserver | null = null
  let refresh = 0
  // ScrollTrigger measures where things are once and remembers; tell it when the page changes height
  // (a section swapping to its fallback, pictures and fonts arriving)
  if (typeof ResizeObserver !== 'undefined') {
    let height = document.documentElement.scrollHeight
    observer = new ResizeObserver(() => {
      const next = document.documentElement.scrollHeight
      if (next === height) return
      height = next
      window.clearTimeout(refresh)
      refresh = window.setTimeout(() => ScrollTrigger.refresh(), 120)
    })
    observer.observe(document.body)
  }

  const tick = (time: number) => lenis?.raf(time * 1000)
  if (!opts.reducedMotion) {
    lenis = new Lenis({
      // A short tail: the scenes are scrubbed by scroll, and a long one makes them feel late
      lerp: 0.12,
      // Links to #ids glide there instead of jumping
      anchors: { duration: 1.4, easing: easeInOut },
      autoRaf: false,
    })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
  }

  return () => {
    observer?.disconnect()
    window.clearTimeout(refresh)
    gsap.ticker.remove(tick)
    lenis?.destroy()
    lenis = null
  }
}

/** Scrolls to an element, a selector or a pixel offset: gliding when smooth scrolling is on, at once when it is not. */
export function scrollToTarget(target: string | number | HTMLElement, opts: { offset?: number; duration?: number; immediate?: boolean } = {}) {
  if (lenis) {
    lenis.scrollTo(target, { offset: opts.offset ?? 0, duration: opts.duration ?? 1.4, easing: easeInOut, immediate: opts.immediate })
    return
  }
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  const top = typeof el === 'number' ? el : el ? el.getBoundingClientRect().top + window.scrollY : 0
  window.scrollTo({ top: top + (opts.offset ?? 0), behavior: 'instant' })
}

/**
 * Tracks how far the page has scrolled between two positions of an element,
 * as 0..1. `start` and `end` are ScrollTrigger positions: "top top" is the
 * element's top reaching the top of the screen, "bottom 95%" its bottom
 * reaching 95% of the way down the screen. `onUpdate` is called with the
 * current value at once and on every change. Returns a function that stops.
 */
export function trackProgress(trigger: Element, start: string, end: string, onUpdate: (progress: number) => void) {
  const st = ScrollTrigger.create({
    trigger,
    start,
    end,
    onUpdate: (self) => onUpdate(self.progress),
    onRefresh: (self) => onUpdate(self.progress),
  })
  onUpdate(st.progress)
  return () => st.kill()
}
