import * as THREE from 'three'
import rockVert from './shaders/rock.vert.glsl?raw'
import rockFrag from './shaders/rock.frag.glsl?raw'
import regolithSrc from './shaders/regolith.glsl?raw'

/**
 * Stones, scattered over the moon: pebbles mostly, a few a hand or two across,
 * the odd small boulder. They are what gives the ground a scale. Each throws a
 * long hard shadow under the low sun, and the ones on the skyline break the
 * edge of the moon the way real ground does.
 */
export type Rocks = {
  mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  dispose(): void
}

/** A small repeatable random number generator, so the stones lie in the same places on every visit. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One stone: a ball knocked out of round, lower than it is wide, with flat faces. */
function stone(detail: number, random: () => number) {
  const ball = new THREE.IcosahedronGeometry(1, detail)
  const position = ball.getAttribute('position')
  // A few random planes, each pushing in the part of the ball beyond it: a cheap way to chip it
  const chips = Array.from({ length: 11 }, () => ({ normal: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(), at: 0.58 + random() * 0.34 }))
  const v = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i)
    for (const chip of chips) {
      const over = v.dot(chip.normal) - chip.at
      if (over > 0) v.addScaledVector(chip.normal, -over * 0.85)
    }
    position.setXYZ(i, v.x, v.y * 0.72, v.z)
  }
  // An icosahedron's faces do not share vertices, so every face gets its own normal
  ball.computeVertexNormals()
  return ball
}

/**
 * Scatters `count` stones over a moon of the given radius. `keepClear` lists
 * stand-frame directions with a radius in metres round each where nothing
 * should lie (the chair, the pins).
 */
export function buildRocks(count: number, detail: number, radius: number, keepClear: readonly { direction: THREE.Vector3; radius: number }[]): Rocks {
  const random = seeded(0x1969)
  const geometry = stone(detail, random)
  const material = new THREE.ShaderMaterial({
    vertexShader: rockVert,
    fragmentShader: rockFrag.replace('#pragma regolith', regolithSrc),
    lights: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      { uSun: { value: new THREE.Vector3() }, uSunLight: { value: new THREE.Color() }, uFill: { value: new THREE.Vector3() }, uFillLight: { value: new THREE.Color() } },
    ]),
  })
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'rocks'

  const tones = new Float32Array(count)
  const direction = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const tilt = new THREE.Quaternion()
  const turn = new THREE.Quaternion()
  const lean = new THREE.Euler()
  const scale = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  let placed = 0
  for (let tries = 0; placed < count && tries < count * 20; tries++) {
    // Nearly all lie on the side of the moon the camera can see: within a quarter turn of the chair
    const near = random() < 0.9
    const polar = near ? Math.acos(1 - random() * (1 - Math.cos(1.5))) : Math.acos(1 - 2 * random())
    const around = random() * Math.PI * 2
    direction.set(Math.sin(polar) * Math.sin(around), Math.cos(polar), Math.sin(polar) * Math.cos(around))
    if (keepClear.some((spot) => direction.angleTo(spot.direction) * radius < spot.radius)) continue
    // Many pebbles, few boulders
    const size = 0.008 + 0.034 * random() ** 3.5 + (random() < 0.012 ? 0.05 + 0.07 * random() : 0)
    tilt.setFromUnitVectors(up, direction)
    turn.setFromEuler(lean.set((random() - 0.5) * 0.9, random() * Math.PI * 2, (random() - 0.5) * 0.9))
    scale.set(size * (0.8 + 0.5 * random()), size * (0.7 + 0.5 * random()), size * (0.8 + 0.5 * random()))
    // Sunk a little into the dust
    matrix.compose(direction.clone().multiplyScalar(radius + size * 0.18), tilt.multiply(turn), scale)
    mesh.setMatrixAt(placed, matrix)
    tones[placed] = 0.75 + 0.5 * random()
    placed++
  }
  mesh.count = placed
  mesh.instanceMatrix.needsUpdate = true
  geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tones, 1))
  // The stones are all over the moon: the mesh is never out of view
  mesh.frustumCulled = false

  return {
    mesh,
    dispose() {
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
}
