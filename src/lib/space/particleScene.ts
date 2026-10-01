import type { Formations } from './formations'

/*
 * Draws the hero particles with plain WebGL. No library: it's one buffer,
 * one shader pair and two draw calls (a soft halo pass under a crisp pass).
 *
 * All the shape work happens in the vertex shader. The CPU only sends a
 * handful of uniforms per frame, so it stays cheap even with ~16k points.
 */

export type SceneFrame = {
  time: number
  /** 0..3, which formation we're on (fractions blend between them) */
  morph: number
  /** 0..1, particles flying in on first load */
  intro: number
  yaw: number
  pitch: number
  roll: number
  /** Camera distance from the origin */
  cam: number
  /** Screen offset in clip space (-1..1) */
  x: number
  y: number
  scale: number
  /** Tunnel travel; keeps increasing while the tunnel flows */
  flow: number
  /** Cursor in clip space plus how strongly it bends nearby points */
  mouseX: number
  mouseY: number
  mouseForce: number
  fade: number
}

const VERTEX = /* glsl */ `
precision highp float;

attribute vec3 aA;
attribute vec3 aB;
attribute vec3 aC;
attribute vec3 aD;
attribute vec4 aGlow;
attribute vec4 aSeed;

uniform float uTime;
uniform float uMorph;
uniform float uIntro;
uniform vec3 uRot;
uniform float uCam;
uniform float uFocal;
uniform float uAspect;
uniform vec2 uOffset;
uniform float uScale;
uniform float uPx;
uniform float uMaxSize;
uniform float uFlow;
uniform vec3 uMouse;
uniform float uFade;
uniform float uHalo;

varying vec3 vColor;
varying float vAlpha;
varying float vHalo;

const float PI = 3.14159265;
const vec3 SUN = vec3(-0.62, 0.48, 0.62);

vec3 rotX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
vec3 view(vec3 p) { return rotZ(rotX(rotY(p, uRot.x), uRot.y), uRot.z); }

// How far this particle is through morph step i. Each particle leaves at
// its own moment, so shapes dissolve gradually instead of all at once.
float progress(float i) {
  float x = clamp((uMorph - i) * 1.7 - aSeed.x * 0.7, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

void main() {
  float t = uTime;
  vHalo = uHalo;

  // A: planet. The body turns as one piece; ring and dust orbit slower the
  // further out they are, like real orbits.
  bool lit = aGlow.x < 0.0;
  bool body = lit && length(aA) < 1.2;
  float orbit = length(aA.xz);
  float spin = lit ? 0.07 : 0.22 * pow(max(orbit, 1.3), -1.5);
  vec3 a = rotZ(rotX(rotY(aA, t * spin), 0.38), -0.3);
  float gA = abs(aGlow.x);
  if (lit) {
    gA *= 0.07 + 1.1 * smoothstep(-0.25, 0.75, dot(normalize(a), SUN));
  } else {
    // The planet's shadow falling across the ring
    float along = dot(a, SUN);
    float off = length(a - along * SUN);
    gA *= 1.0 - step(along, 0.0) * 0.8 * (1.0 - smoothstep(0.9, 1.05, off));
  }
  // Hide whatever is behind the planet, so it reads as solid
  vec3 av = view(a);
  if (body) {
    gA *= smoothstep(-0.14, 0.06, av.z);
  } else {
    gA *= 1.0 - step(av.z, 0.0) * (1.0 - smoothstep(0.94, 1.04, length(av.xy)));
  }

  // B: design layers, gently swaying, each layer bobbing out of step
  vec3 b = rotY(aB, sin(t * 0.21) * 0.1);
  b.y += sin(t * 0.7 + aB.z * 4.0) * 0.025;

  // C: devices
  vec3 c = rotY(aC, sin(t * 0.18 + 1.0) * 0.08);
  c.y += sin(t * 0.5) * 0.03;

  // D: tunnel. Depth loops forever; radius narrows toward a bright throat.
  float u = fract(aD.y + uFlow);
  float z = mix(-15.0, 5.0, u);
  float r = (0.16 + 2.7 * exp((z - 5.0) / 3.6)) * (1.0 + aD.z);
  float ang = aD.x + z * 0.32 + t * 0.12;
  vec3 d = vec3(cos(ang) * r, sin(ang) * r, z);
  float gD = aGlow.w * smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.92, 1.0, u));

  float k1 = progress(0.0);
  float k2 = progress(1.0);
  float k3 = progress(2.0);
  vec3 p = mix(mix(mix(a, b, k1), c, k2), d, k3);
  float g = mix(mix(mix(gA, aGlow.y, k1), aGlow.z, k2), gD, k3);

  // Random direction per particle, used for the in-flight billow and intro
  float th = aSeed.w * 18.85 + aSeed.x * 11.0;
  float cz = fract(aSeed.w * 7.31 + aSeed.z * 3.7) * 2.0 - 1.0;
  float sz = sqrt(1.0 - cz * cz);
  vec3 dir = vec3(sz * cos(th), cz, sz * sin(th));

  float flight = sin(k1 * PI) + sin(k2 * PI) + sin(k3 * PI);
  p += dir * flight * (0.3 + 0.7 * aSeed.w);
  p = rotY(p, flight * (aSeed.z - 0.35) * 1.5);
  g *= 1.0 + flight * 0.5;

  // First load: everything spirals in from far away
  float ki = clamp(uIntro * 1.6 - aSeed.x * 0.6, 0.0, 1.0);
  ki = 1.0 - pow(1.0 - ki, 3.0);
  p = mix(rotY(dir * (8.0 + 6.0 * aSeed.z), 2.4), rotY(p, (1.0 - ki) * 1.6), ki);
  g *= mix(0.15, 1.0, ki);

  p = view(p * uScale);

  float dist = uCam - p.z;
  if (dist < 0.06) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    vAlpha = 0.0;
    return;
  }

  vec2 ndc = p.xy * (uFocal / dist);
  ndc.x /= uAspect;
  ndc += uOffset;

  // The cursor acts like a small gravity well, nudging points aside
  vec2 dm = (ndc - uMouse.xy) * vec2(uAspect, 1.0);
  float lm = length(dm) + 0.0001;
  ndc += (dm / lm) * vec2(1.0 / uAspect, 1.0) * uMouse.z * 0.04 * exp(-lm * lm * 24.0);

  gl_Position = vec4(ndc, 0.0, 1.0);

  float size = aSeed.y * (0.6 + 0.4 * sqrt(g)) * uPx * uFocal / dist * mix(1.0, 3.4, uHalo);
  float alpha = g * uFade * (1.0 - 0.55 * smoothstep(6.0, 26.0, dist)) * smoothstep(0.06, 1.4, dist);
  if (size < 1.25) {
    alpha *= size / 1.25;
    size = 1.25;
  }
  gl_PointSize = min(size, uMaxSize);
  vAlpha = alpha * mix(1.0, 0.075, uHalo);

  vec3 violet = vec3(0.46, 0.28, 1.0);
  vec3 lavender = vec3(0.79, 0.68, 1.0);
  vec3 ice = vec3(0.62, 0.76, 1.0);
  vec3 col = mix(violet, lavender, aSeed.z);
  col = mix(col, ice, step(0.9, aSeed.w) * 0.75);
  col = mix(col, vec3(1.0, 0.97, 1.0), clamp((g - 1.1) * 0.6, 0.0, 0.75));
  col = mix(col, vec3(1.0, 0.96, 1.0), pow(1.0 - u, 5.0) * k3 * 0.7);
  vColor = col;
}
`

