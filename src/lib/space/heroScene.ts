import { BlackHolePass, RIPPLE_GLSL } from './blackHole'
import { DISK, diskCamera, focalFor } from './camera'
import { ROCKET, type Formations } from './formations'
import { program, uniforms } from './gl'

// Renders the hero: the ray traced black hole, then the particles on top
// with additive blending. All the particle motion happens in the vertex
// shader, so each frame is just a handful of uniforms.

export type SceneFrame = {
  time: number
  dt: number
  /** 0 = disk, 1 = Orion, 2 = rocket, fractions blend between them */
  morph: number
  /** 0-1, particles flying in on page load */
  intro: number
  yaw: number
  pitch: number
  roll: number
  cam: number
  /** Screen offset in clip space */
  x: number
  y: number
  scale: number
  /** Rocket heading (0 is straight up), lean towards the camera, spin about its axis and click boost */
  rocket: [number, number, number, number]
  rocketPos: [number, number, number]
  /** Where the nozzle has been, see NozzleTrail */
  trail: NozzleTrail
  mouseX: number
  mouseY: number
  mouseForce: number
  fade: number
  /** 0-1, how visible the black hole is */
  hole: number
  /** x, z, start time and strength for each ripple, see RIPPLES */
  ripples: Float32Array
}

const glsl = (v: number) => v.toFixed(4)

/** How long a speck of exhaust lives, in seconds */
const EXHAUST_LIFE = 2.5
const TRAIL_SAMPLES = 40
const TRAIL_STEP = EXHAUST_LIFE / (TRAIL_SAMPLES - 2)

/**
 * Remembers where the nozzle has been and which way it pointed, so exhaust
 * that's already out stays where it was let go instead of swinging round
 * with the rocket. Sample 0 is always the current position, the rest are
 * TRAIL_STEP apart, and `phase` is how far it's got towards the next one.
 */
export class NozzleTrail {
  readonly samples = new Float32Array(TRAIL_SAMPLES * 4)
  phase = 0
  private empty = true

  update(dt: number, x: number, y: number, z: number, heading: number) {
    const now = [x, y, z, heading]
    if (this.empty) {
      for (let i = 0; i < TRAIL_SAMPLES; i++) this.samples.set(now, i * 4)
      this.empty = false
    }
    this.phase += dt / TRAIL_STEP
    while (this.phase >= 1) {
      this.samples.copyWithin(8, 4, this.samples.length - 4)
      this.samples.set(now, 4)
      this.phase -= 1
    }
    this.samples.set(now, 0)
  }
}

