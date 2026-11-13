import * as THREE from 'three'
import type { Cloud, TextureReader } from './measure'
import type { BoneRole, Rig } from './rig'

/**
 * His skin, and his clothes. The model arrives as one mesh with one ordinary
 * metal-roughness material; a creature lit by one hard sun in a vacuum needs
 * more than that or it reads as painted plastic, and a cotton sweatshirt must
 * not shine like the skin beside it. This replaces the material with one
 * that treats the two differently.
 *
 * Skin:
 *  - a soft sheen at grazing angles, slightly waxy;
 *  - a thin clear coat, so the sun leaves a small wet highlight;
 *  - a cheap stand-in for light travelling under the surface: the sun's
 *    light is carried a little way past the line where it should stop
 *    (wrap lighting), in a warmer colour, as light that has been through
 *    flesh is, and thin parts lit from behind glow faintly.
 *
 * Cloth (the hooded sweatshirt and the shorts): matt, no clear coat, and the
 * broad dull sheen of cotton fuzz instead of the tight one of skin.
 *
 * Which is which is decided per pixel, from the colour of the texture: the
 * colours of his skin and of each garment are measured when the model loads
 * (`measureCloth`), and a pixel is cloth if it is on a part of the body where
 * clothes are worn and its colour is nearer a garment's than his skin's. On a
 * model with no clothes the measured colours all come out as skin and
 * nothing is treated as cloth.
 *
 * The wrap is the part that needs the shader opened up furthest: it must use
 * the sun's light before the shadow map has been applied to it, because the
 * far side of any body is by definition in its own shadow.
 */
const WRAP = 0.3

export type ClothColours = { skin: THREE.Color; garments: [THREE.Color, THREE.Color] }

