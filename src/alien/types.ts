/**
 * The alien, his chair, his beer and the things around him, as one actor the
 * moon scene can put on its surface. This file is the agreement between the
 * two: the moon scene (src/moon) owns the world, the lights, the camera and
 * the ground; the actor (src/alien) owns everything that sits on the ground at
 * his spot and everything he does.
 */
import type * as THREE from 'three'
import type { TierName } from '@/blackhole/quality'

export type AlienOptions = {
  renderer: THREE.WebGLRenderer
  tier: TierName
  /**
   * Radius of the ground he sits on, in metres (he is on a small moon, so the
   * ground falls away from his spot). Props and contact shadows follow it.
   * Infinity for flat ground.
   */
  groundRadius: number
  /** Reports loading as it goes, for the preloader: bytes or items done, out of a total. */
  onProgress?: (done: number, total: number) => void
}

export type AlienInput = {
  /**
   * A point in world space for him to look toward (the cursor's point in the
   * scene, a hovered pin), or null to leave his head to the animation. The
   * actor clamps and damps it.
   */
  lookAt: THREE.Vector3 | null
  /** A point to glance at briefly, taking over from `lookAt` (a pin being hovered). Null for none. */
  glanceAt: THREE.Vector3 | null
  /** 0 → 1 as the scene first reveals him. The dust puff goes off as this rises through the middle. */
  reveal: number
  /** Reduced motion: hold the seated pose. No sips, no blinks, no jiggle. */
  still: boolean
}

export type AlienActor = {
  /**
   * Everything at his spot: alien, chair, beer bottle, cooler and water bottles, contact shadows,
   * dust. Its origin is the point on the ground under the middle of the chair;
   * +Y is up (away from the moon's centre) and he faces +Z. One unit is one
   * metre. The moon scene positions and orients it; its scale stays 1. Meshes
   * cast shadows; the moon scene's sun decides whether shadows are on.
   */
  root: THREE.Group
  /** Radius, in metres, of the patch of ground around the origin that his set occupies. For fitting a shadow camera. */
  footprint: number
  /** Where his head is, in world space: for framing the camera on him. Writes into and returns `out`. */
  headWorld(out: THREE.Vector3): THREE.Vector3
  /** Advances everything by `dt` seconds. Call once a frame, before rendering. */
  update(dt: number, input: AlienInput): void
  /** Frees every geometry, material and texture the actor made. */
  dispose(): void
}
