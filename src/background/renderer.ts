import vertSrc from './shaders/bg.vert.glsl?raw'
import fragSrc from './shaders/bg.frag.glsl?raw'
import { finishProgram, retirePending, startProgram, type PendingProgram } from '@/blackhole/gl'

/** Everything the shader needs for one frame. Produced by the controller. */
export type FrameUniforms = {
  time: number
  flow: number
  camX: number
  camY: number
  camRot: number
  zoom: number
  parallaxX: number
  parallaxY: number
  waveAmp: number
  warpScale: number
  lightAngle: number
  lightStr: number
  stars: number
  darkness: number
  contrast: number
  hue: number
  ripple: number
}

const UNIFORM_NAMES = [
  'uTex', 'uBloom', 'uBloomOn', 'uRes', 'uTexSize', 'uCells', 'uTime', 'uFlow', 'uCam', 'uCamRot', 'uZoom', 'uParallax',
  'uTexAspect', 'uWaveAmp', 'uWarpScale', 'uLightAngle', 'uLightStr', 'uStars', 'uDarkness',
  'uContrast', 'uHue', 'uRipple', 'uVeil',
] as const

/** The field texture is a quilt of this many cells; the hero still is the top-left cell. */
export const FIELD_CELLS = { cols: 2, rows: 3 }
type UniformName = (typeof UNIFORM_NAMES)[number]

/**
 * Draws the purple field. It is one of the stage's scenes (see scene.ts): it
 * is handed the stage's GL context, and binds everything it uses each frame,
 * because other scenes draw with the same context in between.
 */
export class BackgroundRenderer {
  private program: WebGLProgram | null = null
  private pending: PendingProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private texture: WebGLTexture | null = null
  private texAspect = 16 / 9
  private texSize = { w: 1, h: 1 }
  private textureReady = false
  private loc: Partial<Record<UniformName, WebGLUniformLocation | null>> = {}
  private disposed = false
  private pendingImage: { src: string; bitmap: TexImageSource | null } | null = null
  private bloomTexture: WebGLTexture | null = null
  private bloomReady = false
  private pendingBloom: { src: string; bitmap: TexImageSource | null } | null = null

  private gl: WebGL2RenderingContext | null
  private parallel: KHR_parallel_shader_compile | null

  constructor(gl: WebGL2RenderingContext, parallel: KHR_parallel_shader_compile | null) {
    this.gl = gl
    this.parallel = parallel
  }

  /** Hands the shader to the driver to compile in the background. False if it could not even be started. */
  init(): boolean {
    this.pending = startProgram(this.gl!, vertSrc, fragSrc, 'bg')
    return !!this.pending
  }

  /** 'pending' while the shader compiles or the field image loads; 'ready' once both are in. */
  prepare(): 'pending' | 'ready' | 'failed' {
    const gl = this.gl
    if (!gl) return 'failed'
    if (this.pending) {
      if (this.parallel && !gl.getProgramParameter(this.pending.program, this.parallel.COMPLETION_STATUS_KHR)) return 'pending'
      const made = finishProgram(gl, this.pending)
      this.pending = null
      if (!made) return 'failed'
      this.program = made.program
      this.createResources()
      if (this.pendingImage?.bitmap) this.uploadTexture(this.pendingImage.bitmap)
      if (this.pendingBloom?.bitmap) this.uploadBloom(this.pendingBloom.bitmap)
    }
    if (!this.program) return 'failed'
    return this.textureReady ? 'ready' : 'pending'
  }