const VERTEX = /* glsl */ `
precision highp float;

attribute vec3 aDisk;
attribute vec3 aOrion;
attribute vec4 aRocket;
attribute vec3 aGlow;
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
uniform vec4 uRocket;
uniform vec3 uRocketPos;
uniform vec4 uTrail[${TRAIL_SAMPLES}];
uniform float uTrailPhase;
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
const float RS = ${glsl(DISK.rs)};
const float INNER = ${glsl(DISK.inner)};
const float OUTER = ${glsl(DISK.outer)};
const float TILT = ${glsl(DISK.tilt)};
const float DISK_ROLL = ${glsl(DISK.roll)};
const float SPIN = ${glsl(DISK.spin)};
const float ORBIT = ${glsl(DISK.orbit)};
const float EXIT = ${glsl(ROCKET.exit)};
const float EXHAUST_LIFE = ${glsl(EXHAUST_LIFE)};
const float TRAIL_STEP = ${glsl(TRAIL_STEP)};

${RIPPLE_GLSL}

vec3 rotX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
vec3 view(vec3 p) { return rotZ(rotX(rotY(p, uRot.x), uRot.y), uRot.z); }
vec3 diskToModel(vec3 q) { return rotZ(rotX(q, TILT), DISK_ROLL); }
vec3 rocketToModel(vec3 q, vec2 turn) { return rotZ(rotX(q, turn.y), turn.x); }

// Nozzle position and heading this many seconds ago
vec4 nozzleAt(float ago) {
  float k = ago / TRAIL_STEP;
  k = k < uTrailPhase ? k / max(uTrailPhase, 0.001) : k - uTrailPhase + 1.0;
  k = min(k, ${TRAIL_SAMPLES - 1}.0 - 0.001);
  int i = int(k);
  return mix(uTrail[i], uTrail[i + 1], fract(k));
}

// Each particle leaves at a slightly different moment, so shapes dissolve
// rather than all moving at once
float progress(float step) {
  float x = clamp((uMorph - step) * 1.7 - aSeed.x * 0.7, 0.0, 1.0);
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

  // Disk: Keplerian orbits, lifted by the cursor ripples
  vec3 q = aDisk;
  float radius = max(length(q.xz), 0.001);
  q = rotY(q, -SPIN * ORBIT * pow(max(radius, INNER), -1.5) * t);
  float wave = radius < OUTER * 1.4 ? ripple(q.xz) : 0.0;
  q.y += wave * 0.55;
  vec3 disk = diskToModel(q * RS);

  // Doppler beaming: the side orbiting toward the camera is brighter
  vec3 orbit = view(diskToModel(SPIN * vec3(-q.z, 0.0, q.x) / radius));
  float beta = sqrt(0.5 / max(radius, INNER));
  float doppler = sqrt(1.0 - beta * beta) / (1.0 - beta * orbit.z);
  float diskGlow = aGlow.x * (1.0 + max(wave, 0.0) * 0.9) * pow(doppler, 2.5);

  vec3 orion = rotY(aOrion, sin(t * 0.2) * 0.12);
  orion.y += sin(t * 0.5) * 0.02;

  // Rocket: the hull turns slowly on its axis and the exhaust streams out of
  // the nozzle. Each speck starts from wherever the nozzle was when it came
  // out and keeps going that way, so the rocket leaves a trail as it moves.
  vec3 rocket;
  float life = 1.0;
  float heat = 0.0;
  if (aRocket.w > 0.0) {
    vec3 q = rotY(aRocket.xyz, uRocket.z);
    rocket = rocketToModel(q, uRocket.xy) + uRocketPos;
    // Dim the far side so the hull doesn't look see-through, and light the
    // edges so the outline reads
    if (aRocket.w < 1.5) {
      vec3 normal = view(rocketToModel(normalize(vec3(q.x, 0.0, q.z) + 1e-5), uRocket.xy));
      life = mix(0.2, 1.0, smoothstep(-0.3, 0.3, normal.z)) * (1.0 + pow(1.0 - abs(normal.z), 4.0) * 1.6);
    }
  } else {
    float age = fract(aRocket.y + t / EXHAUST_LIFE);
    vec4 nozzle = nozzleAt(age * EXHAUST_LIFE);
    float d = -aRocket.w * pow(age, 1.5);
    float a = aRocket.x + d * 0.5;
    float r = 0.05 + aRocket.z * (0.15 + d * 0.2) + sin(d * 2.3 - t * 3.0 + aRocket.x * 3.0) * 0.03 * d;
    rocket = nozzle.xyz + rocketToModel(vec3(cos(a) * r, -d, sin(a) * r), vec2(nozzle.w, uRocket.y));
    life = smoothstep(0.0, 0.05, age) * pow(1.0 - age, 0.8) * (1.0 + uRocket.w * 0.8);
    heat = pow(1.0 - age, 6.0);
  }

  float k1 = progress(0.0);
  float k2 = progress(1.0);
  vec3 p = mix(mix(disk, orion, k1), rocket, k2);
  float g = mix(mix(diskGlow, aGlow.y, k1), aGlow.z, k2);

  // A random direction per particle, for the in-between swirl and the intro
  float th = aSeed.w * 18.85 + aSeed.x * 11.0;
  float cz = fract(aSeed.w * 7.31 + aSeed.z * 3.7) * 2.0 - 1.0;
  vec3 dir = vec3(sqrt(1.0 - cz * cz) * cos(th), cz, sqrt(1.0 - cz * cz) * sin(th));

  float flight = sin(k1 * PI) + sin(k2 * PI);
  p += dir * flight * (0.3 + 0.7 * aSeed.w);
  p = rotY(p, flight * (aSeed.z - 0.35) * 1.5);
  g *= 1.0 + flight * 0.5;

  float arrive = clamp(uIntro * 1.6 - aSeed.x * 0.6, 0.0, 1.0);
  arrive = 1.0 - pow(1.0 - arrive, 3.0);
  p = mix(rotY(dir * (8.0 + 6.0 * aSeed.z), 2.4), rotY(p, (1.0 - arrive) * 1.6), arrive);
  g *= mix(0.15, 1.0, arrive);

  p = view(p * uScale);

  float dist = uCam - p.z;
  if (dist < 0.06) {
    hide();
    return;
  }
  vec2 sky = p.xy / dist;

  // Gravitational lensing (thin lens) around the hole at the origin. Points
  // behind it get pushed outward into the arch, and a dimmer second image
  // lands on the opposite side.
  float lensed = 1.0;
  if (uLens > 0.001) {
    float rsWorld = RS * uScale;
    float behind = -p.z;
    if (behind > 0.0) {
      float b = length(sky) + 1e-6;
      float einstein2 = 2.0 * rsWorld * behind / (uCam * dist);
      float root = sqrt(b * b + 4.0 * einstein2);
      float u = b / sqrt(einstein2);
      float magnify = (u * u + 2.0) / (2.0 * u * sqrt(u * u + 4.0));
      float image = uImage > 0.5 ? 0.5 * (b - root) : 0.5 * (b + root);
      magnify = uImage > 0.5 ? magnify - 0.5 : magnify + 0.5;
      sky = mix(sky, sky / b * image, uLens);
      lensed = mix(1.0, clamp(magnify, 0.0, 2.5), uLens);

      float shadow = 2.6 * rsWorld / uCam;
      lensed *= 1.0 - uLens * (1.0 - smoothstep(shadow * 0.95, shadow * 1.05, abs(image)));
    } else if (uImage > 0.5) {
      lensed = 0.0;
    }
    lensed *= 1.0 - uLens * (1.0 - smoothstep(1.0, 1.8, length(p) / rsWorld));
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

  // The cursor nudges nearby points aside
  vec2 toMouse = (ndc - uMouse.xy) * vec2(uAspect, 1.0);
  float mouseDist = length(toMouse) + 0.0001;
  ndc += (toMouse / mouseDist) * vec2(1.0 / uAspect, 1.0) * uMouse.z * 0.04 * exp(-mouseDist * mouseDist * 24.0);

  gl_Position = vec4(ndc, 0.0, 1.0);

  float star = smoothstep(2.95, 3.2, g) * (1.0 - uHalo);
  vStar = star;

  float size = aSeed.y * (0.6 + 0.4 * sqrt(g)) * uPx * uFocal / dist * mix(1.0, 3.4, uHalo);
  size *= 1.0 + star * (7.5 + (g - 3.2) * 5.0) / aSeed.y;
  float alpha = g * uFade * lensed * (1.0 - 0.55 * smoothstep(6.0, 26.0, dist)) * smoothstep(0.06, 1.4, dist);
  alpha *= mix(1.0, 0.32, star) * mix(1.0, life, k2);
  // Fade sub-pixel points instead of letting them flicker
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
  col = mix(col, vec3(1.0, 0.96, 1.0), heat * k2 * 0.8);
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
  float disc = soft * 0.6 + exp(-d * 16.0) * 0.75;

  // Stars get a tight core, a halo and four diffraction spikes
  vec2 ac = abs(c);
  float spikes = exp(-ac.y * 130.0) * (1.0 - ac.x * 2.0) + exp(-ac.x * 130.0) * (1.0 - ac.y * 2.0);
  float flare = exp(-d * 70.0) * 1.6 + exp(-d * 10.0) * 0.3 + spikes * 0.7;

  float a = mix(mix(disc, flare, vStar), soft, vHalo) * vAlpha;
  gl_FragColor = vec4(vColor * a, a * 0.35);
}
`