/** Bones under which clothes are worn: the trunk and arms for the sweatshirt, the hips and thighs for the shorts. */
const SWEATSHIRT: BoneRole[] = ['spine', 'chest', 'neck', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftForeArm', 'rightForeArm']
const SHORTS: BoneRole[] = ['hips', 'leftUpLeg', 'rightUpLeg']
/** Colours closer together than this (in the measure the shader uses) are the same material. */
const SAME = 0.12

/** A colour as the shader compares colours: its hue and saturation count for more than how light it is. */
function signature(c: THREE.Color) {
  const light = (c.r + c.g + c.b) / 3
  return [c.r / (light + 0.02), c.g / (light + 0.02), c.b / (light + 0.02), light * 1.5]
}
const apart = (a: THREE.Color, b: THREE.Color) => Math.hypot(...signature(a).map((v, i) => v - signature(b)[i]))

/**
 * Marks where clothes are worn (a per-vertex `clothZone` attribute, 1 on the
 * trunk, arms, hips and thighs) and measures the colour of his skin and of
 * what he wears on his trunk and on his hips.
 */
export function measureCloth(rig: Rig, cloud: Cloud, texture: TextureReader | null): ClothColours {
  const bones = rig.mesh.skeleton.bones
  const indexOf = (role: BoneRole) => bones.indexOf(rig.bones[role])
  const midSpine = rig.bones.chest.parent ? bones.indexOf(rig.bones.chest.parent as THREE.Bone) : -1
  const zoneBones = new Set([...SWEATSHIRT, ...SHORTS].map(indexOf))
  zoneBones.add(midSpine)
  const zone = new Float32Array(cloud.count)
  for (let i = 0; i < cloud.count; i++) zone[i] = zoneBones.has(cloud.bone[i]) ? 1 : 0
  rig.mesh.geometry.setAttribute('clothZone', new THREE.BufferAttribute(zone, 1))

  const uv = rig.mesh.geometry.getAttribute('uv')
  const mean = (wanted: Set<number>) => {
    const sum = [0, 0, 0]
    const texel: [number, number, number] = [0, 0, 0]
    let n = 0
    if (texture && uv) {
      for (let i = 0; i < cloud.count; i++) {
        if (!wanted.has(cloud.bone[i]) || cloud.weight[i] < 0.6) continue
        texture.at(uv.getX(i), uv.getY(i), texel)
        // Not the eyes, nor anything else painted black
        if (texel[0] + texel[1] + texel[2] < 0.06) continue
        sum[0] += texel[0]
        sum[1] += texel[1]
        sum[2] += texel[2]
        n++
      }
    }
    return n > 0 ? new THREE.Color(sum[0] / n, sum[1] / n, sum[2] / n) : null
  }
  const skin = mean(new Set((['head', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as BoneRole[]).map(indexOf))) ?? new THREE.Color(0.3, 0.36, 0.25)
  const onTrunk = mean(new Set([indexOf('spine'), indexOf('chest'), midSpine]))
  const onHips = mean(new Set([indexOf('hips')]))
  // A garment the colour of his skin is no garment
  const garment = (colour: THREE.Color | null) => (colour && apart(colour, skin) > SAME ? colour : skin.clone())
  return { skin, garments: [garment(onTrunk), garment(onHips)] }
}

export function makeSkin(source: THREE.Material | THREE.Material[], colours: ClothColours) {
  const original = (Array.isArray(source) ? source[0] : source) as THREE.MeshStandardMaterial
  const material = new THREE.MeshPhysicalMaterial({
    map: original.map,
    normalMap: original.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.52,
    metalness: 0,
    sheen: 0.4,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0.7, 0.78, 0.62),
    clearcoat: 0.2,
    clearcoatRoughness: 0.36,
    specularIntensity: 0.7,
  })
  material.name = 'alien-skin'
  // The file's roughness and metalness pictures are not used: the look is decided here, and the eyes get shells of their own
  original.roughnessMap?.dispose()
  if (original.metalnessMap !== original.roughnessMap) original.metalnessMap?.dispose()
  original.aoMap?.dispose()
  original.dispose()

  const uniforms = {
    skinColour: { value: colours.skin },
    garmentA: { value: colours.garments[0] },
    garmentB: { value: colours.garments[1] },
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float clothZone;\nvarying float vClothZone;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvClothZone = clothZone;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying float vClothZone;
        uniform vec3 skinColour;
        uniform vec3 garmentA;
        uniform vec3 garmentB;
        // 1 on cloth, 0 on skin
        float cloth = 0.0;
        vec4 clothSignature( vec3 c ) {
          float light = ( c.r + c.g + c.b ) / 3.0;
          return vec4( c / ( light + 0.02 ), light * 1.5 );
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          vec4 here = clothSignature( diffuseColor.rgb );
          float toSkin = distance( here, clothSignature( skinColour ) );
          float toCloth = min( distance( here, clothSignature( garmentA ) ), distance( here, clothSignature( garmentB ) ) );
          // Where both garments measured as skin there are no clothes at all
          float worn = step( ${SAME.toFixed(2)}, max( distance( clothSignature( garmentA ), clothSignature( skinColour ) ), distance( clothSignature( garmentB ), clothSignature( skinColour ) ) ) );
          cloth = worn * smoothstep( 0.4, 0.6, vClothZone ) * smoothstep( -0.03, 0.03, toSkin - toCloth );
          // Cotton drinks light: a hard sun does not bleach it the way it does skin
          diffuseColor.rgb *= mix( 1.0, 0.78, cloth );
        }`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `#include <lights_physical_fragment>
        material.roughness = mix( material.roughness, 0.93, cloth );
        material.specularColor *= mix( 1.0, 0.5, cloth );
        #ifdef USE_CLEARCOAT
          material.clearcoat *= 1.0 - cloth;
        #endif
        #ifdef USE_SHEEN
          material.sheenColor = mix( material.sheenColor, vec3( 0.22 ) + 0.5 * diffuseColor.rgb, cloth );
          material.sheenRoughness = mix( material.sheenRoughness, 0.85, cloth );
        #endif`,
      )
      .replace(
        '#include <lights_physical_pars_fragment>',
        /* glsl */ `#include <lights_physical_pars_fragment>
        // The light of the lamp being worked on, before its shadow
        vec3 skinUnshadowed = vec3( 0.0 );
        void RE_Direct_Skin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
          RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
          float facing = dot( geometryNormal, directLight.direction );
          // Light carried round the corner: what a wrapped falloff gives beyond the plain one. Cloth has a little of it too (it is soft), flesh much more.
          float wrapped = saturate( ( facing + ${WRAP.toFixed(2)} ) / ${(1 + WRAP).toFixed(2)} );
          float carried = max( wrapped * wrapped - saturate( facing ), 0.0 );
          vec3 under = material.diffuseContribution * mix( vec3( 1.2, 1.0, 0.6 ), vec3( 1.0 ), cloth );
          reflectedLight.directDiffuse += skinUnshadowed * carried * mix( 0.7, 0.3, cloth ) * BRDF_Lambert( under );
          // Thin parts with the light behind them
          float through = pow( saturate( dot( geometryViewDir, - normalize( directLight.direction + geometryNormal * 0.4 ) ) ), 5.0 );
          reflectedLight.directDiffuse += skinUnshadowed * through * 0.1 * ( 1.0 - cloth ) * BRDF_Lambert( under );
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Skin`,
      )
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(/getDirectionalLightInfo\( directionalLight, directLight \);/g, 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tskinUnshadowed = directLight.color;'))
  }
  return material
}
