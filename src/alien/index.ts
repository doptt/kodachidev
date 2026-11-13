import { createActor } from './actor'
import type { AlienActor, AlienOptions } from './types'

export type { AlienActor, AlienInput, AlienOptions } from './types'

/**
 * The alien in his lawn chair, with his beer, the cooler and the bottles
 * beside him: everything that stands at his spot on the moon, as one actor
 * (see types.ts for the agreement with the moon scene, and actor.ts for how
 * it is put together).
 *
 * Resolves once the model is loaded, measured, seated and its clips are
 * made. If the model cannot be loaded it still resolves, with the set and an
 * empty chair.
 */
export async function createAlienActor(opts: AlienOptions): Promise<AlienActor> {
  return createActor(opts)
}
