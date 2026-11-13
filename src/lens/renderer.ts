import vertSrc from '@/blackhole/shaders/fullscreen.vert.glsl?raw'
import bloomDownSrc from '@/blackhole/shaders/bloom-down.frag.glsl?raw'
import bloomUpSrc from '@/blackhole/shaders/bloom-up.frag.glsl?raw'
import lensSrc from './shaders/lens.frag.glsl?raw'
import gradeSrc from './shaders/grade.frag.glsl?raw'
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
} from '@/blackhole/gl'
import type { Quality } from '@/blackhole/quality'
import { LENS_FLOOR, TABLE_SIZE, deflectionTable, shadowAngle, skyAngle } from './geodesic'
import { MAX_SOURCES, R_HOVER, THETA_STEP, composition, sources, type LensFrame } from './timeline'

/** How far the pointer swings the camera, radians. */
const SWING_X = (2.2 * Math.PI) / 180
const SWING_Y = (1.2 * Math.PI) / 180
/** The six faces of the star map, in the order WebGL numbers them. */
const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const
/** Which size of star map each quality tier takes (the edge of one face, in pixels). */
const SKY_SIZE: Record<Quality['name'], number> = { ultra: 2048, high: 2048, medium: 1024, low: 512 }
/** Seconds the sky takes to come up once its map has arrived. */
const SKY_FADE = 1.2
/**
 * How the Milky Way lies in the scene when the first project is settled: the
 * galaxy's centre straight ahead and this far above level, radians, with the
 * band running across the view behind the picture. The sky turns from there.
 */
const GALAXY_RISE = (6 * Math.PI) / 180
/** How fast the stars drift round the sky on their own, radians per second. */
const STAR_DRIFT = 0.004

export type LensInput = {
  /** Scene clock, seconds. */
  time: number
  frame: LensFrame
  /** Eased pointer, -1..1, y up. */
  pointer: readonly [number, number]
  /** False under reduced motion: no twinkle, no drift. */
  alive: boolean
}

/**
 * Owns every GL object for the lensed sky: the deflection table, the stack of
 * project screenshots, the HDR scene target, the bloom chain and the grade.
 * It draws with a context it is given (the stage's, shared with every other
 * scene), so it sets all the state it relies on at the start of each frame.
 */
export class LensRenderer {
  private gl: WebGL2RenderingContext | null = null
  private programs: Record<string, Program> = {}
  /** Programs still compiling. Null once they are all in `programs`. */
  private pending: Record<string, PendingProgram> | null = null
  private parallel: KHR_parallel_shader_compile | null = null
  private vao: WebGLVertexArrayObject | null = null
  private scene: Target | null = null
  private bloom: Target[] = []
  private table: WebGLTexture | null = null
  private shots: WebGLTexture | null = null
  private sky: WebGLTexture | null = null
  /** Faces of the star map that have been decoded and are waiting to go to the GPU. */
  private skyFaces: ImageBitmap[] | null = null
  private skySize = 0
  private skyUploaded = 0
  /** 0 until the star map is in, then rising to 1. */
  private skyLevel = 0
  private quality: Quality | null = null
  private dirty = true
  /** One entry per project: 0 until its screenshot is in the texture, -1 if it could not be loaded. */
  private loaded: number[] = []
  private width = 0
  private height = 0
  private disposed = false

  /** The deflection table in use, and the radius it was worked out for. */
  private tableData = new Float32Array(TABLE_SIZE)
  private tableRadius = -1
  /** The same for the height the camera hovers at, which the layout is worked out from. */
  private hoverTable = deflectionTable(R_HOVER)


  private images: readonly string[]
  private shotSize: { w: number; h: number }

  constructor(gl: WebGL2RenderingContext, parallel: KHR_parallel_shader_compile | null, images: readonly string[], shotSize = { w: 1600, h: 1000 }) {
    this.gl = gl
    this.parallel = parallel
    this.images = images
    this.shotSize = shotSize
  }

  /** Starts the shaders compiling. False if they could not even be started. */
  init(): boolean {
    return this.startPrograms()
  }

  /** Hands the shaders to the driver without waiting for them; `prepare` picks them up when they are done. */
  private startPrograms(): boolean {
    const gl = this.gl!
    const sources: Record<string, string> = { lens: lensSrc, bloomDown: bloomDownSrc, bloomUp: bloomUpSrc, grade: gradeSrc }
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
    return this.makeTextures() ? 'ready' : 'failed'
  }

