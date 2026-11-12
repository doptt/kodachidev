import vertSrc from './shaders/fullscreen.vert.glsl?raw'
import genStreakSrc from './shaders/gen-streak.frag.glsl?raw'
import genNoiseSrc from './shaders/gen-noise.frag.glsl?raw'
import sceneSrc from './shaders/scene.frag.glsl?raw'
import resolveSrc from './shaders/resolve.frag.glsl?raw'
import smearSrc from './shaders/smear.frag.glsl?raw'
import bloomDownSrc from './shaders/bloom-down.frag.glsl?raw'
import bloomUpSrc from './shaders/bloom-up.frag.glsl?raw'
import compositeSrc from './shaders/composite.frag.glsl?raw'
import {
  bindTexture,
  createTarget,
  deletePending,
  deleteTarget,
  finishProgram,
  retirePending,
  startProgram,
  type PendingProgram,
  type Program,
  type Target,
  type TargetOptions,
} from './gl'
import { buildCamera } from './camera'
import { composition, type Frame } from './timeline'
import { TIERS, type Quality } from './quality'

const STREAK_SIZE = { w: 1024, h: 256 }
const NOISE_SIZE = 1024

/** Sub-pixel offsets for temporal accumulation (Halton 2,3). */
const JITTER = Array.from({ length: 16 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5] as const)
function halton(i: number, base: number) {
  let f = 1
  let r = 0
  while (i > 0) {
    f /= base
    r += f * (i % base)
    i = Math.floor(i / base)
  }
  return r
}

export type RenderInput = {
  /** Scene clock, seconds. Drives disk rotation and twinkle. */
  time: number
  frame: Frame
  /** Eased pointer, -1..1, y up. */
  pointer: [number, number]
  /** False under reduced motion: no twinkle, no shake. */
  alive: boolean
}

/**
 * Owns every GL object for the black hole: two baked noise textures, the HDR
 * scene target, the accumulation history, the bloom chain and the final grade.
 */
export class BlackHoleRenderer {
  private gl: WebGL2RenderingContext | null = null
  private programs: Record<string, Program> = {}
  /** Programs still compiling. Null once they are all in `programs`. */
  private pending: Record<string, PendingProgram> | null = null
  private parallel: KHR_parallel_shader_compile | null = null
  private vao: WebGLVertexArrayObject | null = null
  private streak: Target | null = null
  private noise: Target | null = null
  private scene: Target | null = null
  private history: [Target | null, Target | null] = [null, null]
  private smear: [Target | null, Target | null] = [null, null]
  private bloom: Target[] = []
  private quality: Quality = TIERS.high
  private historyIndex = 0
  private historyValid = false
  private frameIndex = 0
  private last: { fwd: number[]; right: number[]; dist: number; tan: number } | null = null
  private dirty = true
  /** Name of the GPU, when the browser will say. */
  gpu = ''

  constructor(private canvas: HTMLCanvasElement) {}

  init(): boolean {
    // The canvas is transparent where the scene is empty, so the page shows through
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    if (!gl) return false
    this.gl = gl
    // Half-float render targets need one of these
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    this.gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
    this.parallel = gl.getExtension('KHR_parallel_shader_compile')
    return this.startPrograms()
  }

  /** Rebuilds everything after a restored context. */
  restore(): boolean {
    this.programs = {}
    this.vao = null
    this.streak = this.noise = this.scene = null
    this.smear = [null, null]
    this.history = [null, null]
    this.bloom = []
    this.historyValid = false
    return !!this.gl && this.startPrograms()
  }

  /**
   * Hands every shader to the driver. Nothing waits for them here: the scene's
   * ray-marcher alone can take most of a second to compile, and waiting would
   * freeze the page for that long. `prepare` picks them up when they are done.
   */
  private startPrograms(): boolean {
    const gl = this.gl!
    const sources: Record<string, string> = {
      genStreak: genStreakSrc,
      genNoise: genNoiseSrc,
      scene: sceneSrc,
      resolve: resolveSrc,
      smear: smearSrc,
      bloomDown: bloomDownSrc,
      bloomUp: bloomUpSrc,
      composite: compositeSrc,
    }
    const pending: Record<string, PendingProgram> = {}
    for (const [name, frag] of Object.entries(sources)) {
      const p = startProgram(gl, vertSrc, frag, name)
      if (!p) {
        for (const started of Object.values(pending)) deletePending(gl, started)
        return false
      }
      pending[name] = p
    }
    this.pending = pending
    return true
  }

