/** Small WebGL2 helpers shared by the black hole renderer. No state of their own. */

export type Program = {
  program: WebGLProgram
  /** Uniform location by name (cached; null when the shader optimised it away). */
  u: (name: string) => WebGLUniformLocation | null
}

export type Target = {
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

/** A program that has been handed to the driver to compile and link, but not yet checked. */
export type PendingProgram = {
  program: WebGLProgram
  vs: WebGLShader
  fs: WebGLShader
  label: string
}

/**
 * Starts compiling and linking a program without waiting for it. Asking for a
 * compile or link status blocks until the driver has finished, which for a
 * large shader can be most of a second; so nothing is asked here. Where the
 * browser supports KHR_parallel_shader_compile the work carries on in the
 * background, and `finishProgram` is called once it reports completion.
 */
export function startProgram(gl: WebGL2RenderingContext, vert: string, frag: string, label: string): PendingProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!vs || !fs || !program) {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    if (program) gl.deleteProgram(program)
    return null
  }
  gl.shaderSource(vs, vert)
  gl.shaderSource(fs, frag)
  gl.compileShader(vs)
  gl.compileShader(fs)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  return { program, vs, fs, label }
}

/** Checks a started program (waiting for it if it has not finished) and wraps it for use. */
export function finishProgram(gl: WebGL2RenderingContext, pending: PendingProgram): Program | null {
  const { program, vs, fs, label } = pending
  const ok = gl.getProgramParameter(program, gl.LINK_STATUS)
  if (!ok && import.meta.env.DEV) {
    console.error(
      `[blackhole] ${label} failed\n${gl.getShaderInfoLog(vs) ?? ''}\n${gl.getShaderInfoLog(fs) ?? ''}\n${gl.getProgramInfoLog(program) ?? ''}`,
    )
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!ok) {
    gl.deleteProgram(program)
    return null
  }
  const cache = new Map<string, WebGLUniformLocation | null>()
  return {
    program,
    u: (name) => {
      let loc = cache.get(name)
      if (loc === undefined) {
        loc = gl.getUniformLocation(program, name)
        cache.set(name, loc)
      }
      return loc
    },
  }
}

export function deletePending(gl: WebGL2RenderingContext, pending: PendingProgram) {
  gl.deleteShader(pending.vs)
  gl.deleteShader(pending.fs)
  gl.deleteProgram(pending.program)
}

/**
 * Deletes programs that may still be compiling, once the driver has finished
 * with each. Deleting one in mid-compile is legal, but the browser then logs a
 * warning on every frame until that compile ends. (React's StrictMode does
 * exactly this in development: it mounts, unmounts and mounts again.)
 */
export function retirePending(gl: WebGL2RenderingContext, parallel: KHR_parallel_shader_compile | null, pending: PendingProgram[]) {
  let left = pending
  const tick = () => {
    if (gl.isContextLost()) return
    left = left.filter((p) => {
      if (parallel && !gl.getProgramParameter(p.program, parallel.COMPLETION_STATUS_KHR)) return true
      deletePending(gl, p)
      return false
    })
    if (left.length) requestAnimationFrame(tick)
  }
  tick()
}

export type TargetOptions = {
  internalFormat: number
  format: number
  type: number
  filter: number
  wrap: number
}

/** A texture with a framebuffer around it. Returns null if the format isn't renderable here. */
export function createTarget(gl: WebGL2RenderingContext, w: number, h: number, o: TargetOptions): Target | null {
  const tex = gl.createTexture()
  const fbo = gl.createFramebuffer()
  if (!tex || !fbo) return null
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, o.internalFormat, w, h, 0, o.format, o.type, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, o.filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, o.wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, o.wrap)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (!ok) {
    gl.deleteTexture(tex)
    gl.deleteFramebuffer(fbo)
    return null
  }
  return { fbo, tex, w, h }
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target | null) {
  if (!t) return
  gl.deleteFramebuffer(t.fbo)
  gl.deleteTexture(t.tex)
}

/** Binds `tex` to texture unit `unit` and points the sampler uniform at it. */
export function bindTexture(gl: WebGL2RenderingContext, p: Program, name: string, unit: number, tex: WebGLTexture | null) {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.uniform1i(p.u(name), unit)
}
