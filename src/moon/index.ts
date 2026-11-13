/**
 * The moon, for the rest of the site.
 *
 *   import { defineMoonScene, moonControls } from '@/moon'
 *
 *   defineMoonScene()            // registers the scene with the stage as 'moon' (safe to call again);
 *                                // after it, stage.preload('moon') fetches and compiles everything
 *   moonControls.flyTo()         // go to the contact section and fly the camera back to the settled view
 *   moonControls.focusPin('email')   // open a pin's label and swing the view toward it; null closes it
 *
 * Nothing here pulls in three.js or the scene's code: that is fetched by the
 * stage the first time the scene is preloaded or shown.
 */
import { CONTACT_PINS } from '@/content/contact'
import { stage } from '@/stage/stage'
import type { MoonDriver } from './driver'
import { createMoonScene } from './scene'
import { moonState } from './state'

export { moonState } from './state'

let defined = false

/** Registers the moon with the stage. The section does this itself when it mounts; call it earlier to preload. */
export function defineMoonScene() {
  if (defined) return
  defined = true
  stage.define('moon', createMoonScene({ state: moonState, pins: CONTACT_PINS }), { priority: 3 })
}

let driver: MoonDriver | null = null

/** The pinned section hands over its scroll driver while it is mounted. Returns a function that takes it back. */
export function attachMoonDriver(next: MoonDriver) {
  driver = next
  return () => {
    if (driver === next) driver = null
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const moonControls = {
  /**
   * Goes to the contact section. With the moon running, the page jumps to the
   * settled view and the camera flies back to it from close on the alien; under
   * reduced motion, or where the section is showing its flat picture, the
   * page simply goes there.
   */
  flyTo() {
    if (driver) driver.flyTo(reducedMotion())
    else document.getElementById('contact')?.scrollIntoView({ behavior: 'instant', block: 'start' })
  },

  /** Opens a pin's label and swings the view toward it, bringing the settled view on screen if it is not; null closes whichever is open. */
  focusPin(id: string | null) {
    if (id !== null) driver?.settle()
    moonState.open(id, true)
  },
}