const FRAGMENT = /* glsl */ `
precision mediump float;

varying vec3 vColor;
varying float vAlpha;
varying float vHalo;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float soft = (1.0 - d) * (1.0 - d);
  float a = mix(soft * 0.6 + exp(-d * 16.0) * 0.75, soft, vHalo) * vAlpha;
  gl_FragColor = vec4(vColor * a, a * 0.35);
}
`

const ATTRIBUTES = [
  ['aA', 3],
  ['aB', 3],
  ['aC', 3],
  ['aD', 3],
  ['aGlow', 4],
  ['aSeed', 4],
] as const

const UNIFORMS = [
  'uTime', 'uMorph', 'uIntro', 'uRot', 'uCam', 'uFocal', 'uAspect', 'uOffset', 'uScale',
  'uPx', 'uMaxSize', 'uFlow', 'uMouse', 'uFade', 'uHalo',
] as const

type Uniform = (typeof UNIFORMS)[number]

/** ~38° vertical field of view, pulled back on narrow screens so wide shapes still fit */
export const focalFor = (aspect: number) => 2.9 * Math.min(1, Math.max(0.52, aspect / 1.35))

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[hero] shader:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export class ParticleScene {
  private readonly gl: WebGLRenderingContext
  private readonly program: WebGLProgram
  private readonly buffer: WebGLBuffer
  private readonly u: Record<Uniform, WebGLUniformLocation | null>
  private readonly count: number
  private readonly maxSize: number
  private width = 1
  private height = 1
  private dpr = 1

  /** Returns null when WebGL isn't available, so the caller can fall back */
  static create(canvas: HTMLCanvasElement, data: Formations) {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    })
    if (!gl) return null
    try {
      return new ParticleScene(gl, data)
    } catch (err) {
      console.warn('[hero] WebGL setup failed', err)
      return null
    }
  }

  private constructor(gl: WebGLRenderingContext, data: Formations) {
    this.gl = gl
    this.count = data.count

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vs || !fs || !program) throw new Error('shader compile failed')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link failed')
    this.program = program

    // Interleave everything into one buffer: 20 floats per particle
    const stride = 20
    const packed = new Float32Array(data.count * stride)
    for (let i = 0; i < data.count; i++) {
      const o = i * stride
      packed.set(data.a.subarray(i * 3, i * 3 + 3), o)
      packed.set(data.b.subarray(i * 3, i * 3 + 3), o + 3)
      packed.set(data.c.subarray(i * 3, i * 3 + 3), o + 6)
      packed.set(data.d.subarray(i * 3, i * 3 + 3), o + 9)
      packed.set(data.glow.subarray(i * 4, i * 4 + 4), o + 12)
      packed.set(data.seed.subarray(i * 4, i * 4 + 4), o + 16)
    }

    const buffer = gl.createBuffer()
    if (!buffer) throw new Error('no buffer')
    this.buffer = buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STATIC_DRAW)

    gl.useProgram(program)
    let offset = 0
    for (const [name, size] of ATTRIBUTES) {
      const loc = gl.getAttribLocation(program, name)
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4)
      }
      offset += size
    }

    this.u = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<
      Uniform,
      WebGLUniformLocation | null
    >

    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
    this.maxSize = Math.min(64, range?.[1] ?? 32)

    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.clearColor(0, 0, 0, 0)
  }

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.dpr = dpr
    const canvas = this.gl.canvas as HTMLCanvasElement
    canvas.width = Math.round(this.width * dpr)
    canvas.height = Math.round(this.height * dpr)
    this.gl.viewport(0, 0, canvas.width, canvas.height)
  }

  render(f: SceneFrame) {
    const { gl, u } = this
    const aspect = this.width / this.height
    const focal = focalFor(aspect)
    const px = 6.2 * this.dpr * Math.min(1.35, Math.max(0.75, this.height / 950))

    gl.clear(gl.COLOR_BUFFER_BIT)
    if (f.fade <= 0.001) return

    gl.useProgram(this.program)
    gl.uniform1f(u.uTime, f.time)
    gl.uniform1f(u.uMorph, f.morph)
    gl.uniform1f(u.uIntro, f.intro)
    gl.uniform3f(u.uRot, f.yaw, f.pitch, f.roll)
    gl.uniform1f(u.uCam, f.cam)
    gl.uniform1f(u.uFocal, focal)
    gl.uniform1f(u.uAspect, aspect)
    gl.uniform2f(u.uOffset, f.x, f.y)
    gl.uniform1f(u.uScale, f.scale)
    gl.uniform1f(u.uPx, px)
    gl.uniform1f(u.uMaxSize, this.maxSize)
    gl.uniform1f(u.uFlow, f.flow)
    gl.uniform3f(u.uMouse, f.mouseX, f.mouseY, f.mouseForce)
    gl.uniform1f(u.uFade, f.fade)

    // Soft glow under a random third of the points (the buffer is shuffled,
    // so the first third is a fair sample), then the points themselves
    gl.uniform1f(u.uHalo, 1)
    gl.drawArrays(gl.POINTS, 0, Math.floor(this.count / 3))
    gl.uniform1f(u.uHalo, 0)
    gl.drawArrays(gl.POINTS, 0, this.count)
  }

  dispose() {
    const { gl } = this
    gl.deleteBuffer(this.buffer)
    gl.deleteProgram(this.program)
  }
}
