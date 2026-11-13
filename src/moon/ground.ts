import * as THREE from 'three'
import { SITE, SITE_REACH, SUN } from './config'
import { latLonToVec3, standFrame, type Vec3 } from './geo'
import moonVert from './shaders/moon.vert.glsl?raw'
import moonFrag from './shaders/moon.frag.glsl?raw'
import regolithSrc from './shaders/regolith.glsl?raw'

/** The most pins the ground can draw rings for. Matches MAX_PINS in the shader. */
export const MAX_PINS = 8

/** How wide the two tiling squares are on the ground, metres: the grain, and the clods and small craters. */
const GRAIN = { fine: 1.3, craters: 4.6 }

export type Ground = {
  /** The moon itself. Its own frame is the frame of NASA's maps; it is turned so that the alien's spot is up. */
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  /** An unseen ball inside the moon that casts the moon's own night onto whatever stands on it. */
  shade: THREE.Mesh
  /** Turns a moon-fixed direction into the stand frame. Writes into and returns `out`. */
  toStand(direction: Vec3, out: THREE.Vector3): THREE.Vector3
  /** Turns a stand-frame direction into the moon-fixed frame. Writes into and returns `out`. */
  toMoon(direction: THREE.Vector3, out: THREE.Vector3): THREE.Vector3
  /** Stands `object` on the ground along a stand-frame direction, its +Y up the ground's normal there, turned by `yaw` about it. */
  place(object: THREE.Object3D, direction: THREE.Vector3, yaw?: number): void
  dispose(): void
}

/** A ball of unit radius as a grid of latitude and longitude, with the maps' own texture coordinates. */
function sphereGrid(across: number, down: number, radius: number) {
  const positions = new Float32Array((across + 1) * (down + 1) * 3)
  const uvs = new Float32Array((across + 1) * (down + 1) * 2)
  let p = 0
  let t = 0
  for (let j = 0; j <= down; j++) {
    for (let i = 0; i <= across; i++) {
      const [x, y, z] = latLonToVec3(90 - (j / down) * 180, (i / across) * 360 - 180)
      positions[p++] = x
      positions[p++] = y
      positions[p++] = z
      uvs[t++] = i / across
      uvs[t++] = j / down
    }
  }
  const index = new Uint32Array(across * down * 6)
  let k = 0
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < across; i++) {
      const a = j * (across + 1) + i
      const b = a + across + 1
      // Wound so that the outside of the ball is the front
      index[k++] = a
      index[k++] = b
      index[k++] = a + 1
      index[k++] = a + 1
      index[k++] = b
      index[k++] = b + 1
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  // The vertex shader moves every vertex out to the moon's radius: say so, or it is culled as a unit ball
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius)
  return geometry
}

export function buildGround(
  textures: { color: THREE.Texture; normal: THREE.Texture; detail: THREE.Texture; craters: THREE.Texture; site: THREE.Texture },
  radius: number,
  segments: number,
): Ground {
  const material = new THREE.ShaderMaterial({
    vertexShader: moonVert,
    fragmentShader: moonFrag.replace('#pragma regolith', regolithSrc),
    lights: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uColor: { value: null },
        uNormal: { value: null },
        uDetail: { value: null },
        uCraters: { value: null },
        uSite: { value: null },
        uSiteUp: { value: new THREE.Vector3() },
        uSiteU: { value: new THREE.Vector3() },
        uSiteV: { value: new THREE.Vector3() },
        uSiteReach: { value: SITE_REACH },
        // Repeats in a metre. The squares are laid on in the moon's own space, not on its map, so there is no seam to meet at
        uGrain: { value: new THREE.Vector2(1 / GRAIN.fine, 1 / GRAIN.craters) },
        uRadius: { value: radius },
        uSun: { value: new THREE.Vector3() },
        uSunLight: { value: new THREE.Color() },
        uFill: { value: new THREE.Vector3() },
        uFillLight: { value: new THREE.Color() },
        uEye: { value: new THREE.Vector3() },
        uAlbedo: { value: 1.82 },
        uBaked: { value: 1 },
        uTime: { value: 0 },
        uPins: { value: Array.from({ length: MAX_PINS }, () => new THREE.Vector4()) },
        uPinLight: { value: new THREE.Color() },
      },
    ]),
  })
  // Set after the merge, which would have cloned the textures
  material.uniforms.uColor.value = textures.color
  material.uniforms.uNormal.value = textures.normal
  material.uniforms.uDetail.value = textures.detail
  material.uniforms.uCraters.value = textures.craters
  material.uniforms.uSite.value = textures.site

  const geometry = sphereGrid(segments, segments / 2, radius)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.name = 'moon'

  // The maps' frame, turned so that the alien's spot is straight up and he faces +Z
  const frame = standFrame(SITE.lat, SITE.lon, SITE.heading)
  const turn = new THREE.Matrix4().set(frame[0][0], frame[0][1], frame[0][2], 0, frame[1][0], frame[1][1], frame[1][2], 0, frame[2][0], frame[2][1], frame[2][2], 0, 0, 0, 0, 1)
  mesh.quaternion.setFromRotationMatrix(turn)
  const back = mesh.quaternion.clone().invert()
  const toMoon = (direction: THREE.Vector3, out: THREE.Vector3) => out.copy(direction).applyQuaternion(back)

  // The site picture is laid out with the chair at its centre and its columns running toward the sun (see moon.py)
  const toSun = new THREE.Vector3(SUN[0], 0, SUN[2]).normalize()
  toMoon(new THREE.Vector3(0, 1, 0), material.uniforms.uSiteUp.value)
  toMoon(toSun, material.uniforms.uSiteU.value)
  toMoon(new THREE.Vector3(toSun.z, 0, -toSun.x), material.uniforms.uSiteV.value)

  const shadeGeometry = new THREE.SphereGeometry(radius - 0.04, 96, 48)
  const shadeMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  const shade = new THREE.Mesh(shadeGeometry, shadeMaterial)
  shade.castShadow = true
  shade.name = 'moon-shade'

  const up = new THREE.Vector3(0, 1, 0)
  const normal = new THREE.Vector3()
  const tilt = new THREE.Quaternion()
  const twist = new THREE.Quaternion()
  return {
    mesh,
    shade,
    toStand: (direction, out) => out.set(direction[0], direction[1], direction[2]).applyQuaternion(mesh.quaternion),
    toMoon,
    place(object, direction, yaw = 0) {
      normal.copy(direction).normalize()
      object.position.copy(normal).multiplyScalar(radius)
      tilt.setFromUnitVectors(up, normal)
      twist.setFromAxisAngle(up, yaw)
      object.quaternion.copy(tilt).multiply(twist)
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      shadeGeometry.dispose()
      shadeMaterial.dispose()
    },
  }
}
