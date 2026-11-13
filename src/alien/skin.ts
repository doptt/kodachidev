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
 * The sweatshirt is black. The model's picture has it lilac grey, and the
 * picture is left as it is: the dye goes on here, per pixel (`DYE`). How
 * light the picture is at a dyed pixel, against the sweatshirt as a whole,
 * is kept, so the painted folds, seams and weave are all still there, only
 * darker. Which pixels are dyed is decided in three ways together:
 *  - by hue: the sweatshirt's rather than his skin's (the shorts are khaki
 *    and the drawstrings cream, so they are left alone), and no lighter
 *    than the sweatshirt gets;
 *  - by place: only on or just past a part of the body where clothes are
 *    worn. The cuffs follow the hands and the collar follows the head, but
 *    the rims of his eyes, his toes and the tips of his antennae have
 *    greyish pixels of their own that must not turn black;
 *  - and well inside the sweatshirt, with sweatshirt all round, whatever
 *    the hue, unless it is as light as a drawstring. The picture is an
 *    atlas of small patches with no margin between them, so along every
 *    edge of a patch skin from the patch next door leaks in: a faint line
 *    on lilac, a bright scratch on black.
 * The last two are per vertex (`dyeZone`), worked out in `measureCloth`.
 *
 * The wrap is the part that needs the shader opened up furthest: it must use
 * the sun's light before the shadow map has been applied to it, because the
 * far side of any body is by definition in its own shadow.
 */
const WRAP = 0.3

/**
 * Black cotton, as a linear colour: what the sweatshirt's average becomes. A
 * shade warm, and nowhere near zero, as dyed cloth is: it reflects about two
 * percent of the sun, enough for the folds and the lit edge to show. Much
 * lower and the folds go; much higher and it is a grey sweatshirt.
 */
const DYE = new THREE.Color(0.019, 0.0187, 0.0183)
/** How strongly the picture's light and dark carry over into the dyed cloth: 1 is as painted, more is deeper folds. */
const DYE_CONTRAST = 1.1
/** A texel darker than this (linear, 0..1) has no hue to speak of: the eyes, the holes in the picture. */
const HUELESS = 0.004
/** Nothing of the sweatshirt is painted lighter than this many times its average; what is, is skin. Fades out between the two. */
const DYE_LIGHTEST = [1.6, 2.0]
/** The same where everything round about is sweatshirt: there only the drawstrings are spared, which are lighter than this. */
const DYE_LIGHTEST_WITHIN = [2.6, 3.2]
/** The cell of the grid the vertices are counted on to say what is near what, as a fraction of his height: 1 cm on the shipped model. */
const DYE_CELL = 0.0085
/**
 * How many cells past the bones clothes are worn on the dye still takes. On
 * the shipped model the cuffs and collar end within 2.5 cm of those bones and
 * the nearest stray grey pixels (the eyes' rims) are 10 cm away.
 */
const DYE_REACH = 3
/** How many cells round a vertex are looked at to say whether it is well inside the sweatshirt, and the share of them that must be sweatshirt: from the first not at all, from the second fully. */
const DYE_WITHIN = 2
const DYE_WITHIN_SHARE = [0.75, 0.9]

export type ClothColours = { skin: THREE.Color; garments: [THREE.Color, THREE.Color] }

const lightness = (c: THREE.Color) => (c.r + c.g + c.b) / 3

/**
 * Where a hue lies between his skin's and the sweatshirt's, as numbers the
 * shader can use: with `hue = colour / lightness`, `dot(hue, xyz) + w` is 0
 * for his skin and 1 for the sweatshirt. All zero when he wears none.
 */
function dyeKey(colours: ClothColours) {
  const [sweatshirt] = colours.garments
  const hue = (c: THREE.Color) => new THREE.Vector3(c.r, c.g, c.b).divideScalar(Math.max(lightness(c), HUELESS))
  const skin = hue(colours.skin)
  const axis = hue(sweatshirt).sub(skin)
  if (apart(sweatshirt, colours.skin) <= SAME || axis.lengthSq() < 1e-4) return new THREE.Vector4(0, 0, 0, 0)
  axis.divideScalar(axis.lengthSq())
  return new THREE.Vector4(axis.x, axis.y, axis.z, -skin.dot(axis))
}

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
 * Counts the vertices on a grid of cells in the bind pose, so that what is
 * near a vertex can be asked without looking through the others: `share`
 * gives, for every vertex, the share of the vertices in the cube of
 * `radius` cells each way from its own cell that are flagged.
 */