  /**
   * Call before rendering. 'pending' while the shaders are still compiling in
   * the background (try again next frame), 'ready' once everything is set up,
   * 'failed' if a shader or a texture could not be made.
   */
  prepare(): 'pending' | 'ready' | 'failed' {
    const gl = this.gl
    if (!gl) return 'failed'
    if (!this.pending) return this.vao ? 'ready' : 'failed'
    if (this.parallel) {
      for (const p of Object.values(this.pending)) {
        if (!gl.getProgramParameter(p.program, this.parallel.COMPLETION_STATUS_KHR)) return 'pending'
      }
    }
    // All finished, or this browser can only compile while we wait
    const pending = this.pending
    this.pending = null
    let ok = true
    for (const [name, p] of Object.entries(pending)) {
      const program = finishProgram(gl, p)
      if (program) this.programs[name] = program
      else ok = false
    }
    if (!ok) return 'failed'
    this.vao = gl.createVertexArray()
    gl.bindVertexArray(this.vao)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    return this.bakeNoise() ? 'ready' : 'failed'
  }

  /** Renders the two noise textures once and builds their mip chains. */
  private bakeNoise(): boolean {
    const gl = this.gl!
    const rgba8: TargetOptions = { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR, wrap: gl.REPEAT }
    this.streak = createTarget(gl, STREAK_SIZE.w, STREAK_SIZE.h, rgba8)
    this.noise = createTarget(gl, NOISE_SIZE, NOISE_SIZE, rgba8)
    if (!this.streak || !this.noise) return false
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
    for (const [target, program] of [
      [this.streak, this.programs.genStreak],
      [this.noise, this.programs.genNoise],
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      gl.viewport(0, 0, target.w, target.h)
      gl.useProgram(program.program)
      gl.uniform2f(program.u('uSize'), target.w, target.h)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindTexture(gl.TEXTURE_2D, target.tex)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return true
  }

  /** Switches tier. Call `resize` afterwards: the canvas size may change with it. */
  setQuality(q: Quality) {
    if (q === this.quality) return
    this.quality = q
    this.dirty = true
  }

  get tier() {
    return this.quality.name
  }

  /** Sizes the canvas for a CSS box and (re)allocates the render targets. */
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number) {
    const q = this.quality
    const area = Math.max(1, cssWidth * cssHeight)
    const dpr = Math.min(devicePixelRatio || 1, q.maxDpr, Math.sqrt(q.maxPixels / area))
    const w = Math.max(2, Math.round(cssWidth * dpr))
    const h = Math.max(2, Math.round(cssHeight * dpr))
    if (!this.dirty && this.canvas.width === w && this.canvas.height === h && this.scene) return
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    this.dirty = false
    this.allocate()
  }

  private allocate() {
    const gl = this.gl
    if (!gl || gl.isContextLost()) return
    const q = this.quality
    // Render above the size of the canvas where the budget allows: thin strands
    // come out finer and steadier than any amount of filtering would make them
    const pixels = this.canvas.width * this.canvas.height * q.scale * q.scale
    const scale = q.scale * Math.max(1, Math.min(q.supersample, Math.sqrt(q.maxInternal / Math.max(1, pixels))))
    const w = Math.max(2, Math.round(this.canvas.width * scale))
    const h = Math.max(2, Math.round(this.canvas.height * scale))
    const hdr: TargetOptions = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE }

    for (const t of [this.scene, ...this.history, ...this.smear, ...this.bloom]) deleteTarget(gl, t)
    this.scene = createTarget(gl, w, h, hdr)
    this.history = [createTarget(gl, w, h, hdr), createTarget(gl, w, h, hdr)]
    this.smear = [createTarget(gl, w, h, hdr), createTarget(gl, w, h, hdr)]
    this.bloom = []
    let bw = w
    let bh = h
    for (let i = 0; i < q.bloom; i++) {
      bw = Math.max(2, bw >> 1)
      bh = Math.max(2, bh >> 1)
      const t = createTarget(gl, bw, bh, hdr)
      if (!t) break
      this.bloom.push(t)
      if (bw <= 4 || bh <= 4) break
    }
    this.historyValid = false
    this.last = null
  }

  get ready(): boolean {
    const gl = this.gl
    return !!gl && !gl.isContextLost() && !this.pending && !!this.vao && !!this.scene && !!this.history[0] && !!this.history[1] && !!this.smear[0] && !!this.smear[1] && this.bloom.length > 1
  }

  /** Forgets the accumulated image, so the next frame starts from scratch. */
  resetHistory() {
    this.historyValid = false
    this.last = null
  }