  private makeTextures(): boolean {
    const gl = this.gl!
    // The deflection table: one row of floats, read exactly (no filtering)
    this.table = gl.createTexture()
    if (!this.table) return false
    gl.bindTexture(gl.TEXTURE_2D, this.table)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, TABLE_SIZE, 1)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // The screenshots: one layer each, stored as sRGB so they are read back as linear light
    const { w, h } = this.shotSize
    const layers = Math.max(1, this.images.length)
    this.shots = gl.createTexture()
    if (!this.shots) return false
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shots)
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.SRGB8_ALPHA8, w, h, layers)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
    if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))

    this.loaded = this.images.map(() => 0)
    this.images.forEach((src, layer) => void this.loadShot(src, layer, this.shots!))

    // The star map: one black texel until the real one arrives, so the shader always has something to read
    this.sky = gl.createTexture()
    if (!this.sky) return false
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.sky)
    for (let face = 0; face < 6; face++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(3))
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null)
    if (this.quality) this.loadSky(SKY_SIZE[this.quality.name])
    return true
  }

  /**
   * Downloads and decodes the six faces of the star map, off the main thread.
   * The scene does not wait for it: the sky is black until it arrives and
   * fades up when it has.
   */
  private loadSky(size: number) {
    const face = async (name: string) => {
      const response = await fetch(`${import.meta.env.BASE_URL}sky/${size}/${name}.webp`)
      if (!response.ok) throw new Error(`sky ${name}: ${response.status}`)
      // The bytes are data, not a picture to be colour-managed: they go through the shader's own curve
      return createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    }
    Promise.all(FACES.map(face)).then(
      (faces) => {
        if (this.disposed) for (const bitmap of faces) bitmap.close()
        else {
          this.skyFaces = faces
          this.skySize = size
        }
      },
      (err) => {
        // Without its map the scene still runs, over a black sky
        if (import.meta.env.DEV) console.warn('[lens] the star map did not load', err)
      },
    )
  }

  /** True once the whole star map is on the GPU. */
  get skyReady() {
    return this.skyUploaded === FACES.length
  }

  /**
   * Sends one face of the star map to the GPU, if one is waiting. One a frame,
   * because each is a large upload. Called while the scene is being prepared
   * (so the uploads happen long before it is shown) and on every frame after.
   */
  uploadSky(dt: number) {
    const gl = this.gl!
    const faces = this.skyFaces
    if (!faces) {
      if (this.skyUploaded === FACES.length) this.skyLevel = Math.min(1, this.skyLevel + dt / SKY_FADE)
      return
    }
    if (this.skyUploaded === 0) {
      gl.deleteTexture(this.sky)
      this.sky = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.sky)
      gl.texStorage2D(gl.TEXTURE_CUBE_MAP, Math.floor(Math.log2(this.skySize)) + 1, gl.RGB8, this.skySize, this.skySize)
    }
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.sky)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
    const n = this.skyUploaded
    gl.texSubImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + n, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, faces[n])
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL)
    faces[n].close()
    this.skyUploaded++
    if (this.skyUploaded === FACES.length) {
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP)
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      this.skyFaces = null
    }
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null)
  }

  /** Fetches one screenshot, fits it to the layer size and uploads it. */
  private async loadShot(src: string, layer: number, into: WebGLTexture) {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    try {
      await img.decode()
    } catch {
      // The picture stays dark; its details are still on the page
      if (this.shots === into) this.loaded[layer] = -1
      return
    }
    const gl = this.gl
    if (this.disposed || !gl || gl.isContextLost() || this.shots !== into) return
    const { w, h } = this.shotSize
    // Fit like `object-fit: cover; object-position: top`
    const fit = document.createElement('canvas')
    fit.width = w
    fit.height = h
    const ctx = fit.getContext('2d')
    if (!ctx) return
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
    const dw = img.naturalWidth * scale
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (w - dw) / 2, 0, dw, img.naturalHeight * scale)

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, into)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, fit)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null)
    this.loaded[layer] = 1
  }

  /** True once every screenshot is in (or is known not to be coming). */
  get shotsReady() {
    return !!this.shots && this.loaded.length === this.images.length && this.loaded.every((v) => v !== 0)
  }

  /** Switches tier: the render targets are re-made at the next frame. */
  setQuality(q: Quality) {
    if (q === this.quality) return
    this.quality = q
    this.dirty = true
  }

  /** (Re)allocates the render targets for a drawing buffer of this size. */
  private allocate(width: number, height: number) {
    const gl = this.gl
    const q = this.quality
    if (!gl || !q || gl.isContextLost()) return
    this.width = width
    this.height = height
    this.dirty = false
    // This scene is cheap to draw, so it renders above the size of the canvas
    // where the budget allows: the rings are hairlines and want the samples
    const pixels = width * height
    const scale = Math.max(1, Math.min(Math.max(q.supersample, 1.5), Math.sqrt(q.maxInternal / Math.max(1, pixels))))
    const w = Math.max(2, Math.round(width * scale))
    const h = Math.max(2, Math.round(height * scale))
    const hdr: TargetOptions = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE }
    for (const t of [this.scene, ...this.bloom]) deleteTarget(gl, t)
    this.scene = createTarget(gl, w, h, hdr)
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
  }

  get ready(): boolean {
    const gl = this.gl
    return !!gl && !gl.isContextLost() && !this.pending && !!this.vao && !!this.table && !!this.shots
  }

  /**
   * Draws one frame into the default framebuffer, `cw` by `ch` pixels. With
   * `present` false every pass is run but the last one lands in a spare
   * target, not on the canvas: a dress rehearsal, to get first-use costs out of
   * the way before the scene is shown.
   */
  render(input: LensInput, cw: number, ch: number, present = true) {
    const gl = this.gl
    if (!gl || !this.ready) return
    if (this.dirty || cw !== this.width || ch !== this.height || !this.scene) this.allocate(cw, ch)
    if (!this.scene || this.bloom.length < 2) return
    const { frame } = input
    const P = this.programs
    const scene = this.scene
    gl.bindVertexArray(this.vao)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.SCISSOR_TEST)
    gl.colorMask(true, true, true, true)
    this.uploadSky(input.alive ? 1 / 60 : 1)

    if (frame.fade <= 0 && frame.stars <= 0) {
      // Both ends of the stretch are black
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, cw, ch)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindVertexArray(null)
      return
    }

    // The deflection table follows the camera down
    if (Math.abs(frame.radius - this.tableRadius) > 1e-5) {
      this.tableRadius = frame.radius
      deflectionTable(frame.radius, this.tableData)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.table)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TABLE_SIZE, 1, gl.RED, gl.FLOAT, this.tableData)
    }

    // Framing is worked out for the height the camera hovers at, and kept through the fall
    const aspect = cw / ch
    const comp = composition(aspect, shadowAngle(R_HOVER))
    const thetaRead = skyAngle(this.hoverTable, R_HOVER, Math.PI / 2 + comp.centre, comp.reach)
    const lit = sources(frame.phase, this.images.length, thetaRead, frame.lift)

    // Camera: level with the horizon at rest, tipping back to the zenith during the fall
    const sway = input.alive ? 1 : 0
    const yaw = input.pointer[0] * SWING_X * sway
    const tip = frame.pitch / (Math.PI / 2)
    const pitch = comp.pitch + (Math.PI / 2 - comp.pitch) * tip + input.pointer[1] * SWING_Y * sway * (1 - tip)
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const basis = new Float32Array([cy, 0, -sy, -sy * sp, cp, -cy * sp, sy * cp, sp, cy * cp])
    const tanY = comp.tanHalfFov
    const pix = (2 * tanY) / scene.h

    // The stars turn with the projects (about the axis across the view), and drift a little on their own
    const turn = frame.phase * THETA_STEP + frame.lift * thetaRead
    const ct = Math.cos(turn)
    const st = Math.sin(turn)
    const drift = input.alive ? input.time * STAR_DRIFT : 0
    const cd = Math.cos(drift)
    const sd = Math.sin(drift)
    // Scene direction to star-map direction: first the turn about x, then the drift about y, then
    // onto the map's own axes (x the galaxy's centre, y its pole, z along the band).
    // The scene's axes are x right, y up, z ahead; with the galaxy's centre ahead and GALAXY_RISE up,
    // its pole lies up and behind, and the band runs left to right.
    const cg = Math.cos(GALAXY_RISE)
    const sg = Math.sin(GALAXY_RISE)
    // Rows of the turn-and-drift matrix (r0, r1, r2), then the rows of the map's axes applied to them
    const r0 = [cd, sd * st, sd * ct]
    const r1 = [0, ct, -st]
    const r2 = [-sd, cd * st, cd * ct]
    const gx = [0, 1, 2].map((i) => sg * r1[i] + cg * r2[i])
    const gy = [0, 1, 2].map((i) => cg * r1[i] - sg * r2[i])
    const gz = r0
    // Column-major
    const sky = new Float32Array([gx[0], gy[0], gz[0], gx[1], gy[1], gz[1], gx[2], gy[2], gz[2]])

    const centres = new Float32Array(MAX_SOURCES * 3)
    const ups = new Float32Array(MAX_SOURCES * 3)
    const layers = new Float32Array(MAX_SOURCES * 2)
    lit.forEach((s, n) => {
      centres.set([0, Math.cos(s.theta), Math.sin(s.theta)], n * 3)
      ups.set([0, Math.sin(s.theta), -Math.cos(s.theta)], n * 3)
      layers.set([s.index, s.gain * (this.loaded[s.index] ?? 0)], n * 2)
    })
    // Unused slots still need a direction, or the shader divides by nothing
    for (let n = lit.length; n < MAX_SOURCES; n++) {
      centres.set([0, 1, 0], n * 3)
      ups.set([0, 0, -1], n * 3)
    }

    // 1. The sky
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo)
    gl.viewport(0, 0, scene.w, scene.h)
    gl.useProgram(P.lens.program)
    gl.uniform2f(P.lens.u('uTan'), tanY * aspect, tanY)
    gl.uniformMatrix3fv(P.lens.u('uCam'), false, basis)
    gl.uniform1f(P.lens.u('uEdge'), shadowAngle(frame.radius))
    gl.uniform1f(P.lens.u('uReach'), comp.reach)
    gl.uniform1f(P.lens.u('uFloor'), LENS_FLOOR + (0.85 - LENS_FLOOR) * frame.squeeze)
    gl.uniform1f(P.lens.u('uPix'), pix)
    gl.uniformMatrix3fv(P.lens.u('uSky'), false, sky)
    gl.uniform1f(P.lens.u('uSkyOn'), this.skyLevel)
    gl.uniform3fv(P.lens.u('uSrcCentre[0]'), centres)
    gl.uniform3fv(P.lens.u('uSrcUp[0]'), ups)
    gl.uniform2fv(P.lens.u('uSrcLayer[0]'), layers)
    gl.uniform2f(P.lens.u('uHalf'), comp.half[0], comp.half[1])
    gl.uniform1f(P.lens.u('uFade'), frame.fade)
    gl.uniform1f(P.lens.u('uStars'), frame.stars)
    gl.uniform1f(P.lens.u('uRim'), frame.rim)
    bindTexture(gl, P.lens, 'uTable', 0, this.table)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shots)
    gl.uniform1i(P.lens.u('uShots'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.sky)
    gl.uniform1i(P.lens.u('uSkyMap'), 2)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null)

    // 2. Bloom: down the chain, then back up adding each level onto the one above
    gl.useProgram(P.bloomDown.program)
    gl.uniform1f(P.bloomDown.u('uThreshold'), 1.0)
    gl.uniform1f(P.bloomDown.u('uKnee'), 0.25)
    let from: Target = scene
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
      gl.uniform1f(P.bloomUp.u('uWeight'), 1.1)
      bindTexture(gl, P.bloomUp, 'uSrc', 0, lower.tex)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.disable(gl.BLEND)

    // 3. Grade to the canvas (or, in a rehearsal, to the smallest bloom level, which this pass does not read)
    const spare = this.bloom[this.bloom.length - 1]
    gl.bindFramebuffer(gl.FRAMEBUFFER, present ? null : spare.fbo)
    if (present) gl.viewport(0, 0, cw, ch)
    else gl.viewport(0, 0, spare.w, spare.h)
    gl.useProgram(P.grade.program)
    gl.uniform2f(P.grade.u('uRes'), cw, ch)
    gl.uniform1f(P.grade.u('uBloomAmt'), 0.2)
    gl.uniform1f(P.grade.u('uGrain'), 0.03)
    gl.uniform1f(P.grade.u('uTime'), input.alive ? input.time : 0)
    bindTexture(gl, P.grade, 'uScene', 0, scene.tex)
    bindTexture(gl, P.grade, 'uBloom', 1, this.bloom[0].tex)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  dispose() {
    this.disposed = true
    const gl = this.gl
    if (gl && !gl.isContextLost()) {
      for (const t of [this.scene, ...this.bloom]) deleteTarget(gl, t)
      gl.deleteTexture(this.table)
      gl.deleteTexture(this.shots)
      gl.deleteTexture(this.sky)
      for (const p of Object.values(this.programs)) gl.deleteProgram(p.program)
      if (this.pending) retirePending(gl, this.parallel, Object.values(this.pending))
      if (this.vao) gl.deleteVertexArray(this.vao)
      gl.bindVertexArray(null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(null)
    }
    this.programs = {}
    this.pending = null
    this.scene = null
    this.bloom = []
    this.table = this.shots = this.sky = null
    if (this.skyFaces) for (const bitmap of this.skyFaces) bitmap.close()
    this.skyFaces = null
    this.vao = null
    this.gl = null
  }
}