function gridOf(cloud: Cloud, cell: number) {
  const p = cloud.positions
  // Which cell each vertex is in along each axis, and how many cells there are along it
  const cells = new Int32Array(p.length)
  const size = [0, 0, 0]
  for (let axis = 0; axis < 3; axis++) {
    let low = Infinity
    let high = -Infinity
    for (let i = axis; i < p.length; i += 3) {
      if (p[i] < low) low = p[i]
      if (p[i] > high) high = p[i]
    }
    for (let i = axis; i < p.length; i += 3) cells[i] = Math.floor((p[i] - low) / cell)
    // One more than there are: the tables below start with a layer of zeros
    size[axis] = Math.floor((high - low) / cell) + 2
  }
  const [nx, ny, nz] = size

  /** A table in which the entry at (x, y, z) is how many of the wanted vertices are in cells below x, y and z. */
  const table = (wanted: Uint8Array | null) => {
    const sums = new Int32Array(nx * ny * nz)
    for (let i = 0; i < cloud.count; i++) if (!wanted || wanted[i]) sums[cells[i * 3] + 1 + nx * (cells[i * 3 + 1] + 1 + ny * (cells[i * 3 + 2] + 1))]++
    for (let z = 1; z < nz; z++) for (let y = 1; y < ny; y++) for (let x = 2, at = 2 + nx * (y + ny * z); x < nx; x++, at++) sums[at] += sums[at - 1]
    for (let z = 1; z < nz; z++) for (let y = 2; y < ny; y++) for (let x = 1, at = 1 + nx * (y + ny * z); x < nx; x++, at++) sums[at] += sums[at - nx]
    for (let z = 2; z < nz; z++) for (let y = 1; y < ny; y++) for (let x = 1, at = 1 + nx * (y + ny * z); x < nx; x++, at++) sums[at] += sums[at - nx * ny]
    return sums
  }
  const all = table(null)

  return {
    share(flagged: Uint8Array, radius: number) {
      const some = table(flagged)
      const out = new Float32Array(cloud.count)
      for (let i = 0; i < cloud.count; i++) {
        const x0 = Math.max(cells[i * 3] - radius, 0)
        const x1 = Math.min(cells[i * 3] + radius + 1, nx - 1)
        const y0 = nx * Math.max(cells[i * 3 + 1] - radius, 0)
        const y1 = nx * Math.min(cells[i * 3 + 1] + radius + 1, ny - 1)
        const z0 = nx * ny * Math.max(cells[i * 3 + 2] - radius, 0)
        const z1 = nx * ny * Math.min(cells[i * 3 + 2] + radius + 1, nz - 1)
        const box = (sums: Int32Array) => sums[x1 + y1 + z1] - sums[x0 + y1 + z1] - sums[x1 + y0 + z1] - sums[x1 + y1 + z0] + sums[x0 + y0 + z1] + sums[x0 + y1 + z0] + sums[x1 + y0 + z0] - sums[x0 + y0 + z0]
        out[i] = box(some) / box(all)
      }
      return out
    },
  }
}

