import { useSyncExternalStore } from 'react'
import { stage } from '@/stage/stage'
import { DURATION } from './tokens'

/**
 * The preloader and the hand-over into the page.
 *
 * The preloader itself is plain markup and CSS in index.html, so it is on
 * screen before any script has run. This module fills it in with real
 * progress, and when everything the first screen needs has arrived it wipes
 * the preloader away and tells the page to begin: the hero's entrance is held
 * until that moment, so the wipe uncovers it arriving, not already arrived.
 *
 * What is waited for: the fonts, the still image behind the hero, and the
 * hero's animated background (its shader compiled and its texture decoded).
 * Nothing else: the heavier scenes further down the page load while the
 * visitor reads.
 */

export type IntroPhase = 'loading' | 'revealing' | 'done'

/** Never shorter than this, so the mark has time to draw; never longer than MAX, whatever is still missing. */
const MIN_MS = 700
const MAX_MS = 6000

let phase: IntroPhase = 'loading'
let started = false
const listeners = new Set<() => void>()

function setPhase(next: IntroPhase) {
  phase = next
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 'loading' while the preloader is up, 'revealing' while it wipes away, then 'done'. */
export function useIntroPhase(): IntroPhase {
  return useSyncExternalStore(
    subscribe,
    () => phase,
    () => 'done' as IntroPhase,
  )
}

/** Resolves when the hero's background is either drawing or known not to be coming. */
function background() {
  return new Promise<void>((resolve) => {
    const settled = () => {
      const mode = document.querySelector<HTMLElement>('[data-bg-mode]')?.dataset.bgMode
      return mode === 'live' || mode === 'still' || stage.supported === false
    }
    if (settled()) return resolve()
    const off = stage.subscribe(() => {
      // The attribute is written by React a moment after the stage reports
      requestAnimationFrame(() => {
        if (!settled()) return
        off()
        resolve()
      })
    })
  })
}

/** Resolves when the still image behind the hero has loaded (or failed). */
function still() {
  return new Promise<void>((resolve) => {
    const img = document.querySelector<HTMLImageElement>('[data-bg-mode] img')
    if (!img || img.complete) return resolve()
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  })
}

/**
 * Runs the preloader. Call once, after the page has mounted. Safe to call
 * again (React's StrictMode mounts twice): later calls do nothing.
 */
export function runIntro() {
  if (started) return
  started = true
  const el = document.getElementById('preloader')
  if (!el) return setPhase('done')

  const count = el.querySelector<HTMLElement>('.pl-count')
  const began = performance.now()
  // A page reloaded part-way down opens on something other than the hero: its background is not
  // what is being uncovered (it may not even be drawn there), so it is not waited for
  const atTop = window.scrollY < window.innerHeight
  const tasks = [document.fonts?.ready ?? Promise.resolve(), still(), ...(atTop ? [background(), background()] : [])]
  let done = 0
  let shown = 0
  let raf = 0
  let finished = false

  // The number runs up to where the loading has got to, a little behind it, so it never jumps
  const tick = () => {
    raf = 0
    const target = done / tasks.length
    shown += (target - shown) * 0.16
    if (target - shown < 0.004) shown = target
    el.style.setProperty('--p', shown.toFixed(4))
    if (count) count.textContent = String(Math.round(shown * 100)).padStart(3, '0')
    if (shown < target) raf = requestAnimationFrame(tick)
    else if (finished) leave()
  }
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(tick)
  }

  let left = false
  const leave = () => {
    if (left) return
    left = true
    const wait = Math.max(0, MIN_MS - (performance.now() - began))
    window.setTimeout(() => {
      setPhase('revealing')
      el.classList.add('is-leaving')
      window.setTimeout(() => {
        el.remove()
        setPhase('done')
      }, DURATION.reveal * 1000 + 80)
    }, wait)
  }
  const finish = () => {
    if (finished) return
    finished = true
    done = tasks.length
    wake()
  }

  for (const task of tasks) {
    void Promise.resolve(task)
      .catch(() => {})
      .then(() => {
        done = Math.min(tasks.length, done + 1)
        if (done === tasks.length) finish()
        else wake()
      })
  }
  window.setTimeout(finish, MAX_MS)
}
