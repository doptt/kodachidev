import * as THREE from 'three'
import { CHAMPAGNE, PIN } from './config'
import pinVert from './shaders/pin.vert.glsl?raw'
import pinFrag from './shaders/pin.frag.glsl?raw'

/**
 * A pin as it stands on the moon: a thin stem, a small bright head and a soft
 * halo round the head. (Its pulse ring is drawn by the ground itself, so that
 * it lies on the terrain.) The group's origin is the foot of the stem and +Y
 * is up the stem.
 */
export type Pin3d = {
  id: string
  group: THREE.Group
  /** The head, for finding where the pin is on screen. */
  head: THREE.Object3D
  /** 0..1: how lit up it is because its label is open. Eased by the scene. */
  lift: number
  /** Sets how much of the pin can be seen (0 behind the moon .. 1) and how lit up it is. */
  show(visible: number, lift: number): void
}

export type Pins3d = {
  pins: Pin3d[]
  dispose(): void
}

/** A soft round glow, bright in the middle, gone at the edge. */
function haloTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.42)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

export function buildPins(ids: readonly string[]): Pins3d {
  const stemGeometry = new THREE.CylinderGeometry(PIN.stem * 0.55, PIN.stem, PIN.height, 10, 1, true)
  stemGeometry.translate(0, PIN.height / 2, 0)
  const headGeometry = new THREE.SphereGeometry(PIN.head, 28, 18)
  const glow = haloTexture()
  const materials: THREE.Material[] = []

  const lit = (bead: number) =>
    new THREE.ShaderMaterial({
      vertexShader: pinVert,
      fragmentShader: pinFrag,
      transparent: true,
      uniforms: { uLight: { value: new THREE.Color(CHAMPAGNE[0], CHAMPAGNE[1], CHAMPAGNE[2]) }, uGain: { value: 1 }, uOpacity: { value: 1 }, uBead: { value: bead }, uLength: { value: PIN.height } },
    })

  const pins = ids.map((id): Pin3d => {
    const stemMaterial = lit(0)
    const headMaterial = lit(1)
    // Adds its light to what is behind it, and leaves the coverage in alpha alone: the stars show through a glow
    const haloMaterial = new THREE.SpriteMaterial({
      map: glow,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    })
    materials.push(stemMaterial, headMaterial, haloMaterial)

    const group = new THREE.Group()
    group.name = `pin-${id}`
    const stem = new THREE.Mesh(stemGeometry, stemMaterial)
    const head = new THREE.Mesh(headGeometry, headMaterial)
    // On sunlit ground a glow is hard to see; the long thin shadow is what says something stands here
    stem.castShadow = true
    head.castShadow = true
    head.position.y = PIN.height
    const halo = new THREE.Sprite(haloMaterial)
    halo.position.y = PIN.height
    group.add(stem, head, halo)

    const pin: Pin3d = {
      id,
      group,
      head,
      lift: 0,
      show(visible, lift) {
        group.visible = visible > 0.003
        stemMaterial.uniforms.uOpacity.value = visible
        headMaterial.uniforms.uOpacity.value = visible
        haloMaterial.opacity = visible
        // Brighter than white: the bloom takes the head from there
        stemMaterial.uniforms.uGain.value = 2.2 + 2 * lift
        headMaterial.uniforms.uGain.value = 2.2 + 2 * lift
        haloMaterial.color.setRGB(CHAMPAGNE[0], CHAMPAGNE[1], CHAMPAGNE[2]).multiplyScalar(0.5 + 0.6 * lift)
        head.scale.setScalar(1 + 0.3 * lift)
        halo.scale.setScalar(PIN.head * (9 + 5 * lift))
      },
    }
    pin.show(1, 0)
    return pin
  })

  return {
    pins,
    dispose() {
      stemGeometry.dispose()
      headGeometry.dispose()
      glow.dispose()
      for (const material of materials) material.dispose()
    },
  }
}