const ATTRIBUTES = [
  ['aDisk', 3],
  ['aOrion', 3],
  ['aRocket', 4],
  ['aGlow', 3],
  ['aSeed', 4],
] as const

const STRIDE = ATTRIBUTES.reduce((sum, [, size]) => sum + size, 0)

const UNIFORMS = [
  'uTime', 'uMorph', 'uIntro', 'uRot', 'uCam', 'uFocal', 'uAspect', 'uOffset', 'uScale',
  'uPx', 'uMaxSize', 'uMouse', 'uFade', 'uHalo', 'uLens', 'uImage', 'uRip',
  'uRocket', 'uRocketPos', 'uTrail', 'uTrailPhase',
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

  /** Returns null if WebGL isn't available */
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
      console.warn('Hero scene failed to start', err)
      return null
    }
  }

  private constructor(gl: WebGLRenderingContext, data: Formations) {
    this.gl = gl
    this.count = data.count
    this.program = program(gl, VERTEX, FRAGMENT, ATTRIBUTES.map(([name]) => name))
    this.u = uniforms(gl, this.program, UNIFORMS)

    // If the ray tracer won't compile on this GPU, carry on with just particles
    let hole: BlackHolePass | null = null
    try {
      hole = new BlackHolePass(gl)
    } catch (err) {
      console.warn('Black hole shader failed, showing particles only', err)
    }
    this.hole = hole

    const sources = [data.disk, data.orion, data.rocket, data.glow, data.seed]
    const packed = new Float32Array(data.count * STRIDE)
    for (let i = 0; i < data.count; i++) {
      let offset = i * STRIDE
      ATTRIBUTES.forEach(([, size], a) => {
        packed.set(sources[a].subarray(i * size, (i + 1) * size), offset)
        offset += size
      })
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
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, STRIDE * 4, offset * 4)
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
    gl.uniform4fv(u.uRocket, f.rocket)
    gl.uniform3fv(u.uRocketPos, f.rocketPos)
    gl.uniform4fv(u.uTrail, f.trail.samples)
    gl.uniform1f(u.uTrailPhase, f.trail.phase)
    gl.uniform3f(u.uMouse, f.mouseX, f.mouseY, f.mouseForce)
    gl.uniform1f(u.uFade, f.fade)
    gl.uniform1f(u.uLens, lens)
    gl.uniform4fv(u.uRip, f.ripples)

    // A soft glow pass over a third of the points (the buffer is shuffled, so
    // the first third is a random sample), the points themselves, and the
    // second lensed image while the hole is visible.
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
