import * as THREE from 'three'
import type { PropMaterials } from '../materials'
import { BEER_UV } from '../textures'
import { solid } from './build'

/**
 * His beer: a longneck bottle in amber glass, open, part drunk, with a cream
 * paper label that says MOON BREW and a band of the same paper round the
 * neck. It is turned on a lathe from its profile: the stand ring and the
 * punt under it, the straight body, the shoulder, the long neck and the ring
 * of glass the cap was crimped on to.
 *
 * It is a little smaller than a real longneck, as he is smaller than a
 * person: sized so his hand goes round the body.
 *
 * Space: origin at the middle of the base, +Y up the bottle, the middle of
 * the label facing +Z.
 */
export const BEER = {
  height: 0.19,
  radius: 0.026,
  /** Where the body ends and the shoulder begins. */
  shoulder: 0.1,
  /** How far up the beer comes. */
  level: 0.118,
  /** The height at which a hand holds it: the middle of the fist. */
  grip: 0.05,
  /** The body label, and the band round the neck: from and to, in height. */
  label: [0.052, 0.096] as const,
  neckLabel: [0.138, 0.158] as const,
}

/** The profile from the middle of the base, out, up the wall, over the lip and down into the neck: [radius, height]. */
function profile(): [number, number][] {
  const { height: H, radius: R, shoulder: S } = BEER
  const neck = 0.0105
  return [
    [0.0005, 0.004],
    [R * 0.6, 0.003],
    [R * 0.86, 0.0004],
    [R * 0.96, 0.0012],
    [R, 0.005],
    [R, S * 0.5],
    [R, S],
    [R * 0.97, S + 0.008],
    [R * 0.86, S + 0.017],
    [R * 0.68, S + 0.026],
    [R * 0.53, S + 0.034],
    [neck + 0.0012, S + 0.044],
    [neck, H - 0.02],
    [neck, H - 0.012],
    // The ring under the lip, and the lip
    [neck + 0.0016, H - 0.0105],
    [neck + 0.0018, H - 0.0075],
    [neck + 0.0006, H - 0.005],
    [neck + 0.0008, H - 0.002],
    [neck - 0.0004, H],
    // Inside the mouth: down the bore to a dark floor a little way in
    [neck - 0.0022, H - 0.0004],
    [neck - 0.0026, H - 0.014],
    [0.0005, H - 0.014],
  ]
}
/** How many points at the end of the profile are inside the mouth. */
const INSIDE = 3

export function buildBeer(materials: PropMaterials, detail: 'high' | 'low') {
  const segments = detail === 'high' ? 32 : 18
  const points = profile()
  const geometry = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  )
  // The picture is laid by height up the outside; the inside of the mouth takes the dark strip above it
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j < points.length; j++) {
      const v = j >= points.length - INSIDE ? BEER_UV.inside : (points[j][1] / BEER.height) * BEER_UV.wall
      uv.setXY(i * points.length + j, i / segments, v)
    }
  }
  const group = new THREE.Group()
  group.name = 'beer'
  group.add(solid(geometry, materials.beer, 'beer-bottle'))
  return { group, dispose: () => geometry.dispose() }
}