/**
 * Marks where clothes are worn (a per-vertex `clothZone` attribute, 1 on the
 * trunk, arms, hips and thighs) and where the sweatshirt's dye may go
 * (`dyeZone`), and measures the colour of his skin and of what he wears on
 * his trunk and on his hips.
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
  const colours: ClothColours = { skin, garments: [garment(onTrunk), garment(onHips)] }

  // Where the dye may go. 0 to 1: how nearly the vertex is on a clothed part of the body, which the cuffs and the collar are
  // just past. 1 to 2: how surely it is well inside the sweatshirt, with sweatshirt all round it.
  const dye = new Float32Array(cloud.count)
  const key = dyeKey(colours)
  if (texture && uv && key.lengthSq() > 0) {
    let low = Infinity
    let high = -Infinity
    for (let i = 0; i < cloud.count; i++) {
      low = Math.min(low, cloud.positions[i * 3 + 1])
      high = Math.max(high, cloud.positions[i * 3 + 1])
    }
    const grid = gridOf(cloud, DYE_CELL * (high - low))
    const reach = grid.share(Uint8Array.from(zone), DYE_REACH)
    for (let i = 0; i < cloud.count; i++) dye[i] = zone[i] > 0 ? 1 : THREE.MathUtils.smoothstep(reach[i], 0, 0.1)
    // A vertex is sweatshirt if the picture at it has anything of the sweatshirt's hue (at an edge of a patch of the picture it is mixed with whatever lies next to it there)
    const sweatshirt = new Uint8Array(cloud.count)
    const from = Math.max(lightness(colours.garments[0]), HUELESS)
    const texel: [number, number, number] = [0, 0, 0]
    for (let i = 0; i < cloud.count; i++) {
      if (dye[i] < 1) continue
      texture.at(uv.getX(i), uv.getY(i), texel)
      const light = (texel[0] + texel[1] + texel[2]) / 3
      const hue = (texel[0] * key.x + texel[1] * key.y + texel[2] * key.z) / Math.max(light, HUELESS) + key.w
      if (hue > 0.25 && light > HUELESS * 3 && light < DYE_LIGHTEST[1] * from) sweatshirt[i] = 1
    }
    const within = grid.share(sweatshirt, DYE_WITHIN)
    for (let i = 0; i < cloud.count; i++) if (dye[i] === 1) dye[i] += THREE.MathUtils.smoothstep(within[i], DYE_WITHIN_SHARE[0], DYE_WITHIN_SHARE[1])
  }
  rig.mesh.geometry.setAttribute('dyeZone', new THREE.BufferAttribute(dye, 1))
  return colours
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
    dyeKey: { value: dyeKey(colours) },
    dye: { value: DYE },
    // How light the sweatshirt is in the picture, on average: a pixel that light comes out exactly the dye's colour
    dyeFrom: { value: Math.max(lightness(colours.garments[0]), HUELESS) },
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float clothZone;\nattribute float dyeZone;\nvarying float vClothZone;\nvarying float vDyeZone;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvClothZone = clothZone;\nvDyeZone = dyeZone;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying float vClothZone;
        varying float vDyeZone;
        uniform vec3 skinColour;
        uniform vec3 garmentA;
        uniform vec3 garmentB;
        uniform vec4 dyeKey;
        uniform vec3 dye;
        uniform float dyeFrom;
        // 1 on cloth, 0 on skin
        float cloth = 0.0;
        // 1 on the sweatshirt, which is dyed
        float dyed = 0.0;
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
          // The sweatshirt, dyed black: what has its hue, is dark enough to be it and is where it is worn. The picture's light and dark are kept
          float painted = ( diffuseColor.r + diffuseColor.g + diffuseColor.b ) / 3.0;
          float hue = dot( diffuseColor.rgb / max( painted, ${HUELESS.toFixed(3)} ), dyeKey.xyz ) + dyeKey.w;
          float against = painted / dyeFrom;
          // Well inside it, whatever is not as light as a drawstring is sweatshirt: at the seams of the picture other colours leak in
          float within = clamp( vDyeZone - 1.0, 0.0, 1.0 );
          float byHue = smoothstep( 0.3, 0.55, hue ) * ( 1.0 - smoothstep( ${DYE_LIGHTEST[0].toFixed(2)}, ${DYE_LIGHTEST[1].toFixed(2)}, against ) );
          float byPlace = within * ( 1.0 - smoothstep( ${DYE_LIGHTEST_WITHIN[0].toFixed(2)}, ${DYE_LIGHTEST_WITHIN[1].toFixed(2)}, against ) );
          dyed = max( byHue, byPlace ) * smoothstep( ${HUELESS.toFixed(3)}, ${(HUELESS * 3).toFixed(3)}, painted ) * smoothstep( 0.0, 1.0, vDyeZone );
          diffuseColor.rgb = mix( diffuseColor.rgb, dye * pow( min( against, ${DYE_LIGHTEST[0].toFixed(2)} ), ${DYE_CONTRAST.toFixed(2)} ), dyed );
          // All of it is cloth, the cuffs and the collar too
          cloth = max( cloth, dyed );
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
          // The fuzz of a dyed cloth is dyed too: it catches the light at the edges, faintly
          material.sheenColor = mix( material.sheenColor, vec3( mix( 0.22, 0.03, dyed ) ) + 0.5 * diffuseColor.rgb, cloth );
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
