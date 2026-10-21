import { program, uniforms } from './gl'

// The planets in the Work section. Every planet is drawn analytically in one
// fragment shader: each pixel works out where it lands on each sphere, looks
// up a noise surface there and lights it. There is no mesh and no texture,
// so a planet stays sharp however close the camera gets.
//
// Layout and animation all happen in JS. The shader only gets told, per
// planet, where its centre is, how big it is and how it looks.

export const MAX_PLANETS = 6

export type PlanetLook = {
  /** gas giants get bands and a storm, oceans get land, ice caps and clouds */
  kind: 'gas' | 'ocean'
  /** dark, middle and light surface colours, as hex */
  colors: [string, string, string]
  /** the glow around the edge */
  air: string
  /** rings, as inner and outer radius in planet radii */
  ring?: [number, number]
  /** lean of the spin axis, in radians */
  tilt?: number
  /** any number, shuffles the noise so two planets of a kind differ */
  seed?: number
}

/** Where a planet is on screen this frame, in CSS pixels */
export type PlanetPlace = {
  x: number
  y: number
  r: number
  opacity: number
  spin: number
}

const VERTEX = /* glsl */ `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define MAX ${MAX_PLANETS}

uniform int uCount;
uniform float uTime;
uniform vec4 uGeo[MAX];   // centre x, y in device pixels, radius, opacity
uniform vec4 uLook[MAX];  // kind, seed, spin, tilt
uniform vec2 uRing[MAX];  // inner and outer radius, 0 for none
uniform vec3 uDeep[MAX];
uniform vec3 uMid[MAX];
uniform vec3 uLight[MAX];
uniform vec3 uAir[MAX];

// The sun is up and to the left, a little in front
const vec3 SUN = vec3(-0.56, 0.46, 0.69);

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

float fbm(vec3 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p = p * 2.02 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return v;
}

vec3 spinY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 spinZ(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

// Ring density at a distance from the centre: fine bands with a couple of gaps
float ringAt(float d, vec2 ring, float seed) {
  if (ring.y <= 0.0) return 0.0;
  float t = (d - ring.x) / (ring.y - ring.x);
  if (t < 0.0 || t > 1.0) return 0.0;
  float bands = 0.55 + 0.45 * sin(t * 70.0 + noise(vec3(t * 18.0, seed, 0.0)) * 6.0);
  float grain = noise(vec3(t * 140.0, seed + 3.0, 0.0));
  float gaps = smoothstep(0.02, 0.05, abs(t - 0.62)) * smoothstep(0.01, 0.025, abs(t - 0.3));
  float edges = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.85, t);
  return bands * (0.6 + 0.4 * grain) * gaps * edges;
}

// Gas bands. Everything is worked out from a bent latitude: big slow
// meanders, then a smaller warp that curls the edges of the bands where
// they slide past each other. Sampling noise in latitude-stretched space
// keeps the detail running along the bands, like it does on a real giant.
// The accent is the air colour, used as a second hue between the others.
vec3 gas(vec3 s, float seed, vec3 deep, vec3 mid, vec3 light, vec3 accent) {
  vec3 p = s + seed;
  float meander = fbm(p * vec3(1.1, 2.6, 1.1));
  vec3 q = vec3(fbm(p * vec3(2.2, 6.0, 2.2)), fbm(p * vec3(2.2, 6.0, 2.2) + 5.2), 0.0);
  float lat = s.y + (meander - 0.5) * 0.32 + (q.x - 0.5) * 0.1;

  // a few belts churn much harder than the rest
  float belt = smoothstep(0.5, 0.72, noise(vec3(lat * 7.0, seed, 1.0)));

  // curls along the band edges
  vec3 along = vec3(s.x * 3.2, lat * 16.0, s.z * 3.2);
  float curls = fbm(along + vec3(q.xy, q.y) * (3.0 + belt * 3.0));
  lat += (curls - 0.5) * (0.04 + belt * 0.09);

  float b = lat * 17.0;
  float v = 0.5 + 0.5 * (0.55 * sin(b + seed) + 0.3 * sin(b * 2.3 + 1.1) + 0.15 * sin(b * 5.3 + 2.0));

  // dark purple, violet, magenta, pale pink
  vec3 col = mix(deep, accent, smoothstep(0.0, 0.34, v));
  col = mix(col, mid, smoothstep(0.3, 0.62, v));
  col = mix(col, light, smoothstep(0.66, 1.0, v) * 0.85);

  // fine streaks running along the bands
  float streak = fbm(vec3(s.x * 5.0, lat * 70.0, s.z * 5.0) + q * 2.0);
  col *= 0.82 + 0.36 * streak;

  // thin pale wisps that trace the churning edges
  float ridge = 1.0 - abs(noise(vec3(s.x * 4.0, lat * 46.0, s.z * 4.0) + q * 4.0) * 2.0 - 1.0);
  float wisps = pow(ridge, 9.0) * smoothstep(0.42, 0.68, curls) * 0.6;
  // and broader white swirls in the churning belts
  float swirl = 1.0 - abs(fbm(along * vec3(1.4, 1.0, 1.4) + q * 6.0) * 2.0 - 1.0);
  wisps += pow(swirl, 5.0) * belt;
  // added rather than mixed, so they glow over the dark bands instead of
  // going grey
  wisps = clamp(wisps, 0.0, 1.0);
  col = mix(col, light, wisps * 0.45) + light * wisps * 0.4;

  // violet towards the top, warmer and redder towards the bottom
  col = mix(col, accent, smoothstep(0.3, 0.95, s.y) * 0.35);
  col = mix(col, mid * vec3(1.1, 0.45, 0.6), smoothstep(-0.2, -0.95, s.y) * 0.35);
  return col;
}

// The rings glow like the black hole's disk: clumps of gas and thin
// filaments, hottest at the inner edge, brighter on the side coming towards
// us. They turn slowly but stay rigid, nothing ripples.
vec4 ringGlow(vec3 q, vec3 axis, vec2 ring, float seed) {
  float r = length(q);
  float t = (r - ring.x) / (ring.y - ring.x);
  if (t < -0.05 || t > 1.0) return vec4(0.0);

  vec3 e1 = normalize(vec3(axis.y, -axis.x, 0.0));
  vec3 e2 = cross(axis, e1);
  float a = atan(dot(q, e2), dot(q, e1)) + uTime * 0.035;
  vec2 cs = vec2(cos(a), sin(a));

  float broad = noise(vec3(r * 2.2, cs * 1.4) + seed);
  float f1 = 1.0 - abs(noise(vec3(r * 9.0, cs * 2.4) + seed + 3.1) * 2.0 - 1.0);
  float f2 = 1.0 - abs(noise(vec3(r * 26.0, cs * 3.6) + seed + 7.7) * 2.0 - 1.0);
  float gas = broad * 0.5 + f1 * f1 * f1 * 0.4 + f2 * f2 * f2 * f2 * 0.45;
  float lanes = 0.5 + 0.5 * sin(r * 22.0 + gas * 6.0);

  float edge = smoothstep(-0.05, 0.06, t) * (1.0 - smoothstep(0.45, 1.0, t));
  float dens = edge * pow(ring.x / r, 1.6) * mix(0.15, 1.6, gas * gas * 1.5) * mix(0.7, 1.15, lanes);

  // stands in for Doppler beaming, the left side swings towards the camera
  float side = dot(normalize(q), e1);
  float beam = mix(0.45, 1.7, 0.5 + 0.5 * side);

  vec3 violet = vec3(0.6, 0.18, 1.0);
  vec3 magenta = vec3(1.0, 0.28, 0.78);
  vec3 tint = mix(magenta, violet, smoothstep(0.1, 0.7, t));
  tint = mix(tint, vec3(1.0, 0.82, 1.0), smoothstep(0.18, 0.0, t) * 0.7);
  return vec4(tint * dens * beam * 2.4, clamp(dens * 1.1, 0.0, 0.9));
}

// Seas, land, ice at the poles and a cloud layer that drifts on its own
vec3 ocean(vec3 s, float seed, vec3 deep, vec3 mid, vec3 light, out float wet, out float cloud) {
  float h = fbm(s * 1.8 + seed) * 0.7 + fbm(s * 5.5 + seed + 4.0) * 0.3;
  float land = smoothstep(0.5, 0.52, h);
  vec3 sea = mix(deep, mix(deep, mid, 0.35), smoothstep(0.38, 0.5, h));
  vec3 ground = mix(mid, light, smoothstep(0.56, 0.72, h));
  vec3 col = mix(sea, ground, land);

  float ice = smoothstep(0.78, 0.86, abs(s.y) + (noise(s * 6.0 + seed) - 0.5) * 0.18);
  col = mix(col, vec3(0.92, 0.95, 1.0), ice);
  wet = (1.0 - land) * (1.0 - ice);

  vec3 c = spinY(s, uTime * 0.012);
  float swirl = fbm(c * 2.5 + seed + 7.0);
  cloud = smoothstep(0.5, 0.72, fbm(c * vec3(3.0, 6.0, 3.0) + swirl * 1.8 + seed));
  return col;
}

void main() {
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    vec4 geo = uGeo[i];
    vec4 look = uLook[i];
    vec2 ring = uRing[i];
    if (geo.w <= 0.0 || geo.z <= 0.5) continue;

    vec2 p = (gl_FragCoord.xy - geo.xy) / geo.z;
    float d = length(p);
    float reach = max(1.6, ring.y + 0.1);
    if (d > reach) continue;

    float aa = 1.5 / geo.z;
    float seed = look.y;
    float tilt = look.w;
    vec3 sun = normalize(SUN);

    // The rings lie in the equator, so they lean with the spin axis. The
    // view is from slightly above, which is the extra lean towards us.
    vec3 axis = spinZ(normalize(vec3(0.0, 1.0, 0.32)), tilt);

    // Planet: lit surface inside the disc, a glow of air around it
    vec3 body = vec3(0.0);
    float cover = 0.0;
    float z = 0.0;
    if (d < 1.0 + aa) {
      z = sqrt(max(0.0, 1.0 - d * d));
      vec3 n = vec3(p, z);
      // into the planet's own frame, where y is the spin axis
      vec3 s = spinY(spinZ(n, -tilt), look.z);

      float wet = 0.0;
      float cloud = 0.0;
      vec3 surf = look.x < 0.5
        ? gas(s, seed, uDeep[i], uMid[i], uLight[i], uAir[i])
        : ocean(s, seed, uDeep[i], uMid[i], uLight[i], wet, cloud);

      float ndl = dot(n, sun);
      float day = smoothstep(-0.18, 0.5, ndl);
      vec3 lit = surf * (0.03 + 1.15 * day * (0.35 + 0.65 * max(ndl, 0.0)));

      // sunlight off the water
      vec3 hv = normalize(sun + vec3(0.0, 0.0, 1.0));
      lit += vec3(1.0, 0.96, 0.9) * pow(max(dot(n, hv), 0.0), 60.0) * wet * 0.7 * day;

      lit = mix(lit, vec3(1.0) * (0.04 + 1.05 * day), cloud * 0.92);

      // shadow of the rings on the planet
      float facing = dot(sun, axis);
      if (abs(facing) > 0.001) {
        float t = -dot(n, axis) / facing;
        if (t > 0.0) lit *= 1.0 - 0.4 * ringAt(length(n + sun * t), ring, seed);
      }

      // air thickens towards the edge, and the lit limb glows
      float rim = pow(1.0 - z, 2.2);
      lit += uAir[i] * rim * (0.12 + 1.1 * smoothstep(-0.35, 0.7, ndl));
      // a faint violet bounce on the night side so it never goes flat black
      lit += vec3(0.16, 0.1, 0.32) * pow(1.0 - z, 1.4) * (1.0 - day) * 0.5;

      body = lit;
      cover = smoothstep(1.0, 1.0 - aa, d);
    }

    float glowSide = smoothstep(-0.5, 0.9, dot(normalize(vec3(p, 0.001)), sun));
    float glow = exp(-max(d - 1.0, 0.0) * 9.0) * (0.15 + 0.85 * glowSide) * (1.0 - cover);
    if (d < 1.0) glow = 0.0;

    // Rings: where this pixel's view line crosses the ring plane
    vec3 ringCol = vec3(0.0);
    float ringA = 0.0;
    bool ringFront = true;
    if (ring.y > 0.0) {
      float rz = -(p.x * axis.x + p.y * axis.y) / axis.z;
      vec3 q = vec3(p, rz);
      vec4 glowing = ringGlow(q, axis, ring, seed);
      if (glowing.a > 0.0) {
        // dimmer where the planet blocks the sun, but it glows on its own
        float along = dot(q, sun);
        float shade = along < 0.0 ? smoothstep(0.9, 1.08, length(q - sun * along)) : 1.0;
        ringCol = glowing.rgb * (0.35 + 0.65 * shade);
        ringA = glowing.a;
        ringFront = rz > z || d > 1.0;
      }
    }

    // Composite back to front: rings behind, the planet, rings in front
    vec3 c = vec3(0.0);
    float a = 0.0;
    if (!ringFront) {
      c = ringCol;
      a = ringA;
    }
    c = body * cover + c * (1.0 - cover);
    a = cover + a * (1.0 - cover);
    c += uAir[i] * glow * 0.55;
    a = max(a, glow * 0.45);
    if (ringFront) {
      c = ringCol + c * (1.0 - ringA);
      a = ringA + a * (1.0 - ringA);
    }

    c *= geo.w;
    a *= geo.w;
    col = c + col * (1.0 - a);
    alpha = a + alpha * (1.0 - a);
  }

  // a soft tone curve so the bright side doesn't clip
  col = col / (1.0 + col * 0.35);
  gl_FragColor = vec4(col, alpha);
}
`

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  // the shader works in linear light, roughly
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => c ** 2.2) as [
    number,
    number,
    number,
  ]
}

