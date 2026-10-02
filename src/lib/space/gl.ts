export function program(gl: WebGLRenderingContext, vertex: string, fragment: string, attributes: readonly string[]) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('createShader failed')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'compile failed')
    return shader
  }
  const p = gl.createProgram()
  if (!p) throw new Error('createProgram failed')
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vertex))
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment))
  // attributes get fixed slots in the order they're listed
  attributes.forEach((name, i) => gl.bindAttribLocation(p, i, name))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link failed')
  return p
}

export function uniforms<T extends string>(gl: WebGLRenderingContext, p: WebGLProgram, names: readonly T[]) {
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) as Record<T, WebGLUniformLocation | null>
}

/** A texture to render into */
export type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

export function target(gl: WebGLRenderingContext, w: number, h: number, old?: Target | null): Target {
  if (old) {
    gl.deleteTexture(old.tex)
    gl.deleteFramebuffer(old.fb)
  }
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fb, w, h }
}
