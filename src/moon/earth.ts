import * as THREE from 'three'
import { EARTH, SUN } from './config'
import earthVert from './shaders/earth.vert.glsl?raw'
import earthFrag from './shaders/earth.frag.glsl?raw'
import airFrag from './shaders/air.frag.glsl?raw'

/** How far away the Earth is drawn. It is in a scene of its own, seen by a camera that never leaves the origin, so only its direction and size on the sky matter. */
const DISTANCE = 100
/** The shell of air, as a multiple of the planet's radius. */
const AIR = 1.05

export type Earth = {
  /** The Earth and nothing else: drawn first, behind everything. */
  scene: THREE.Scene
  /** Hangs the Earth in a direction (stand frame). */
  place(direction: readonly [number, number, number]): void
  /** Lets the clouds drift. `time` in seconds. */
  update(time: number): void
  dispose(): void
}

export function buildEarth(map: THREE.Texture): Earth {
  const sun = new THREE.Vector3(...SUN)
  const globe = new THREE.SphereGeometry(1, 72, 48)
  const surface = new THREE.ShaderMaterial({
    vertexShader: earthVert,
    fragmentShader: earthFrag,
    uniforms: { uMap: { value: map }, uSun: { value: sun }, uClouds: { value: 0 } },
  })
  const air = new THREE.ShaderMaterial({
    vertexShader: earthVert,
    fragmentShader: airFrag,
    uniforms: { uSun: { value: sun }, uEdge: { value: Math.sqrt(1 - 1 / (AIR * AIR)) } },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    // Adds its light and leaves the coverage in alpha alone, so the stars show through it
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  })

  const planet = new THREE.Mesh(globe, surface)
  const shell = new THREE.Mesh(globe, air)
  shell.scale.setScalar(AIR)
  const group = new THREE.Group()
  group.add(planet, shell)
  group.scale.setScalar(DISTANCE * Math.tan(EARTH.radius))
  // Tipped as the Earth is, and turned to show Africa and Europe coming into the light
  group.rotation.set(0.32, -1.9, 0.41, 'ZXY')

  const scene = new THREE.Scene()
  scene.add(group)

  return {
    scene,
    place(direction) {
      group.position.set(direction[0], direction[1], direction[2]).multiplyScalar(DISTANCE)
    },
    update(time) {
      // A turn of the cloud layer over the ground every twenty minutes: enough to be alive, too slow to see move
      surface.uniforms.uClouds.value = (time / 1200) % 1
    },
    dispose() {
      globe.dispose()
      surface.dispose()
      air.dispose()
    },
  }
}
