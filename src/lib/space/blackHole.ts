import { DISK } from './camera'
import { program, target, uniforms, type Target } from './gl'

// The hero black hole, ray traced in a fragment shader. Each pixel's ray is
// bent around the hole (Schwarzschild geodesics, stepped numerically) and
// picks up colour wherever it crosses the disk plane. That gives the arch
// over the top, the thin ring underneath and the photon ring for free.
//
// It renders at reduced resolution into a texture, plus a tiny copy that
// gets blurred into bloom, and the two are composited onto the canvas.

export const RIPPLES = 8

// Shared with the particle shader so the gas and the particles ripple together.
// Each ripple is (x, z, start time, strength) in disk space.
export const RIPPLE_GLSL = /* glsl */ `
uniform vec4 uRip[${RIPPLES}];

float ripple(vec2 q) {
  float w = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 R = uRip[i];
    float age = uTime - R.z;
    if (R.w > 0.0 && age > 0.0 && age < 7.0) {
      float x = length(q - R.xy) - age * 3.4;
      w += sin(x * 2.4) * exp(-x * x / (2.0 + age * 2.5)) * exp(-age * 0.55) * R.w;
    }
  }
  return w;
}
`

const QUAD_VERTEX = /* glsl */ `
attribute vec2 aPos;
varying vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const TRACE = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vNdc;

uniform float uAspect;
uniform float uFocal;
uniform vec2 uOffset;
uniform mat3 uCamRot;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uGain;

const float INNER = ${DISK.inner.toFixed(3)};
const float OUTER = ${DISK.outer.toFixed(3)};
const float SPIN = ${DISK.spin.toFixed(1)};
const float ORBIT = ${DISK.orbit.toFixed(3)};
const float BOUND = OUTER * 1.06;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

${RIPPLE_GLSL}

// Streaky gas, stretched along the orbit. The inner disk orbits faster than
// the outer disk, which would eventually wind any pattern into noise, so two
// copies of it each shear for a while and cross-fade.
float streaks(float r, float phi) {
  float omega = SPIN * ORBIT * pow(r, -1.5);
  float total = 0.0;
  for (int k = 0; k < 2; k++) {
    float phase = fract(uTime / 22.0 + float(k) * 0.5);
    float weight = 1.0 - abs(phase * 2.0 - 1.0);
    float a = phi - omega * phase * 22.0;
    vec2 cs = vec2(cos(a), sin(a));
    vec3 o = vec3(float(k) * 17.0, 0.0, 0.0);
    // broad clumps plus two layers of thin filaments (ridges of the noise)
    float broad = noise(vec3(r * 1.6, cs * 1.3) + o);
    float f1 = 1.0 - abs(noise(vec3(r * 5.0, cs * 2.2) + o + 3.1) * 2.0 - 1.0);
    float f2 = 1.0 - abs(noise(vec3(r * 13.0, cs * 3.4) + o + 7.7) * 2.0 - 1.0);
    float n = broad * 0.5 + f1 * f1 * f1 * 0.38 + f2 * f2 * f2 * f2 * 0.42;
    total += n * weight;
  }
  return total;
}

// Colour and opacity of the disk where a ray crosses it
vec4 disk(vec3 p, vec3 v) {
  float r = length(p.xz);
  if (r < INNER * 0.88 || r > OUTER) return vec4(0.0);
  float w = ripple(p.xz);
  float rr = r + w * 0.8;
  float s = streaks(rr, atan(p.z, p.x));
  float lanes = 0.5 + 0.5 * sin(rr * 3.1 + s * 7.0);
  float edge = smoothstep(INNER * 0.88, INNER * 1.05, r);
  float rim = 1.0 - smoothstep(OUTER * 0.4, OUTER, r);
  float dens = edge * rim * pow(INNER / r, 1.3) * mix(0.12, 1.55, s * s * 1.5) * mix(0.72, 1.12, lanes);
  dens = max(dens * (1.0 + w * 1.1), 0.0);

  // Doppler beaming: gas moving toward the camera is brighter and bluer
  vec3 orbit = SPIN * normalize(vec3(-p.z, 0.0, p.x));
  float beta = sqrt(0.5 / r);
  float doppler = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(orbit, -normalize(v)));
  float gravity = sqrt(max(1.0 - 1.0 / r, 0.0));
  float intensity = dens * pow(doppler, 2.8) * gravity;

  vec3 tint = mix(vec3(0.6, 0.18, 1.0), vec3(0.66, 0.6, 1.0), smoothstep(0.75, 1.45, doppler));
  return vec4(tint * intensity * 3.2, clamp(dens * 1.4, 0.0, 0.94));
}

void main() {
  vec2 ndc = vNdc - uOffset;
  vec3 dir = normalize(uCamRot * vec3(ndc.x * uAspect / uFocal, ndc.y / uFocal, -1.0));
  vec3 pos = uCamPos;

  // Skip rays that never come near the hole
  float b = dot(pos, dir);
  float c = dot(pos, pos) - BOUND * BOUND;
  float disc = b * b - c;
  if (disc < 0.0 || -b + sqrt(disc) < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float enter = -b - sqrt(disc);
  if (enter > 0.0) pos += dir * enter;

  vec3 vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  float impact = sqrt(h2);

  vec3 col = vec3(0.0);
  float T = 1.0;
  float captured = 0.0;
  // Per-pixel offset on the first step turns haze banding into fine grain
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

  for (int i = 0; i < 280; i++) {
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    if (r < 1.0) {
      captured = 1.0;
      break;
    }
    float dt = clamp(0.045 * r, 0.01, 0.9);
    if (i == 0) dt *= 0.5 + jitter;

    // Light bending: a = -3/2 h^2 r / |r|^5 (units of the Schwarzschild radius)
    vel += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
    vec3 next = pos + vel * dt;

    if (pos.y * next.y < 0.0) {
      vec4 d = disk(mix(pos, next, pos.y / (pos.y - next.y)), vel);
      col += T * d.rgb;
      T *= 1.0 - d.a;
    }

    // Faint glowing haze hugging the disk, so it reads as volume
    float hr = length(next.xz);
    float hh = 0.12 + 0.07 * hr;
    float haze = exp(-next.y * next.y / (hh * hh)) * smoothstep(INNER * 0.9, INNER * 1.5, hr) * pow(INNER / max(hr, INNER), 2.0);
    if (haze > 0.002) {
      vec3 orbit = SPIN * normalize(vec3(-next.z, 0.0, next.x));
      float beta = sqrt(0.5 / max(hr, 1.5));
      float doppler = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(orbit, -normalize(vel)));
      col += T * haze * dt * pow(doppler, 2.5) * vec3(0.5, 0.3, 1.0) * 0.16;
    }

    pos = next;
    if (T < 0.015) break;
    if (r > BOUND && dot(pos, vel) > 0.0) break;
  }

  // Soft photon-ring glow hugging the edge of the shadow
  col += vec3(0.55, 0.45, 1.0) * 0.1 * exp(-pow((impact - 2.62) * 2.4, 2.0)) * T;

  vec3 rgb = 1.0 - exp(-col);
  float alpha = max(captured, 1.0 - T);
  gl_FragColor = vec4(rgb, alpha) * uGain;
}
`