  /** Number of frames blended into the current image since the history was last reset. */
  get accumulated() {
    return this.frameIndex
  }

  render(input: RenderInput) {
    const gl = this.gl
    if (!gl || !this.ready) return
    const { frame } = input
    const P = this.programs
    const scene = this.scene!
    const cw = this.canvas.width
    const ch = this.canvas.height
    gl.bindVertexArray(this.vao)
    gl.disable(gl.BLEND)

    if (frame.blackout >= 1) {
      // Nothing to draw: the screen is black. Drop the history so the way back starts clean.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, cw, ch)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      this.historyValid = false
      this.last = null
      return
    }

    const aspect = cw / ch
    const cam = buildCamera(frame, composition(aspect), aspect, input.pointer, input.alive ? input.time : 0)
    const pix = (2 * cam.tan[1]) / scene.h
    const holeUv: [number, number] = [cam.holeNdc[0] * 0.5 + 0.5, cam.holeNdc[1] * 0.5 + 0.5]

    // How far the image moved since the last frame, in pixels: decides how much history to trust
    const fwd = Array.from(cam.basis.subarray(6, 9))
    const right = Array.from(cam.basis.subarray(0, 3))
    let moved = 0
    if (this.last) {
      const turn = Math.hypot(fwd[0] - this.last.fwd[0], fwd[1] - this.last.fwd[1], fwd[2] - this.last.fwd[2])
      const roll = Math.hypot(right[0] - this.last.right[0], right[1] - this.last.right[1], right[2] - this.last.right[2])
      const push = Math.abs(Math.log(frame.dist / this.last.dist)) + Math.abs(Math.log(cam.tan[1] / this.last.tan))
      moved = (turn + roll * 0.5) / pix + (push * 0.3 * cam.tan[1]) / pix
    }
    this.last = { fwd, right, dist: frame.dist, tan: cam.tan[1] }
    const blend = this.historyValid ? Math.min(0.9, 0.12 + moved * 0.22) : 1
    const clamp = Math.min(1, Math.max(0, moved * 1.4 - 0.1))
    if (!this.historyValid) this.frameIndex = 0

    // 1. Scene
    const jitter = JITTER[this.frameIndex % JITTER.length]
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo)
    gl.viewport(0, 0, scene.w, scene.h)
    gl.useProgram(P.scene.program)
    gl.uniform2f(P.scene.u('uRes'), scene.w, scene.h)
    gl.uniform2f(P.scene.u('uJitter'), jitter[0], jitter[1])
    gl.uniform1f(P.scene.u('uFrame'), this.frameIndex % 256)
    gl.uniform1f(P.scene.u('uTime'), input.time)
    gl.uniform3f(P.scene.u('uCamPos'), cam.pos[0], cam.pos[1], cam.pos[2])
    gl.uniformMatrix3fv(P.scene.u('uCam'), false, cam.basis)
    gl.uniform2f(P.scene.u('uTan'), cam.tan[0], cam.tan[1])
    gl.uniform1f(P.scene.u('uPix'), pix)
    gl.uniform1i(P.scene.u('uSteps'), this.quality.steps)
    gl.uniform1i(P.scene.u('uDetail'), this.quality.detail)
    gl.uniform2f(P.scene.u('uHole'), cam.holeNdc[0] * 0.5 * aspect, cam.holeNdc[1] * 0.5)
    gl.uniform1f(P.scene.u('uTwinkle'), input.alive ? 1 : 0)
    bindTexture(gl, P.scene, 'uStreak', 0, this.streak!.tex)
    bindTexture(gl, P.scene, 'uNoise', 1, this.noise!.tex)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // 2. Radial streaks, late in the fall. Two passes, long then short, so the
    //    second fills the gaps between the taps of the first, and lays the
    //    result over the sharp scene. It runs before the accumulation so what
    //    banding is left averages out with the jitter.
    let current = scene
    if (frame.smear > 0.003) {
      const [long, out] = this.smear as [Target, Target]
      const taps = this.quality.smearTaps
      const length = frame.smear * 0.3
      gl.useProgram(P.smear.program)
      gl.uniform2f(P.smear.u('uCentre'), holeUv[0], holeUv[1])
      gl.uniform1i(P.smear.u('uTaps'), taps)
      gl.uniform1f(P.smear.u('uFrame'), this.frameIndex % 64)
      bindTexture(gl, P.smear, 'uSharp', 1, scene.tex)
      gl.bindFramebuffer(gl.FRAMEBUFFER, long.fbo)
      gl.uniform1f(P.smear.u('uLength'), length)
      gl.uniform1f(P.smear.u('uMix'), 1)
      bindTexture(gl, P.smear, 'uSrc', 0, scene.tex)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo)
      gl.uniform1f(P.smear.u('uLength'), length / taps)
      gl.uniform1f(P.smear.u('uMix'), 0.88 * Math.pow(frame.smear, 0.7))
      bindTexture(gl, P.smear, 'uSrc', 0, long.tex)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      current = out
    }

    // 3. Accumulate
    const prev = this.history[this.historyIndex]!
    const next = this.history[1 - this.historyIndex]!
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo)
    gl.useProgram(P.resolve.program)
    gl.uniform1f(P.resolve.u('uBlend'), blend)
    gl.uniform1f(P.resolve.u('uClamp'), clamp)
    bindTexture(gl, P.resolve, 'uCur', 0, current.tex)
    bindTexture(gl, P.resolve, 'uHist', 1, prev.tex)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.historyIndex = 1 - this.historyIndex
    this.historyValid = true
    this.frameIndex++
    const src = next

    // 4. Bloom: down the chain, then back up adding each level onto the one above
    gl.useProgram(P.bloomDown.program)
    gl.uniform1f(P.bloomDown.u('uThreshold'), 0.72 / frame.exposure)
    gl.uniform1f(P.bloomDown.u('uKnee'), 0.6 / frame.exposure)
    let from: Target = src
    for (let i = 0; i < this.bloom.length; i++) {
      const to = this.bloom[i]
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo)
      gl.viewport(0, 0, to.w, to.h)
      gl.uniform2f(P.bloomDown.u('uTexel'), 1 / from.w, 1 / from.h)
      gl.uniform1f(P.bloomDown.u('uFirst'), i === 0 ? 1 : 0)
      bindTexture(gl, P.bloomDown, 'uSrc', 0, from.tex)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      from = to
    }
    gl.useProgram(P.bloomUp.program)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    for (let i = this.bloom.length - 1; i > 0; i--) {
      const lower = this.bloom[i]
      const upper = this.bloom[i - 1]
      gl.bindFramebuffer(gl.FRAMEBUFFER, upper.fbo)
      gl.viewport(0, 0, upper.w, upper.h)
      gl.uniform2f(P.bloomUp.u('uTexel'), 1 / lower.w, 1 / lower.h)
      // Wider levels carry a little more, for the soft glow around the tight core
      gl.uniform1f(P.bloomUp.u('uWeight'), 1.12)
      bindTexture(gl, P.bloomUp, 'uSrc', 0, lower.tex)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.disable(gl.BLEND)

    // 5. Grade to the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, cw, ch)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(P.composite.program)
    gl.uniform2f(P.composite.u('uRes'), cw, ch)
    gl.uniform2f(P.composite.u('uHole'), holeUv[0], holeUv[1])
    gl.uniform1f(P.composite.u('uRing'), cam.ring)
    gl.uniform1f(P.composite.u('uExposure'), frame.exposure)
    gl.uniform1f(P.composite.u('uBloomAmt'), 0.15)
    gl.uniform1f(P.composite.u('uFringe'), 1)
    gl.uniform1f(P.composite.u('uSharpen'), 0.55)
    gl.uniform1f(P.composite.u('uVignette'), 0.38)
    gl.uniform1f(P.composite.u('uIris'), frame.iris)
    gl.uniform1f(P.composite.u('uGrain'), 0.035)
    gl.uniform1f(P.composite.u('uTime'), input.alive ? input.time : 0)
    gl.uniform1f(P.composite.u('uBlackout'), frame.blackout)
    bindTexture(gl, P.composite, 'uScene', 0, src.tex)
    bindTexture(gl, P.composite, 'uBloom', 1, this.bloom[0].tex)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    const gl = this.gl
    if (gl && !gl.isContextLost()) {
      for (const t of [this.streak, this.noise, this.scene, ...this.history, ...this.smear, ...this.bloom]) deleteTarget(gl, t)
      for (const p of Object.values(this.programs)) gl.deleteProgram(p.program)
      if (this.pending) retirePending(gl, this.parallel, Object.values(this.pending))
      if (this.vao) gl.deleteVertexArray(this.vao)
      gl.bindVertexArray(null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(null)
      // No loseContext(): React StrictMode re-mounts onto the same canvas, and
      // getContext() would hand the dead context back. It goes with the element.
    }
    this.programs = {}
    this.pending = null
    this.streak = this.noise = this.scene = null
    this.smear = [null, null]
    this.history = [null, null]
    this.bloom = []
    this.vao = null
    this.gl = null
  }
}
