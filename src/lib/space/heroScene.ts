import { BlackHolePass } from './blackHole'
import { DISK, diskCamera, focalFor } from './camera'
import type { Formations } from './formations'
import { program, uniforms } from './gl'

/*
 * Draws the hero: the ray-traced black hole first, then ~20k particles on
 * top with additive blending (a soft halo pass under a crisp pass).
 *
 * The particles do all their shape work in the vertex shader: blending
 * between formations, orbits, cursor ripples, and gravitational lensing
 * around the black hole (a thin-lens approximation, so particles behind the
 * hole bend into the same arch the ray tracer draws, plus a fainter second
 * image underneath). The CPU only sends uniforms each frame.
 */

export type SceneFrame = {
  time: number
  dt: number
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
  /** Cursor in clip space plus how strongly it pushes nearby points */
  mouseX: number
  mouseY: number
  mouseForce: number
  fade: number
  /** 0..1, how present the black hole is */
  hole: number
  /** Cursor ripples: x, z (disk space), start time, strength. 8 of them. */
  ripples: Float32Array
}

const n = (v: number) => v.toFixed(4)

const RIPPLE_GLSL = /* glsl */ `
uniform vec4 uRip[8];
float ripple(vec2 q) {
  float w = 0.0;
  for (int i = 0; i < 8; i++) {
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
uniform float uLens;
uniform float uImage;

varying vec3 vColor;
varying float vAlpha;
varying float vHalo;
varying float vStar;

const float PI = 3.14159265;
const float RS = ${n(DISK.rs)};
const float INNER = ${n(DISK.inner)};
const float OUTER = ${n(DISK.outer)};
const float TILT = ${n(DISK.tilt)};
const float DROLL = ${n(DISK.roll)};
const float SPIN = ${n(DISK.spin)};
const float ORBIT = ${n(DISK.orbit)};

${RIPPLE_GLSL}

vec3 rotX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
vec3 view(vec3 p) { return rotZ(rotX(rotY(p, uRot.x), uRot.y), uRot.z); }
vec3 toModel(vec3 q) { return rotZ(rotX(q, TILT), DROLL); }

// How far this particle is through morph step i. Each particle leaves at
// its own moment, so shapes dissolve gradually instead of all at once.
float progress(float i) {
  float x = clamp((uMorph - i) * 1.7 - aSeed.x * 0.7, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

void hide() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vColor = vec3(0.0);
  vAlpha = 0.0;
  vStar = 0.0;
}

void main() {
  float t = uTime;
  vHalo = uHalo;

  // A: accretion disk. Keplerian orbits; ripples lift the gas as they pass.
  vec3 q = aA;
  float orbitR = max(length(q.xz), 0.001);
  q = rotY(q, -SPIN * ORBIT * pow(max(orbitR, INNER), -1.5) * t);
  float w = orbitR < OUTER * 1.4 ? ripple(q.xz) : 0.0;
  q.y += w * 0.55;
  vec3 a = toModel(q * RS);
  // Doppler beaming, matching the ray-traced gas
  vec3 orbitDir = view(toModel(SPIN * vec3(-q.z, 0.0, q.x) / orbitR));
  float beta = sqrt(0.5 / max(orbitR, INNER));
  float gA = aGlow.x * (1.0 + max(w, 0.0) * 0.9) * pow(sqrt(1.0 - beta * beta) / (1.0 - beta * orbitDir.z), 2.5);

  // B: Orion, swaying gently
  vec3 b = rotY(aB, sin(t * 0.2) * 0.12);
  b.y += sin(t * 0.5) * 0.02;

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
    hide();
    return;
  }
  vec2 sky = p.xy / dist;

  // Gravitational lensing around the hole at the origin. Points behind it
  // are seen at the thin-lens image positions: the main image is pushed
  // outward (the arch), the second one lands on the opposite side.
  float lensed = 1.0;
  if (uLens > 0.001) {
    float rsW = RS * uScale;
    float behind = -p.z;
    if (behind > 0.0) {
      float beta2 = length(sky) + 1e-6;
      float e2 = 2.0 * rsW * behind / (uCam * dist);
      float root = sqrt(beta2 * beta2 + 4.0 * e2);
      float uu = beta2 / sqrt(e2);
      float mu = (uu * uu + 2.0) / (2.0 * uu * sqrt(uu * uu + 4.0));
      float img = uImage > 0.5 ? 0.5 * (beta2 - root) : 0.5 * (beta2 + root);
      mu = uImage > 0.5 ? mu - 0.5 : mu + 0.5;
      sky = mix(sky, sky / beta2 * img, uLens);
      lensed = mix(1.0, clamp(mu, 0.0, 2.5), uLens);
      // Images that land inside the shadow are gone
      float shadow = 2.6 * rsW / uCam;
      lensed *= 1.0 - uLens * (1.0 - smoothstep(shadow * 0.95, shadow * 1.05, abs(img)));
    } else if (uImage > 0.5) {
      lensed = 0.0;
    }
    // Anything that strays across the horizon is swallowed
    lensed *= 1.0 - uLens * (1.0 - smoothstep(1.0, 1.8, length(p) / rsW));
  } else if (uImage > 0.5) {
    lensed = 0.0;
  }
  if (lensed <= 0.001) {
    hide();
    return;
  }

  vec2 ndc = sky * uFocal;
  ndc.x /= uAspect;
  ndc += uOffset;

  // The cursor acts like a small gravity well, nudging points aside
  vec2 dm = (ndc - uMouse.xy) * vec2(uAspect, 1.0);
  float lm = length(dm) + 0.0001;
  ndc += (dm / lm) * vec2(1.0 / uAspect, 1.0) * uMouse.z * 0.04 * exp(-lm * lm * 24.0);

  gl_Position = vec4(ndc, 0.0, 1.0);

  // Constellation stars (glow over 3) are drawn big, with spikes
  float star = smoothstep(2.95, 3.2, g) * (1.0 - uHalo);
  vStar = star;

  float size = aSeed.y * (0.6 + 0.4 * sqrt(g)) * uPx * uFocal / dist * mix(1.0, 3.4, uHalo);
  size *= 1.0 + star * (7.5 + (g - 3.2) * 5.0) / aSeed.y;
  float alpha = g * uFade * lensed * (1.0 - 0.55 * smoothstep(6.0, 26.0, dist)) * smoothstep(0.06, 1.4, dist);
  alpha *= mix(1.0, 0.32, star);
  if (size < 1.25) {
    alpha *= size / 1.25;
    size = 1.25;
  }
  gl_PointSize = min(size, uMaxSize);
  vAlpha = alpha * mix(1.0, 0.075, uHalo) * mix(1.0, 0.45, uImage);

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
varying float vStar;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float soft = (1.0 - d) * (1.0 - d);
  float dot1 = soft * 0.6 + exp(-d * 16.0) * 0.75;
  // Flared star: tight core, soft halo and four thin diffraction spikes
  vec2 ac = abs(c);
  float spikes = exp(-ac.y * 130.0) * (1.0 - ac.x * 2.0) + exp(-ac.x * 130.0) * (1.0 - ac.y * 2.0);
  float flare = exp(-d * 70.0) * 1.6 + exp(-d * 10.0) * 0.3 + spikes * 0.7;
  float a = mix(mix(dot1, flare, vStar), soft, vHalo) * vAlpha;
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
  'uPx', 'uMaxSize', 'uFlow', 'uMouse', 'uFade', 'uHalo', 'uLens', 'uImage', 'uRip',
] as const

export class HeroScene {
  private readonly gl: WebGLRenderingContext
  private readonly program: WebGLProgram
  private readonly buffer: WebGLBuffer
  private readonly u: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>
  private readonly count: number
  private readonly maxSize: number
  private readonly hole: BlackHolePass | null
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
      return new HeroScene(gl, data)
    } catch (err) {
      console.warn('[hero] WebGL setup failed', err)
      return null
    }
  }

  private constructor(gl: WebGLRenderingContext, data: Formations) {
    this.gl = gl
    this.count = data.count
    this.program = program(gl, VERTEX, FRAGMENT, ATTRIBUTES.map(([name]) => name))
    this.u = uniforms(gl, this.program, UNIFORMS)

    // The black hole is a bonus: if its shader won't build, keep the particles
    let hole: BlackHolePass | null = null
    try {
      hole = new BlackHolePass(gl)
    } catch (err) {
      console.warn('[hero] black hole disabled', err)
    }
    this.hole = hole

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
    this.buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STATIC_DRAW)

    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
    this.maxSize = Math.min(96, range?.[1] ?? 32)

    gl.disable(gl.DEPTH_TEST)
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
    this.hole?.resize(canvas.width, canvas.height, dpr)
  }

  private bindParticles() {
    const { gl } = this
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    let offset = 0
    ATTRIBUTES.forEach(([, size], i) => {
      gl.enableVertexAttribArray(i)
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, 20 * 4, offset * 4)
      offset += size
    })
  }

  render(f: SceneFrame) {
    const { gl, u } = this
    const aspect = this.width / this.height
    const focal = focalFor(aspect)
    const px = 6.2 * this.dpr * Math.min(1.35, Math.max(0.75, this.height / 950))

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (f.fade <= 0.001) return

    const lens = this.hole ? f.hole : 0
    if (this.hole && lens > 0.002) {
      const camera = diskCamera(f)
      this.hole.render({
        aspect,
        focal,
        x: f.x,
        y: f.y,
        camRot: camera.columns,
        camPos: camera.pos,
        time: f.time,
        gain: lens * f.fade,
        ripples: f.ripples,
      })
      this.hole.adapt(f.dt)
    }

    this.bindParticles()
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
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
    gl.uniform1f(u.uLens, lens)
    gl.uniform4fv(u.uRip, f.ripples)

    // Soft glow under a random third of the points (the buffer is shuffled,
    // so the first third is a fair sample), then the points themselves, then
    // the second lensed image while the hole is around
    gl.uniform1f(u.uImage, 0)
    gl.uniform1f(u.uHalo, 1)
    gl.drawArrays(gl.POINTS, 0, Math.floor(this.count / 3))
    gl.uniform1f(u.uHalo, 0)
    gl.drawArrays(gl.POINTS, 0, this.count)
    if (lens > 0.01) {
      gl.uniform1f(u.uImage, 1)
      gl.drawArrays(gl.POINTS, 0, this.count)
    }
  }

  dispose() {
    const { gl } = this
    this.hole?.dispose()
    gl.deleteBuffer(this.buffer)
    gl.deleteProgram(this.program)
  }
}
