/**
 * What the moon scene and the page share: one small plain object.
 *
 * The page writes what the visitor is doing; the scene reads it every frame,
 * and writes back where things have ended up on screen so that the page can
 * lay its labels over them.
 *
 *   page → scene   progress     how far the pinned section has been scrolled, 0..1
 *                  orbit        the visitor's swing of the camera round the chair (see orbit.ts): pointer
 *                               handlers move it, the scene advances it each frame
 *                  active       the pin whose label is open, or null: the alien
 *                               glances at it and the view stops swaying
 *                  facing       a pin the view should swing toward, or null
 *                               (both are set through `open`)
 *
 *   scene → page   spots        each pin's place on screen and how visible it is
 *                  interactive  true once the view has settled and the pins are live
 *                  loaded       0..1 while the scene's files come in
 *
 * `subscribe` is called after the scene has written a frame, at most once a
 * frame; `onPin` when the open pin changes. Nothing here is mirrored to CSS
 * variables: listeners move the few elements that follow the scene by
 * transform, themselves.
 */
import { createOrbit, type Orbit } from './orbit'

export type PinSpot = {
  /** The pin's head, in CSS pixels from the top left of the canvas. */
  x: number
  y: number
  /** 0 when the moon is in the way or the pin is off screen, 1 when it is in plain view. */
  visible: number
}

export type MoonState = {
  progress: number
  orbit: Orbit
  active: string | null
  facing: string | null
  spots: Record<string, PinSpot>
  interactive: boolean
  loaded: number
  /**
   * Opens a pin's label, or with null closes whichever is open. `turn` also
   * swings the view toward the pin: for the keyboard and for the page's own
   * controls. A hover leaves the view where it is, or the pin would be carried
   * out from under the pointer.
   */
  open(id: string | null, turn?: boolean): void
  /** Hears when the open pin changes. Returns an unsubscribe function. */
  onPin(fn: (id: string | null) => void): () => void
  /** Called by the scene once it has written a frame. */
  emit(): void
  /** Hears about every frame the scene writes. Returns an unsubscribe function. */
  subscribe(fn: (state: MoonState) => void): () => void
}

export function createMoonState(): MoonState {
  const listeners = new Set<(state: MoonState) => void>()
  const pinListeners = new Set<(id: string | null) => void>()
  const state: MoonState = {
    progress: 0,
    orbit: createOrbit(),
    active: null,
    facing: null,
    spots: {},
    interactive: false,
    loaded: 0,
    open(id, turn = false) {
      // A pin already being faced stays faced when it is merely hovered
      state.facing = id !== null && (turn || state.facing === id) ? id : null
      if (state.active === id) return
      state.active = id
      for (const fn of pinListeners) fn(id)
    },
    onPin(fn) {
      pinListeners.add(fn)
      return () => {
        pinListeners.delete(fn)
      }
    },
    emit() {
      for (const fn of listeners) fn(state)
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
  return state
}

/** The state of the moon on the site itself. The dev harness makes its own. */
export const moonState = createMoonState()
