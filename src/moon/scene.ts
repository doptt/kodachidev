import type { SceneFactory } from '@/stage/types'
import type { MoonState } from './state'

export type MoonPin = {
  id: string
  /** Where the foot of the pin stands in the settled picture: fractions of the screen from the top left, for wide screens and for tall ones. */
  spot: { wide: readonly [number, number]; tall: readonly [number, number] }
}

export type MoonSceneOptions = {
  /** What the scene and the page share: scroll progress, the visitor's turn of the moon, the open pin; and, back the other way, where the pins are on screen. See state.ts. */
  state: MoonState
  /** The pins to stand on the moon. At most eight. */
  pins: readonly MoonPin[]
}

/**
 * The moon as a scene on the stage: the top of a world a few metres across,
 * filling the bottom half of the screen, with the alien in his chair on it,
 * the Earth and the Milky Way behind, and a pin in the ground for each way of
 * getting in touch.
 *
 * Purely a picture. Scroll, dragging and the pins' labels are the section's
 * (sections/Contact.tsx); the two meet in `opts.state`.
 *
 * The scene itself (three.js, the shaders, the actor) is in world.ts and is
 * only fetched when the stage first makes the scene, so that defining it costs
 * the page nothing.
 */
export function createMoonScene(opts: MoonSceneOptions): SceneFactory {
  return async (ctx) => {
    const { buildWorld } = await import('./world')
    return buildWorld(ctx, opts)
  }
}
