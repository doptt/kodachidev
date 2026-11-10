import vertSrc from './shaders/bg.vert.glsl?raw'
import fragSrc from './shaders/bg.frag.glsl?raw'

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
  'uContrast', 'uHue', 'uRipple',
] as const

/** The field texture is a quilt of this many cells; the hero still is the top-left cell. */
export const FIELD_CELLS = { cols: 2, rows: 3 }
type UniformName = (typeof UNIFORM_NAMES)[number]

export class BackgroundRenderer {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
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

  constructor(private canvas: HTMLCanvasElement) {}

  /** Creates the context and compiles the program. Returns false if WebGL2 or the shader is unavailable. */
  init(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    if (!gl) return false
    this.gl = gl
    return this.createResources()
  }

  /** Re-creates GL resources after a context restore. */
  restore(): boolean {
    if (!this.gl) return false
    this.program = null
    this.vao = null
    this.texture = null
    this.textureReady = false
    this.bloomTexture = null
    this.bloomReady = false
    const ok = this.createResources()
    if (ok && this.pendingImage?.bitmap) this.uploadTexture(this.pendingImage.bitmap)
    if (ok && this.pendingBloom?.bitmap) this.uploadBloom(this.pendingBloom.bitmap)
    return ok
  }

  private createResources(): boolean {
    const gl = this.gl!
    const vs = compile(gl, gl.VERTEX_SHADER, vertSrc)
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc)
    if (!vs || !fs) return false
    const program = gl.createProgram()
    if (!program) return false
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (import.meta.env.DEV) console.error('[bg] link failed', gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
      return false
    }
    this.program = program
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
    gl.bindVertexArray(this.vao)

    this.texture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    // The field is tileable, so plain REPEAT: no mirror axes to hide.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    return true
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
    if (!gl || !this.bloomTexture || gl.isContextLost()) return
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !(typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap))
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, source)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
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
    this.textureReady = true
  }

  get ready(): boolean {
    return !!this.gl && !!this.program && this.textureReady && !this.gl.isContextLost()
  }

  resize(width: number, height: number) {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
  }

  render(u: FrameUniforms) {
    const gl = this.gl
    if (!gl || !this.program || !this.textureReady || gl.isContextLost()) return
    const l = this.loc
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTexture)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(l.uBloomOn!, this.bloomReady ? 1 : 0)
    gl.uniform2f(l.uRes!, this.canvas.width, this.canvas.height)
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
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    this.disposed = true
    const gl = this.gl
    if (gl && !gl.isContextLost()) {
      if (this.texture) gl.deleteTexture(this.texture)
      if (this.bloomTexture) gl.deleteTexture(this.bloomTexture)
      if (this.vao) gl.deleteVertexArray(this.vao)
      if (this.program) gl.deleteProgram(this.program)
      // Don't loseContext() here: React StrictMode re-mounts onto the same canvas and
      // getContext() would hand back the dead context. The context goes with the element.
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
    this.gl = null
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (import.meta.env.DEV) console.error('[bg] shader compile failed', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
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
