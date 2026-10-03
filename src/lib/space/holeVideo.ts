import { program, uniforms } from './gl'

// Plays the pre-rendered black hole loop on phones. Phones can't play video
// with transparency, so the loop is rendered over black and this turns it
// back into something see-through: the gas is as opaque as it is bright, and
// the shadow (a fixed circle in the frame) is fully opaque so no stars show
// through it.

const VERTEX = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
precision mediump float;
uniform sampler2D uVideo;
varying vec2 vUv;

// Where the shadow sits in the 1080x840 frame, in pixels
const vec2 FRAME = vec2(1080.0, 840.0);
const vec2 SHADOW_CENTER = vec2(545.6, 402.1);
const float SHADOW_RADIUS = 128.0;

void main() {
  vec3 color = texture2D(uVideo, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  float glow = max(color.r, max(color.g, color.b));
  float shadow = 1.0 - smoothstep(SHADOW_RADIUS - 1.5, SHADOW_RADIUS + 0.5, distance(vUv * FRAME, SHADOW_CENTER));
  float alpha = max(glow, shadow);
  // fade out near the edges so the frame never shows
  float edges = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x)
              * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
  // rendered over black, so the colour is already premultiplied
  gl_FragColor = vec4(color, alpha) * edges;
}
`

export class HoleVideo {
  private readonly gl: WebGLRenderingContext
  private readonly program: WebGLProgram
  private readonly texture: WebGLTexture
  private readonly quad: WebGLBuffer

  /** Returns null if WebGL isn't available */
  static create(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false })
    if (!gl) return null
    try {
      return new HoleVideo(gl)
    } catch (err) {
      console.warn('Black hole video failed to start', err)
      return null
    }
  }

  private constructor(gl: WebGLRenderingContext) {
    this.gl = gl
    this.program = program(gl, VERTEX, FRAGMENT, ['aPos'])
    const u = uniforms(gl, this.program, ['uVideo'] as const)

    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.useProgram(this.program)
    gl.uniform1i(u.uVideo, 0)
    gl.disable(gl.BLEND)
    gl.clearColor(0, 0, 0, 0)
  }

  resize(width: number, height: number) {
    const canvas = this.gl.canvas as HTMLCanvasElement
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    this.gl.viewport(0, 0, canvas.width, canvas.height)
  }

  draw(video: HTMLVideoElement) {
    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  dispose() {
    const { gl } = this
    gl.deleteTexture(this.texture)
    gl.deleteBuffer(this.quad)
    gl.deleteProgram(this.program)
  }
}
