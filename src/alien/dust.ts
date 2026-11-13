import * as THREE from 'three'
import type { TierName } from '@/blackhole/quality'
import type { Ground } from './ground'
import { seededRandom } from './maths/schedule'

/**
 * The puff of dust when he is first revealed: a kick of regolith from under
 * the chair's runners and his feet, as if the chair had just been set down.
 *
 * Dust on the Moon does not billow. There is no air to hold it up or carry
 * it, so every grain leaves on its own arc and comes straight back down,
 * slowly, in a sixth of Earth's gravity. Each sprite here is a small clump
 * following exactly such an arc; the whole flight is a formula of the time
 * since the kick, worked out in the vertex shader, so nothing is simulated
 * and nothing is uploaded after the first frame.
 */
const GRAVITY = 1.62
const COUNT: Record<TierName, number> = { ultra: 280, high: 200, medium: 120, low: 64 }

export type DustSite = {
  x: number
  z: number
  /** Half-size of the patch the dust leaves from, across and along, and its turn about the vertical. */
  halfWidth: number
  halfLength: number
  yaw?: number
  /** Share of the grains that come from here. */
  share: number
}

export function buildDust(ground: Ground, sites: DustSite[], tier: TierName) {
  const count = COUNT[tier]
  const random = seededRandom(91)
  const origins = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const seeds = new Float32Array(count * 4)
  const total = sites.reduce((sum, site) => sum + site.share, 0)
  let longest = 0
  let index = 0
  sites.forEach((site, s) => {
    const n = s === sites.length - 1 ? count - index : Math.round((count * site.share) / total)
    const cos = Math.cos(site.yaw ?? 0)
    const sin = Math.sin(site.yaw ?? 0)
    for (let i = 0; i < n && index < count; i++, index++) {
      // Leaves from the edge of the patch, outward
      const angle = random() * Math.PI * 2
      const lx = Math.cos(angle) * site.halfWidth
      const lz = Math.sin(angle) * site.halfLength
      const x = site.x + lx * cos + lz * sin
      const z = site.z - lx * sin + lz * cos
      origins[index * 3] = x
      origins[index * 3 + 1] = ground.height(x, z) + 0.004
      origins[index * 3 + 2] = z
      const out = 0.12 + random() * 0.4
      const rise = 0.18 + random() * random() * 0.55
      const heading = Math.atan2(lx * cos + lz * sin, -lx * sin + lz * cos) + (random() - 0.5) * 0.9
      velocities[index * 3] = Math.sin(heading) * out
      velocities[index * 3 + 1] = rise
      velocities[index * 3 + 2] = Math.cos(heading) * out
      // Size, when it leaves, how opaque, and which corner of the sprite sheet of one
      seeds[index * 4] = 0.012 + random() * 0.03
      seeds[index * 4 + 1] = random() * 0.12
      seeds[index * 4 + 2] = 0.25 + random() * 0.5
      seeds[index * 4 + 3] = random()
      longest = Math.max(longest, seeds[index * 4 + 1] + (2 * rise) / GRAVITY)
    }
  })

  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.setAttribute('origin', new THREE.InstancedBufferAttribute(origins, 3))
  geometry.setAttribute('velocity', new THREE.InstancedBufferAttribute(velocities, 3))
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4))
  geometry.instanceCount = count

  const uniforms = { time: { value: 0 }, tint: { value: new THREE.Color(0.2, 0.2, 0.2) } }
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 origin;
      attribute vec3 velocity;
      attribute vec4 seed;
      uniform float time;
      varying vec2 vCorner;
      varying float vAlpha;
      void main() {
        float flight = 2.0 * velocity.y / ${GRAVITY.toFixed(2)};
        float t = clamp( time - seed.y, 0.0, flight );
        vec3 at = origin + velocity * t;
        at.y -= 0.5 * ${GRAVITY.toFixed(2)} * t * t;
        float life = t / flight;
        // In as it leaves the ground, out as it falls back; gone before the kick and after the landing
        vAlpha = seed.z * smoothstep( 0.0, 0.08, life ) * ( 1.0 - smoothstep( 0.55, 1.0, life ) ) * step( seed.y, time ) * step( time, seed.y + flight );
        float size = seed.x * ( 0.6 + 1.3 * life );
        vCorner = position.xy;
        vec4 mv = modelViewMatrix * vec4( at, 1.0 );
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 tint;
      varying vec2 vCorner;
      varying float vAlpha;
      void main() {
        float d = dot( vCorner, vCorner );
        float soft = 1.0 - smoothstep( 0.1, 1.0, d );
        if ( soft * vAlpha < 0.003 ) discard;
        // Lit from above: the top of each clump a little brighter than its underside
        gl_FragColor = vec4( tint * ( 0.8 + 0.3 * vCorner.y ), soft * vAlpha );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'dust'
  mesh.frustumCulled = false
  mesh.visible = false
  mesh.renderOrder = 2

  let time = Infinity
  return {
    mesh,
    /** Starts the puff. */
    kick() {
      time = 0
      uniforms.time.value = 0
      mesh.visible = true
    },
    /** `radiance` is how bright sunlit ground is in this scene, so the dust matches it. */
    update(dt: number, radiance: number) {
      if (!mesh.visible) return
      time += dt
      uniforms.time.value = time
      uniforms.tint.value.setRGB(radiance * 1.6, radiance * 1.55, radiance * 1.45)
      if (time > longest) mesh.visible = false
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
