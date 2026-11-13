import * as THREE from 'three'
import passVert from './shaders/pass.vert.glsl?raw'
import bloomDownFrag from './shaders/bloom-down.frag.glsl?raw'
import bloomUpFrag from './shaders/bloom-up.frag.glsl?raw'
import compositeFrag from './shaders/composite.frag.glsl?raw'

/**
 * Everything that happens to the picture after the scene is drawn.
 *
 * The scene goes into `target`: linear light, half floats, multisampled (the
 * stage's canvas has no antialiasing of its own), with coverage in alpha. From
 * there a small bloom chain picks up whatever is brighter than sunlit ground,
 * and one last pass lays the sky in behind, applies the film curve and writes
 * to whatever target is bound (the screen).
 */
export class Post {
  readonly target: THREE.WebGLRenderTarget
  readonly composite: THREE.RawShaderMaterial
  /** The bloom chain: the picture halved again and again on the way down, and the blurred sums on the way back up. */
  private downs: THREE.WebGLRenderTarget[] = []
  private ups: THREE.WebGLRenderTarget[] = []
  private readonly down: THREE.RawShaderMaterial
  private readonly up: THREE.RawShaderMaterial
  private readonly triangle: THREE.Mesh
  private readonly camera = new THREE.Camera()
  private readonly blackSky: THREE.CubeTexture
  private wanted = 5

  constructor(samples: number, sky: THREE.CubeTexture | null) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { samples, type: THREE.HalfFloatType, depthBuffer: true })

    // Stands in for the star map when it could not be fetched
    const pixel = new Uint8Array([0, 0, 0, 255])
    this.blackSky = new THREE.CubeTexture(Array.from({ length: 6 }, () => new THREE.DataTexture(pixel, 1, 1)))
    this.blackSky.needsUpdate = true

    const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: passVert, fragmentShader, uniforms, depthTest: false, depthWrite: false })
    this.down = pass(bloomDownFrag, { uSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } })
    this.up = pass(bloomUpFrag, { uSource: { value: null }, uBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 1 } })
    this.composite = pass(compositeFrag, {
      uScene: { value: this.target.texture },
      uBloom: { value: null },
      uSky: { value: sky ?? this.blackSky },
      uSkyFrame: { value: new THREE.Matrix3() },
      uForward: { value: new THREE.Vector3() },
      uRight: { value: new THREE.Vector3() },
      uUp: { value: new THREE.Vector3() },
      uFade: { value: 1 },
      uStars: { value: 1 },
      uSkyGain: { value: 1.5 },
      uGlow: { value: 0.2 },
      uExposure: { value: 1 },
      uAspect: { value: 1 },
      uPixel: { value: 0.001 },
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    this.triangle = new THREE.Mesh(geometry, this.down)
    this.triangle.frustumCulled = false
  }

  /** Sizes the buffers for a canvas of `width` x `height` pixels, with `levels` bloom levels. */
  resize(width: number, height: number, levels: number) {
    if (this.target.width === width && this.target.height === height && this.wanted === levels && this.downs.length) return
    this.wanted = levels
    this.target.setSize(width, height)
    for (const level of [...this.downs, ...this.ups]) level.dispose()
    this.downs = []
    this.ups = []
    let w = width
    let h = height
    for (let i = 0; i < levels; i++) {
      w = Math.max(2, Math.round(w / 2))
      h = Math.max(2, Math.round(h / 2))
      this.downs.push(new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }))
      if (i < levels - 1) this.ups.push(new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }))
    }
  }

  /** Changes the multisampling of the scene buffer (a tier change). */
  setSamples(samples: number) {
    if (this.target.samples === samples) return
    this.target.samples = samples
    // A render target's storage is made once: throw it away so the next use makes it again
    this.target.dispose()
  }

  private draw(renderer: THREE.WebGLRenderer, material: THREE.Material, to: THREE.WebGLRenderTarget | null) {
    this.triangle.material = material
    renderer.setRenderTarget(to)
    renderer.render(this.triangle, this.camera)
  }

  /**
   * The passes on something drawable, for compiling ahead of time: those that
   * write to buffers, and the one that writes to the screen (three.js builds a
   * different program for each kind of destination).
   */
  passes() {
    const on = (material: THREE.Material) => {
      const mesh = new THREE.Mesh(this.triangle.geometry, material)
      mesh.frustumCulled = false
      return mesh
    }
    return { buffers: [on(this.down), on(this.up)], screen: on(this.composite) }
  }

  /**
   * Blooms what is in `target` and writes the finished picture to the screen.
   * With `warm`, stops short of the screen: for getting the buffers made
   * before the scene is first shown.
   */
  render(renderer: THREE.WebGLRenderer, threshold: number, warm = false) {
    let source = this.target
    for (let i = 0; i < this.downs.length; i++) {
      this.down.uniforms.uSource.value = source.texture
      this.down.uniforms.uTexel.value.set(1 / source.width, 1 / source.height)
      this.down.uniforms.uThreshold.value = i === 0 ? threshold : 0
      this.draw(renderer, this.down, this.downs[i])
      source = this.downs[i]
    }
    // Back up: each level is itself plus the blur of everything below it
    for (let i = this.ups.length - 1; i >= 0; i--) {
      this.up.uniforms.uSource.value = source.texture
      this.up.uniforms.uBase.value = this.downs[i].texture
      this.up.uniforms.uTexel.value.set(1 / source.width, 1 / source.height)
      this.draw(renderer, this.up, this.ups[i])
      source = this.ups[i]
    }
    this.composite.uniforms.uBloom.value = source.texture
    if (!warm) this.draw(renderer, this.composite, null)
    renderer.setRenderTarget(null)
  }

  dispose() {
    this.target.dispose()
    this.blackSky.dispose()
    for (const level of [...this.downs, ...this.ups]) level.dispose()
    this.down.dispose()
    this.up.dispose()
    this.composite.dispose()
    this.triangle.geometry.dispose()
  }
}
