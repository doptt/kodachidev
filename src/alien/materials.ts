import * as THREE from 'three'
import type { TierName } from '@/blackhole/quality'
import { BEER } from './props/beer'
import { makeBeerTextures, makeShadowBlob, makeWebbing } from './textures'

/**
 * The materials of the props, made once and shared. Anything polished gets the
 * actor's own little environment (env.ts) to reflect; `reflective` lists those
 * so the actor can keep the reflection in step with the moon scene's sun.
 */
export type PropMaterials = ReturnType<typeof makePropMaterials>

export function makePropMaterials(env: THREE.Texture, tier: TierName) {
  const low = tier === 'low' || tier === 'medium'
  const webbingMaps = makeWebbing(low ? 128 : 256)
  const beerMaps = makeBeerTextures(low ? 256 : 512, BEER)
  const blob = makeShadowBlob()
  const textures: THREE.Texture[] = [webbingMaps.map, webbingMaps.normalMap, beerMaps.map, beerMaps.roughnessMap, blob]

  /** Drawn aluminium tube: bright, with the grain of the die running along it. */
  const aluminium = new THREE.MeshPhysicalMaterial({
    color: 0xe4e7ea,
    metalness: 1,
    roughness: 0.2,
    anisotropy: 0.45,
    anisotropyRotation: Math.PI / 2,
    envMap: env,
  })

  /** The arms of the chair, its plugs and bushes: white moulded plastic. */
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0xeeeeea, roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.5, envMap: env })

  /** Woven polypropylene strap. */
  const webbing = new THREE.MeshPhysicalMaterial({
    map: webbingMaps.map,
    normalMap: webbingMaps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.66,
    sheen: 0.22,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xffffff),
  })

  /**
   * The beer bottle: amber glass. As with the water bottles nothing is
   * refracted. Its picture says how much can be seen through each part
   * (paper nothing, beer next to nothing, the empty neck a good deal), and
   * here the glass is made denser toward its edges, where a real bottle is
   * looked through the longest way, and solid wherever it carries a highlight.
   */
  const beer = new THREE.MeshPhysicalMaterial({
    map: beerMaps.map,
    roughnessMap: beerMaps.roughnessMap,
    roughness: 1,
    metalness: 0,
    transparent: true,
    envMap: env,
  })
  beer.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      float beerFacing = abs( dot( normalize( vViewPosition ), normal ) );
      float beerGlint = max( max( totalSpecular.r, totalSpecular.g ), totalSpecular.b );
      diffuseColor.a = clamp( diffuseColor.a + 0.4 * pow( 1.0 - beerFacing, 2.0 ) + beerGlint, 0.0, 1.0 );
      #include <opaque_fragment>`,
    )
  }

  /** Moulded things that differ only in colour (the cooler and its lid, the bottles' caps and labels): one material, the colours on the vertices. */
  const moulded = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, envMap: env })

  /**
   * A water bottle: thin clear plastic. Nothing is refracted (that would
   * need the scene drawn twice); instead the plastic is nearly invisible
   * face-on and turns bright and solid toward its edges, where a real bottle
   * shows the sky and the ground bent round in it, which is most of what
   * makes clear plastic read as clear plastic.
   */
  const bottle = new THREE.MeshPhysicalMaterial({
    color: 0xcfe2ec,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMap: env,
  })
  bottle.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      // How squarely the surface faces the eye decides how much of the plastic is seen; highlights always show
      float facing = abs( dot( normalize( vViewPosition ), normal ) );
      float edge = pow( 1.0 - facing, 2.5 );
      float glint = max( max( totalSpecular.r, totalSpecular.g ), totalSpecular.b );
      diffuseColor.a = clamp( 0.1 + 0.5 * edge + glint * 1.2, 0.0, 1.0 );
      #include <opaque_fragment>`,
    )
  }
  /** The water in it: a faint blue, clearer than the plastic. */
  const water = new THREE.MeshPhysicalMaterial({ color: 0x7fa9c0, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, envMap: env })

  /** Contact shadows: soft dark blobs laid on the ground where things touch it. */
  const contact = new THREE.MeshBasicMaterial({
    map: blob,
    color: 0x000000,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  })

  const all = { aluminium, plastic, webbing, beer, moulded, bottle, water, contact }
  const reflective: THREE.MeshStandardMaterial[] = [aluminium, plastic, beer, moulded, bottle, water]
  return {
    ...all,
    reflective,
    dispose() {
      for (const m of Object.values(all)) m.dispose()
      for (const t of textures) t.dispose()
    },
  }
}