const COMPOSITE = /* glsl */ `
precision mediump float;

varying vec2 vNdc;
uniform sampler2D uSharp;
uniform sampler2D uSoft;
uniform vec2 uTexel;
uniform float uBloom;

void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  vec4 sharp = texture2D(uSharp, uv);
  // Wide, cheap blur of the tiny copy
  vec3 glow = texture2D(uSoft, uv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 d = vec2(cos(a), sin(a)) * uTexel;
    glow += texture2D(uSoft, uv + d * 1.6).rgb * 0.06;
    glow += texture2D(uSoft, uv + d * 3.6).rgb * 0.04;
  }
  gl_FragColor = vec4(sharp.rgb + glow * uBloom, sharp.a);
}
`

const TRACE_UNIFORMS = ['uAspect', 'uFocal', 'uOffset', 'uCamRot', 'uCamPos', 'uTime', 'uGain', 'uRip'] as const
const COMPOSITE_UNIFORMS = ['uSharp', 'uSoft', 'uTexel', 'uBloom'] as const

export type HoleFrame = {
  aspect: number
  focal: number
  x: number
  y: number
  camRot: Float32Array
  camPos: number[]
  time: number
  gain: number
  ripples: Float32Array
}

export class BlackHolePass {
  private readonly trace: WebGLProgram
  private readonly composite: WebGLProgram
  private readonly tu: Record<(typeof TRACE_UNIFORMS)[number], WebGLUniformLocation | null>
  private readonly cu: Record<(typeof COMPOSITE_UNIFORMS)[number], WebGLUniformLocation | null>
  private readonly quad: WebGLBuffer
  private sharp: Target | null = null
  private soft: Target | null = null
  private width = 1
  private height = 1
  /** Fraction of the canvas resolution to trace at, lowered if frames are slow */
  private quality = 1
  private slowFrames = 0

