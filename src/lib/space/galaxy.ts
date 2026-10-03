import { program } from './gl'

// The galaxy on the phone hero. A fragment shader paints it once, face on,
// and the result is copied into a plain 2D canvas. CSS then tilts it and
// turns it slowly, so the shader only ever runs for a single frame and the
// WebGL context is thrown away straight after.

const VERTEX = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;

const float ARMS = 2.0;
const float WIND = 4.0;

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
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return v;
}

void main() {
  float r = length(vUv);
  if (r > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float lr = log(r + 0.03);

  // c is the angle with the spiral unwound, so an arm sits at a fixed c.
  // Sampling noise around (cos c, sin c) stretches every feature along the
  // arms, which is what turns plain noise into dust lanes.
  float c = atan(vUv.y, vUv.x) + WIND * lr;
  vec3 q = vec3(cos(c), sin(c), lr);

  float warp = fbm(q * vec3(1.5, 1.5, 1.2));
  float arm = pow(0.5 + 0.5 * cos(ARMS * (c + warp * 2.2)), 2.5);
  float fine = fbm(q * vec3(12.0, 12.0, 4.0) + warp);
  float wisps = fbm(q * vec3(2.4, 2.4, 1.6) + 5.0);

  // Dust follows the arms near the middle and breaks into clumps further out
  float streaks = fbm(q * vec3(4.5, 4.5, 2.5) + warp * 1.5);
  float clumps = fbm(vec3(vUv * 7.0, 2.0) + warp * 1.2);
  float dust = mix(streaks, clumps, smoothstep(0.25, 0.75, r));

  float edge = smoothstep(1.0, 0.5, r + (wisps - 0.5) * 0.4);
  float disk = exp(-r / 0.24) * edge;
  float lanes = smoothstep(0.46, 0.56, dust) * smoothstep(0.05, 0.16, r);
  float rims = smoothstep(0.38, 0.46, dust) * (1.0 - lanes);
  float halo = smoothstep(0.36, 0.62, wisps) * smoothstep(0.12, 0.45, r) * smoothstep(1.0, 0.55, r);

  // Light, before tone mapping. Pale near the middle, violet through the
  // arms and a dusky indigo out at the edge.
  vec3 lavender = vec3(0.88, 0.8, 1.0);
  vec3 pink = vec3(0.98, 0.58, 1.0);
  vec3 violet = vec3(0.6, 0.42, 1.0);
  vec3 indigo = vec3(0.36, 0.3, 0.7);
  vec3 tint = mix(mix(lavender, violet, smoothstep(0.08, 0.3, r)), indigo, smoothstep(0.35, 0.8, r));
  tint = mix(tint, pink, smoothstep(0.6, 0.85, fine) * 0.6);

  vec3 col = tint * disk * (0.3 + 1.7 * arm) * (0.55 + 0.9 * fine);
  // a bright ring just outside the core
  col += lavender * exp(-pow((r - 0.13) / 0.035, 2.0)) * (0.5 + fine) * 0.9;
  col += lavender * exp(-r * r / 0.006) * 2.2;
  col += vec3(1.0) * exp(-r * r / 0.0007) * 6.0;
  col *= 1.0 - 0.94 * lanes;
  // the edges of the lanes catch the light
  col += pink * 0.6 * disk * rims;
  col += vec3(0.32, 0.27, 0.48) * halo * (0.25 + 0.35 * fine);

  // A few stars scattered through the arms
  vec2 cell = vUv * 160.0;
  vec2 id = floor(cell);
  float h = hash(vec3(id, 3.0));
  float star = step(0.985, h) * exp(-dot(fract(cell) - 0.5, fract(cell) - 0.5) * 30.0);
  col += lavender * star * (0.4 + 2.0 * arm) * edge;

  col = 1.0 - exp(-col * 1.4);

  // The dust is solid enough to hide the stars behind it
  float cover = clamp(disk * 1.6 + halo * 0.7, 0.0, 0.94) * edge;
  float alpha = max(cover, max(col.r, max(col.g, col.b)));
  gl_FragColor = vec4(col, alpha);
}
`

/** Paints the galaxy into `out` at its current size. Returns false without WebGL. */
export function paintGalaxy(out: HTMLCanvasElement) {
  const size = out.width
  const scratch = document.createElement('canvas')
  scratch.width = scratch.height = size
  const gl = scratch.getContext('webgl', { antialias: false, depth: false })
  const ctx = out.getContext('2d')
  if (!gl || !ctx) return false

  try {
    gl.useProgram(program(gl, VERTEX, FRAGMENT, ['aPos']))
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.viewport(0, 0, size, size)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    // has to happen in the same task, before the browser clears the buffer
    ctx.drawImage(scratch, 0, 0)
    return true
  } catch {
    return false
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
