/**
 * Shared state of the black hole sequence, and the hook for whatever comes
 * after it.
 *
 *   import { blackHole } from '@/blackhole/state'
 *
 *   blackHole.progress            // 0..1 through the pinned sequence
 *   blackHole.theme               // 0 site palette .. 1 the black hole's palette
 *   blackHole.dim                 // 0 .. 1 as the UI fades to black with the scene
 *   blackHole.arrive              // 0 .. 1 as the scene fades up while scrolling in
 *   blackHole.intro               // 0 .. 1 while the caption and button sit over the idle scene
 *   blackHole.entered             // true while the screen is fully black
 *   blackHole.subscribe(fn)       // every change, at most once per frame
 *   blackHole.onEntered(fn)       // the moment the screen goes black
 *   blackHole.onExited(fn)        // scrolling back up out of the black
 *
 * The same values are mirrored to CSS as --bh-progress, --bh-theme, --bh-dim,
 * --bh-arrive, --bh-intro, --bh-fade and --bh-cue. An element asks for the ones
 * it uses by name: `data-bh-vars="theme dim"` gets --bh-theme and --bh-dim, on
 * itself and so on everything inside it. <html> gets the attribute
 * data-bh-entered, and the window "bh:entered" and "bh:exited" events.
 *
 * They are deliberately not set on <html>, and not handed out wholesale. A
 * custom property that changes restyles every element that inherits it, on
 * every frame of the scroll: on the root that is the whole page, and even on
 * one section full of text it is enough to drop frames. So each value goes
 * only to the few small elements that use it. Anything new that wants one in
 * CSS needs `data-bh-vars` naming it, on itself or a close ancestor.
 */
import { nextEntered, type Published } from './timeline'

export type BlackHoleSnapshot = {
  progress: number
  theme: number
  dim: number
  arrive: number
  intro: number
  entered: boolean
}

type Listener = (state: BlackHoleSnapshot) => void

const state: BlackHoleSnapshot = { progress: 0, theme: 0, dim: 0, arrive: 0, intro: 0, entered: false }
const listeners = new Set<Listener>()
const enterListeners = new Set<Listener>()
const exitListeners = new Set<Listener>()
/** Last value written per CSS variable, so unchanged values don't touch the DOM. */
const written = new Map<string, string>()
/** The elements the variables are written to, and which ones each asked for. */
type Target = { el: HTMLElement; wants: Set<string> }
let targets: Target[] = []
let targetsStamp = -Infinity
const seen = new WeakSet<HTMLElement>()

/** Re-reads the marked elements now and then, and brings any new one up to date. */
function refreshTargets() {
  const now = performance.now()
  if (now - targetsStamp < 500) return
  targetsStamp = now
  targets = Array.from(document.querySelectorAll<HTMLElement>('[data-bh-vars]')).map((el) => ({
    el,
    wants: new Set((el.dataset.bhVars ?? '').split(/\s+/).filter(Boolean).map((name) => `--bh-${name}`)),
  }))
  for (const { el, wants } of targets) {
    if (seen.has(el)) continue
    seen.add(el)
    for (const [name, text] of written) if (wants.has(name)) el.style.setProperty(name, text)
  }
}

function setVar(name: string, value: number) {
  const text = value.toFixed(4)
  if (written.get(name) === text) return
  written.set(name, text)
  for (const { el, wants } of targets) if (wants.has(name)) el.style.setProperty(name, text)
}

function add(set: Set<Listener>, fn: Listener) {
  set.add(fn)
  return () => {
    set.delete(fn)
  }
}

export const blackHole = {
  get progress() {
    return state.progress
  },
  get theme() {
    return state.theme
  },
  get dim() {
    return state.dim
  },
  get arrive() {
    return state.arrive
  },
  get intro() {
    return state.intro
  },
  get entered() {
    return state.entered
  },
  /** Called whenever progress, theme or dim change. Returns an unsubscribe function. */
  subscribe: (fn: Listener) => add(listeners, fn),
  /** Called once each time the screen reaches full black. */
  onEntered: (fn: Listener) => add(enterListeners, fn),
  /** Called once each time the user scrolls back up out of the black. */
  onExited: (fn: Listener) => add(exitListeners, fn),
}

/** Used by the scroll driver: stores the frame's values and mirrors them to CSS. */
export function publish(next: Published) {
  const changed = next.progress !== state.progress || next.theme !== state.theme || next.dim !== state.dim || next.arrive !== state.arrive || next.intro !== state.intro
  state.progress = next.progress
  state.theme = next.theme
  state.dim = next.dim
  state.arrive = next.arrive
  state.intro = next.intro

  refreshTargets()
  setVar('--bh-progress', next.progress)
  setVar('--bh-theme', next.theme)
  setVar('--bh-dim', next.dim)
  setVar('--bh-arrive', next.arrive)
  setVar('--bh-intro', next.intro)
  setVar('--bh-fade', next.fade)
  setVar('--bh-cue', next.cue)

  const entered = nextEntered(state.entered, next.progress)
  const flipped = entered !== state.entered
  state.entered = entered
  if (flipped) {
    const root = document.documentElement
    if (entered) root.dataset.bhEntered = 'true'
    else delete root.dataset.bhEntered
    window.dispatchEvent(new CustomEvent(entered ? 'bh:entered' : 'bh:exited', { detail: { ...state } }))
  }
  if (changed || flipped) for (const fn of listeners) fn(state)
  if (flipped) for (const fn of entered ? enterListeners : exitListeners) fn(state)
}

/** Puts everything back to "never scrolled here" (when the section unmounts). */
export function reset() {
  publish({ progress: 0, theme: 0, dim: 0, arrive: 0, intro: 0, fade: 0, cue: 0 })
  for (const { el } of targets) for (const name of written.keys()) el.style.removeProperty(name)
  written.clear()
  targetsStamp = -Infinity
}