  private createResources() {
    const gl = this.gl!
    const program = this.program!
    gl.useProgram(program)
    for (const name of UNIFORM_NAMES) this.loc[name] = gl.getUniformLocation(program, name)
    gl.uniform1i(this.loc.uTex ?? null, 0)
    gl.uniform1i(this.loc.uBloom ?? null, 1)

    // Bloom map on unit 1: starts as one black texel so the shader is valid before it loads.
    this.bloomTexture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.vao = gl.createVertexArray()

    this.texture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    // The field is tileable, so plain REPEAT: no mirror axes to hide.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }

  /** Loads (or swaps) the still image. Resolves when the texture is on the GPU. */
  async loadImage(src: string): Promise<boolean> {
    if (this.pendingImage?.src === src && this.pendingImage.bitmap) return true
    this.pendingImage = { src, bitmap: null }
    const source = await decodeImage(src)
    if (!source || this.disposed || this.pendingImage?.src !== src) return false
    this.pendingImage.bitmap = source
    this.uploadTexture(source)
    return true
  }

  /**
   * Loads the baked bloom map (glow of the field's bright specks, same layout as the
   * field at a quarter of the size). Optional: without it the shader just skips the glow.
   */
  async loadBloom(src: string): Promise<boolean> {
    if (this.pendingBloom?.src === src && this.pendingBloom.bitmap) return true
    this.pendingBloom = { src, bitmap: null }
    const source = await decodeImage(src)
    if (!source || this.disposed || this.pendingBloom?.src !== src) return false
    this.pendingBloom.bitmap = source
    this.uploadBloom(source)
    return true
  }

  private uploadBloom(source: TexImageSource) {
    const gl = this.gl
    // Before the shader is in there is no texture to fill: `prepare` uploads the kept image then
    if (!gl || !this.bloomTexture || gl.isContextLost()) return
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !(typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap))
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, source)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.activeTexture(gl.TEXTURE0)
    this.bloomReady = true
  }

  private uploadTexture(source: TexImageSource) {
    const gl = this.gl
    if (!gl || !this.texture || gl.isContextLost()) return
    const w = 'width' in source ? (source as { width: number }).width : 1
    const h = 'height' in source ? (source as { height: number }).height : 1
    this.texSize = { w, h }
    this.texAspect = (w / FIELD_CELLS.cols) / Math.max(1, h / FIELD_CELLS.rows)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    // ImageBitmap was flipped at decode time; HTMLImageElement needs the GL flip.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !(typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap))
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, source)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    this.textureReady = true
  }

  /** Draws one frame into the default framebuffer. `veil` (0..1) fades it to black. */
  render(u: FrameUniforms, width: number, height: number, veil: number) {
    const gl = this.gl
    if (!gl || !this.program || !this.textureReady || gl.isContextLost()) return
    const l = this.loc
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, width, height)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.SCISSOR_TEST)
    gl.colorMask(true, true, true, true)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTexture)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(l.uTex ?? null, 0)
    gl.uniform1i(l.uBloom ?? null, 1)
    gl.uniform1f(l.uBloomOn!, this.bloomReady ? 1 : 0)
    gl.uniform2f(l.uRes!, width, height)
    gl.uniform2f(l.uTexSize!, this.texSize.w, this.texSize.h)
    gl.uniform2f(l.uCells!, FIELD_CELLS.cols, FIELD_CELLS.rows)
    gl.uniform1f(l.uTime!, u.time)
    gl.uniform1f(l.uFlow!, u.flow)
    gl.uniform2f(l.uCam!, u.camX, u.camY)
    gl.uniform1f(l.uCamRot!, u.camRot)
    gl.uniform1f(l.uZoom!, u.zoom)
    gl.uniform2f(l.uParallax!, u.parallaxX, u.parallaxY)
    gl.uniform1f(l.uTexAspect!, this.texAspect)
    gl.uniform1f(l.uWaveAmp!, u.waveAmp)
    gl.uniform1f(l.uWarpScale!, u.warpScale)
    gl.uniform1f(l.uLightAngle!, u.lightAngle)
    gl.uniform1f(l.uLightStr!, u.lightStr)
    gl.uniform1f(l.uStars!, u.stars)
    gl.uniform1f(l.uDarkness!, u.darkness)
    gl.uniform1f(l.uContrast!, u.contrast)
    gl.uniform1f(l.uHue!, u.hue)
    gl.uniform1f(l.uRipple!, u.ripple)
    gl.uniform1f(l.uVeil!, veil)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  dispose() {
    this.disposed = true
    const gl = this.gl
    if (gl && !gl.isContextLost()) {
      if (this.texture) gl.deleteTexture(this.texture)
      if (this.bloomTexture) gl.deleteTexture(this.bloomTexture)
      if (this.vao) gl.deleteVertexArray(this.vao)
      if (this.program) gl.deleteProgram(this.program)
      if (this.pending) retirePending(gl, this.parallel, [this.pending])
      gl.bindVertexArray(null)
      gl.bindTexture(gl.TEXTURE_2D, null)
      gl.useProgram(null)
    }
    const bmp = this.pendingImage?.bitmap
    if (bmp && typeof ImageBitmap !== 'undefined' && bmp instanceof ImageBitmap) bmp.close()
    this.pendingImage = null
    const bloomBmp = this.pendingBloom?.bitmap
    if (bloomBmp && typeof ImageBitmap !== 'undefined' && bloomBmp instanceof ImageBitmap) bloomBmp.close()
    this.pendingBloom = null
    this.bloomTexture = null
    this.texture = null
    this.vao = null
    this.program = null
    this.pending = null
    this.gl = null
  }
}

/** Fetches and decodes an image, flipped for GL when the browser can do that at decode time. */
async function decodeImage(src: string): Promise<TexImageSource | null> {
  const image = await loadImageElement(src).catch(() => null)
  if (!image) return null
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(image, { imageOrientation: 'flipY', premultiplyAlpha: 'none' })
    } catch {
      return image
    }
  }
  return image
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed to load ${src}`))
    img.src = src
  })
}