export type PlanetScene = {
  resize(width: number, height: number, dpr: number): void
  /** `places` and `looks` are matched by index and drawn in that order, last on top */
  draw(places: PlanetPlace[], looks: PlanetLook[], time: number): void
  dispose(): void
}

/** Returns null without WebGL, so the caller can fall back to something flat */
export function createPlanetScene(canvas: HTMLCanvasElement): PlanetScene | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true })
  if (!gl) return null

  let prog: WebGLProgram
  try {
    prog = program(gl, VERTEX, FRAGMENT, ['aPos'])
  } catch {
    return null
  }
  const u = uniforms(gl, prog, [
    'uCount',
    'uTime',
    'uGeo',
    'uLook',
    'uRing',
    'uDeep',
    'uMid',
    'uLight',
    'uAir',
  ] as const)

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  const geo = new Float32Array(MAX_PLANETS * 4)
  const look = new Float32Array(MAX_PLANETS * 4)
  const ring = new Float32Array(MAX_PLANETS * 2)
  const deep = new Float32Array(MAX_PLANETS * 3)
  const mid = new Float32Array(MAX_PLANETS * 3)
  const light = new Float32Array(MAX_PLANETS * 3)
  const air = new Float32Array(MAX_PLANETS * 3)
  // hex parsing is cached per look so it doesn't run every frame
  const parsed = new WeakMap<PlanetLook, [number, number, number][]>()

  let height = 0
  let scale = 1

  return {
    resize(w, h, dpr) {
      height = h
      scale = dpr
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    },

    draw(places, looks, time) {
      const count = Math.min(places.length, MAX_PLANETS)
      for (let i = 0; i < count; i++) {
        const place = places[i]
        const l = looks[i]
        let colors = parsed.get(l)
        if (!colors) {
          colors = [...l.colors.map(rgb), rgb(l.air)]
          parsed.set(l, colors)
        }
        // GL counts y from the bottom
        geo.set([place.x * scale, (height - place.y) * scale, place.r * scale, place.opacity], i * 4)
        look.set([l.kind === 'gas' ? 0 : 1, l.seed ?? i * 7.3, place.spin, l.tilt ?? 0], i * 4)
        ring.set(l.ring ?? [0, 0], i * 2)
        deep.set(colors[0], i * 3)
        mid.set(colors[1], i * 3)
        light.set(colors[2], i * 3)
        air.set(colors[3], i * 3)
      }

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(prog)
      gl.uniform1i(u.uCount, count)
      gl.uniform1f(u.uTime, time)
      gl.uniform4fv(u.uGeo, geo)
      gl.uniform4fv(u.uLook, look)
      gl.uniform2fv(u.uRing, ring)
      gl.uniform3fv(u.uDeep, deep)
      gl.uniform3fv(u.uMid, mid)
      gl.uniform3fv(u.uLight, light)
      gl.uniform3fv(u.uAir, air)
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },

    // Not losing the context on purpose: the canvas can be handed straight
    // back to a new scene, and a lost context would stay lost.
    dispose() {
      gl.deleteBuffer(quad)
      gl.deleteProgram(prog)
    },
  }
}