  constructor(private readonly gl: WebGLRenderingContext) {
    this.trace = program(gl, QUAD_VERTEX, TRACE, ['aPos'])
    this.composite = program(gl, QUAD_VERTEX, COMPOSITE, ['aPos'])
    this.tu = uniforms(gl, this.trace, TRACE_UNIFORMS)
    this.cu = uniforms(gl, this.composite, COMPOSITE_UNIFORMS)
    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  }

  /** Canvas size in device pixels */
  resize(width: number, height: number, dpr: number) {
    this.width = width
    this.height = height
    // ~1.3 traced pixels per CSS pixel is plenty for soft, glowing gas
    this.quality = Math.min(1, 1.3 / dpr)
    this.allocate()
  }

  private allocate() {
    const { gl } = this
    const w = Math.max(1, Math.round(this.width * this.quality))
    const h = Math.max(1, Math.round(this.height * this.quality))
    this.sharp = target(gl, w, h, this.sharp)
    this.soft = target(gl, Math.max(1, Math.round(this.width / 10)), Math.max(1, Math.round(this.height / 10)), this.soft)
  }

  /** Drops the resolution a notch when frames keep running slow */
  adapt(dt: number) {
    this.slowFrames = dt > 1 / 40 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1)
    if (this.slowFrames > 45 && this.quality > 0.45) {
      this.quality *= 0.85
      this.slowFrames = 0
      this.allocate()
    }
  }

  private bindQuad() {
    const { gl } = this
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    // turn off the particle attributes so WebGL doesn't validate them here
    for (let i = 1; i < 5; i++) gl.disableVertexAttribArray(i)
  }

  /** Draws onto the default framebuffer, which should already be cleared */
  render(f: HoleFrame) {
    const { gl, tu, cu, sharp, soft } = this
    if (!sharp || !soft || f.gain <= 0.002) return

    this.bindQuad()
    gl.disable(gl.BLEND)
    gl.useProgram(this.trace)
    gl.uniform1f(tu.uAspect, f.aspect)
    gl.uniform1f(tu.uFocal, f.focal)
    gl.uniform2f(tu.uOffset, f.x, f.y)
    gl.uniformMatrix3fv(tu.uCamRot, false, f.camRot)
    gl.uniform3f(tu.uCamPos, f.camPos[0], f.camPos[1], f.camPos[2])
    gl.uniform1f(tu.uTime, f.time)
    gl.uniform1f(tu.uGain, f.gain)
    gl.uniform4fv(tu.uRip, f.ripples)

    for (const t of [sharp, soft]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
      gl.viewport(0, 0, t.w, t.h)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.composite)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sharp.tex)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, soft.tex)
    gl.uniform1i(cu.uSharp, 0)
    gl.uniform1i(cu.uSoft, 1)
    gl.uniform2f(cu.uTexel, 1 / soft.w, 1 / soft.h)
    gl.uniform1f(cu.uBloom, 0.9)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  dispose() {
    const { gl } = this
    for (const t of [this.sharp, this.soft]) {
      if (!t) continue
      gl.deleteTexture(t.tex)
      gl.deleteFramebuffer(t.fb)
    }
    gl.deleteBuffer(this.quad)
    gl.deleteProgram(this.trace)
    gl.deleteProgram(this.composite)
  }
}
