#version 300 es
// The black hole, in linear HDR.
//
// Each pixel's ray is integrated through Schwarzschild space (units: the event
// horizon is at r = 1). On the way it gathers light from three things that
// together give the disk its depth: glowing gas above and below the inner
// disk, a thin flared veil of dust and wisps floating over it, and the disk
// itself, made of thousands of spiral strands.
//
// Nothing is drawn behind it. The output carries coverage in alpha, and empty
// space is left transparent: the page fades its own background to black as the
// scene arrives, and keeps a thin scatter of stars there (StarField.tsx) that
// the disk and the hole cover.
//
// Palette: the body of the disk is a muted biscuit (#BCA68E), the hot parts a
// creamy candle flame (#FFEDC1).
precision highp float;
precision highp sampler2D;

uniform vec2 uRes;
uniform vec2 uJitter;     // sub-pixel offset for temporal accumulation
uniform float uFrame;     // frame counter, decorrelates the march between frames
uniform float uTime;
uniform vec3 uCamPos;
uniform mat3 uCam;        // columns: right, up, forward
uniform vec2 uTan;        // tan(half fov) * (aspect, 1)
uniform float uPix;       // angle covered by one pixel, radians
uniform int uSteps;       // ray-march budget
uniform int uDetail;      // 3..5: strand octaves; 5 adds the veil
uniform vec2 uHole;       // hole centre on screen: x scaled by aspect, y up, origin centre, height 1
uniform float uTwinkle;   // 0 freezes the glitter (reduced motion)
uniform sampler2D uStreak;
uniform sampler2D uNoise;

out vec4 outColor;

const float TAU = 6.28318530718;
const float R_IN = 1.95;
const float R_OUT = 31.0;
const float FLOW = 0.045;      // typical angular speed of the pattern along a strand, radians per second
const float SPIN = -1.0;       // direction of rotation: matter flows inward along the spirals
const float FLARE = 0.05;      // height of the veil above the disk, as a fraction of the radius
const float STREAK_W = 1024.0;
const float STREAK_ROWS = 256.0;

// Linear-light chromaticities. BISCUIT and CREAM are #BCA68E and #FFEDC1 with
// the brightness divided out; CREAM is pushed a little so it survives the
// tone curve as cream rather than white.
const vec3 BISCUIT = vec3(1.0, 0.75, 0.53);
const vec3 CREAM = vec3(1.0, 0.83, 0.5);

float gCamDist;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// ---------------------------------------------------------------- disk ----

/*
 * One layer of strands. lw is ln(radius) after warping, a the angle in turns.
 * Strands are logarithmic spirals: B of them per e-fold of radius, each winding
 * inward by one e-fold every 1/q turns. B and q are whole numbers, so a strand
 * that leaves through the angle seam re-enters as itself. Each strand is a row
 * of the streak texture laid along it, sliding at its own speed.
 * Returns (brightness, beads, flank): flank is +1 on the side of the strand
 * that faces the hole and -1 on the side facing away, for relief lighting.
 */
vec3 strands(float lw, float a, float B, float q, float seed, float fpa, bool glitter) {
  // Texture repeats per turn. Kept low for sparse layers so that the detail
  // along a strand is always far longer than the strand is wide: hair, not dashes.
  float N = clamp(1.0 + floor(B / 512.0), 1.0, 8.0);
  float ratio = B / N;
  float v = (lw + q * a) * B;
  float j = floor(v);
  float f = v - j;
  float id = mod(j, q * B);
  float h1 = hash11(id + seed * 91.7);
  float h2 = hash11(id * 1.618 + seed * 17.3 + 4.1);
  float h3 = hash11(id * 2.414 + seed * 29.9 + 9.7);

  float spin = SPIN * uTime * FLOW * (0.55 + 0.9 * h3) / TAU;
  float x = N * (a + spin) + h1 * 13.0;
  float row = (mod(id * 7.0 + seed * 3.0, STREAK_ROWS) + 0.5) / STREAK_ROWS;
  float lod = max(log2(fpa / TAU * N * STREAK_W), 0.0);
  vec4 t = textureLod(uStreak, vec2(x, row), lod);

  // Strand cross-section: a soft-edged line somewhere inside its cell
  // The brightest strands are also the thinnest: crisp bright lines among soft ribbons
  float wd = mix(0.16, 0.5, h2 * h2) * mix(1.0, 0.55, pow(h1, 5.0));
  float c = mix(wd, 1.0 - wd, h3);
  float d = clamp((f - c) / wd, -1.0, 1.0);
  float prof = 1.0 - d * d;
  prof *= prof;

  float amp = smoothstep(0.3, 0.66, t.r);
  amp *= 1.0 + 1.3 * (t.g - 0.5) * smoothstep(90.0, 360.0, ratio);
  amp *= 1.0 + 0.9 * (t.a - 0.5) * smoothstep(500.0, 2000.0, ratio);
  // A few strands in every layer burn brighter than the rest
  amp *= 0.5 + 3.0 * pow(h1, 5.0);

  // Glitter rides on the strand at its own repeat count, picked so that a bead
  // is about a pixel long at any distance: points of light, never dashes
  float bead = 0.0;
  if (glitter) {
    float nb = exp2(clamp(floor(log2(TAU / (fpa * STREAK_W * 1.4)) + 0.5), 0.0, 13.0));
    bead = textureLod(uStreak, vec2(nb * (a + spin) + h1 * 13.0, row), 0.0).b;
    bead *= 0.6 + 0.4 * sin(uTime * (1.5 + 4.0 * h2) + h1 * 60.0) * uTwinkle;
  }
  return vec3(amp * prof, bead * prof, -d * (1.0 - d * d) * 2.6 * amp);
}

/* Weights of a cubic B-spline for a position `v` (0..1) between two samples. */
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) / 6.0;
}

/*
 * The blue channel of one mip of the noise atlas, filtered with a bicubic
 * B-spline (four bilinear taps) instead of plain bilinear. `res` is the size
 * of that mip in texels.
 */
float smoothNoise(vec2 uv, float res, float lod) {
  vec2 st = uv * res - 0.5;
  vec2 f = fract(st);
  st -= f;
  vec4 xc = cubic(f.x);
  vec4 yc = cubic(f.y);
  vec4 c = st.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 w = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / w) / res;
  float s0 = textureLod(uNoise, o.xz, lod).b;
  float s1 = textureLod(uNoise, o.yz, lod).b;
  float s2 = textureLod(uNoise, o.xw, lod).b;
  float s3 = textureLod(uNoise, o.yw, lod).b;
  float sx = w.x / (w.x + w.y);
  float sy = w.z / (w.z + w.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

/*
 * ln(radius) after the slow warp that makes the strands bunch and fan like
 * hair. Shared by the disk and the veil so their strands run together.
 */
float warped(float lr, float a, float drift) {
  // Only the broad swells of the noise: a coarse mip, 32 texels across. Its
  // fine detail would show up as wiggles on every strand once the camera is
  // close. And that mip is read through a bicubic filter, because bilinear
  // changes slope at every texel edge and each strand would bend at a corner there.
  float swell = smoothNoise(vec2(2.0 * a + 0.5 * lr + drift, 0.57 * lr + 0.17), 32.0, 5.0);
  return lr + (swell - 0.5) * 0.2
    + 0.07 * cos(TAU * (a - drift) - 2.1 * lr) + 0.035 * cos(2.0 * TAU * (a - drift) - 3.3 * lr + 1.7);
}

/* Light and opacity of the disk where a ray crosses it. */
vec4 disk(vec3 hit, vec3 v, float path, int order) {
  float r = length(hit.xz);
  if (r < R_IN || r > R_OUT) return vec4(0.0);
  float lr = log(r);
  float a = atan(hit.z, hit.x) / TAU;
  vec3 vd = normalize(v);
  vec2 radial = hit.xz / r;

  // Size of this pixel on the disk: stretched along the view direction where the ray grazes
  float across = path * uPix * (order > 0 ? 2.5 : 1.0);
  float vy = max(abs(vd.y), 0.05);
  vec2 along = vd.xz / max(length(vd.xz), 1e-4);
  float cr = dot(radial, along);
  float fpr = across * sqrt(cr * cr / (vy * vy) + (1.0 - cr * cr)) / r;   // radial, in ln(r)
  float fpa = across * sqrt((1.0 - cr * cr) / (vy * vy) + cr * cr) / r;   // around, in radians

  // Slow large-scale structure, and a warp so the strands bunch and fan like hair
  float drift = SPIN * uTime * 0.004;
  vec4 nA = textureLod(uNoise, vec2(2.0 * a + 0.5 * lr + drift, 0.57 * lr + 0.17), 0.0);
  vec4 nB = textureLod(uNoise, vec2(5.0 * a + 1.35 * lr + drift * 2.3, 1.9 * lr + 0.53), 0.0);
  float lw = warped(lr, a, drift);

  // Broad arms
  vec3 s0 = strands(lw, a, 4.0, 1.0, 1.0, fpa, false);
  vec3 s1 = strands(lw, a, 16.0, 2.0, 2.0, fpa, false);

  // Fine strands: octaves of density, cross-faded so there are always strands
  // a little over two pixels apart whatever the distance. Zooming in never runs out.
  float fpw = sqrt(fpr * fpr + fpa * fpa * 0.06);
  float L = clamp(log2(1.0 / (2.2 * max(fpw, 1e-6))), 5.0, 16.0);
  float n = floor(L);
  float fr = L - n;
  float fine = 0.0;
  float beads = 0.0;
  float hero = 0.0;
  int count = uDetail >= 5 ? 5 : 3;
  for (int k = 0; k < count; k++) {
    // k = 0 is the finest octave, fading in as it becomes resolvable
    float o = n + 1.0 - float(k);
    float w = k == 0 ? fr : (k == count - 1 ? 1.0 - fr : 1.0);
    // Alternate the pitch between octaves so strands cross at a shallow angle
    float q = mod(o, 2.0) < 0.5 ? 1.0 : 2.0;
    vec3 s = strands(lw, a, exp2(o), q, 10.0 + o, fpa, k < 2);
    fine += s.x * w;
    beads += s.y * w;
    hero += s.x * s.x * s.x * w * (k < 3 ? 1.0 : 0.5);
  }

  // Wide dark lanes between the arms: most of the sense of structure comes from these
  float lanes = 0.16 + 1.5 * smoothstep(0.32, 0.7, nA.r);
  lanes *= 0.3 + 1.0 * smoothstep(0.24, 0.62, nB.a);
  float coarse = (0.3 + 2.0 * s0.x) * (0.38 + 1.85 * s1.x);
  // Relief: the arms are lit from the middle, so the flank facing the hole is
  // bright and the far flank falls into shadow. They read as ridges, not stripes.
  float relief = clamp(1.0 + 0.6 * s0.z + 0.45 * s1.z, 0.25, 2.2);

  float inner = smoothstep(R_IN, R_IN * 1.12, r);
  float outer = 1.0 - smoothstep(R_OUT * 0.42, R_OUT, r);
  // Steep fall-off: a hot core fading to a dim rim
  float falloff = pow(r / R_IN, -1.3);
  float ring = exp(-pow((r - R_IN * 1.35) / 0.9, 2.0));
  float P = inner * outer * (falloff * 3.6 + ring * 4.2 + 0.05);

  // Glowing gas underneath, strands on top
  float I = P * lanes * coarse * relief * (0.5 + 1.05 * fine + 2.4 * hero);
  // Roll the strands off before the Doppler boost, so the body keeps its colour
  // and only the approaching side burns to cream
  I = 1.7 * I / (1.0 + 0.5 * I);
  I += beads * (2.4 + 13.0 * P * lanes) * outer * inner;

  // Doppler: the side turning toward the camera is brighter and whiter
  vec3 tang = SPIN * vec3(radial.y, 0.0, -radial.x);
  float beta = min(sqrt(0.5 / max(r - 1.0, 0.25)), 0.62);
  float dop = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(tang, -vd));
  I *= pow(dop, 2.6) * sqrt(1.0 - 1.0 / r);
  // Lensed images of the disk are thin; lift them so the ring reads as a crisp line
  if (order > 0) I *= 3.2;
  // Aerial perspective: the far side of the disk sits back, dimmer and cooler
  float away = smoothstep(0.85, 1.7, path / gCamDist);
  I *= mix(1.0, 0.55, away);

  float heat = smoothstep(0.25, 4.0, I);
  vec3 tint = mix(BISCUIT, CREAM, heat);
  tint = mix(tint, tint * vec3(0.86, 0.94, 1.12), away * 0.6);
  // Toward the rim the dark lanes thin out, and the page behind shows between the strands
  float body = mix(0.84, 0.3, smoothstep(R_OUT * 0.3, R_OUT * 0.8, r));
  float alpha = inner * smoothstep(0.0, 0.3, outer) * clamp(body + I * 1.4, 0.0, 0.97);
  return vec4(tint * I * 0.62, alpha);
}

/*
 * A thin, flared layer floating just above the disk: dark dust lanes that
 * shadow what lies beneath, edged with light, and a few bright wisps. Because
 * it sits off the plane it slides against the disk as the camera moves, which
 * is what gives the disk thickness.
 */
vec4 veil(vec3 hit, vec3 v, float path) {
  float r = length(hit.xz);
  float env = smoothstep(R_IN * 1.5, R_IN * 2.8, r) * (1.0 - smoothstep(R_OUT * 0.5, R_OUT * 0.9, r));
  if (env <= 0.0) return vec4(0.0);
  float lr = log(r);
  float a = atan(hit.z, hit.x) / TAU;
  vec3 vd = normalize(v);
  float fpa = path * uPix / max(abs(vd.y), 0.08) / r;

  float lw = warped(lr, a, SPIN * uTime * 0.004);
  // The lanes drift a little faster than the disk beneath them
  float slip = SPIN * uTime * 0.0065;
  vec4 nC = textureLod(uNoise, vec2(3.0 * a + 0.8 * lr + slip + 0.37, 1.25 * lr + 0.71), 0.0);
  vec4 nD = textureLod(uNoise, vec2(7.0 * a + 2.1 * lr + slip * 1.7 + 0.11, 3.1 * lr + 0.29), 0.0);

  // Dust: ridged filaments, combed into strands
  float lane = smoothstep(0.5, 0.78, nC.a * 0.72 + nD.a * 0.28 + (nC.r - 0.5) * 0.35);
  vec3 sd = strands(lw + 0.37, a, 32.0, 2.0, 31.0, fpa, false);
  vec3 sw = strands(lw + 0.11, a, 64.0, 1.0, 37.0, fpa, false);
  float res = smoothstep(0.25, 1.0, 1.0 / (64.0 * fpa));
  float dustA = lane * (0.6 + 0.55 * sd.x * res);

  // The thin edges of the lanes catch the light of the disk below
  float P = pow(r / R_IN, -1.0);
  float rim = lane * (1.0 - lane) * 4.0;
  float wisp = sw.x * sw.x * res * smoothstep(0.38, 0.7, nD.r);
  float emis = (rim * 0.04 + wisp * 0.7) * P * env;
  float alpha = env * clamp(dustA * 0.74 + wisp * 0.25, 0.0, 0.86);
  return vec4(mix(BISCUIT, CREAM, 0.5) * emis, alpha);
}

// --------------------------------------------------------------- trace ----

vec4 trace(vec3 ro, vec3 rd, float jitter) {
  vec3 x = ro;
  vec3 v = rd;
  vec3 hv = cross(x, v);
  float h2 = dot(hv, hv);
  vec3 col = vec3(0.0);
  vec3 gasLight = vec3(0.0);
  float trans = 1.0;
  float path = 0.0;
  int order = 0;
  bool captured = false;
  bool veiled = uDetail >= 5;
  float rFar = max(length(ro) * 1.02, R_OUT + 4.0);

  for (int i = 0; i < 400; i++) {
    float r2 = dot(x, x);
    if (i >= uSteps) {
      // Out of budget: only rays still circling the hole are left, and those are dark
      captured = r2 < 16.0;
      break;
    }
    float r = sqrt(r2);
    if (r < 1.02) {
      captured = true;
      break;
    }
    if (r > rFar && dot(x, v) > 0.0) break;

    // Small steps near the photon sphere so the ring stays crisp, long ones far
    // out. The first step is jittered so the sampling of the gas never bands.
    float dt = r * mix(0.03, 0.15, smoothstep(1.4, 9.0, r));
    if (i == 0) dt *= 0.3 + 0.7 * jitter;
    v -= 1.5 * h2 * x / (r2 * r2 * r) * dt;
    vec3 xn = x + v * dt;

    // Hot gas above and below the inner disk. It gives the hole a luminous
    // body, and the part behind the hole is lensed into a band over its top.
    float rc = length(xn.xz);
    if (rc < 15.0) {
      float thick = 0.13 * rc + 0.08;
      float gas = exp(-abs(xn.y) / thick) * smoothstep(R_IN * 0.95, R_IN * 1.5, rc) * pow(rc / R_IN, -2.3) * (1.0 - smoothstep(8.0, 15.0, rc));
      gasLight += trans * mix(BISCUIT, CREAM, 0.7) * gas * dt * 1.25;
    }

    // The veil, a little above the plane
    if (veiled) {
      float f0 = x.y - FLARE * length(x.xz);
      float f1 = xn.y - FLARE * rc;
      if (f0 * f1 < 0.0) {
        float t = f0 / (f0 - f1);
        vec4 d = veil(mix(x, xn, t), v, path + dt * t);
        col += trans * d.rgb;
        trans *= 1.0 - d.a;
      }
    }

    if (x.y * xn.y < 0.0) {
      float t = x.y / (x.y - xn.y);
      vec4 d = disk(mix(x, xn, t), v, path + dt * t, order);
      col += trans * d.rgb;
      trans *= 1.0 - d.a;
      order++;
      if (trans < 0.012) return vec4(col + gasLight * mix(0.22, 1.0, smoothstep(7.0, 34.0, gCamDist)), 1.0);
    }
    path += dt;
    x = xn;
  }
  // Rays that end in the hole keep almost none of the gas they passed through,
  // so the shadow stays black instead of filling with haze
  // ...and from inside the gas it thins out, so the strands keep their contrast up close
  float thin = mix(0.22, 1.0, smoothstep(7.0, 34.0, gCamDist));
  // Coverage: the hole and the disk hide what is behind them; empty space does not
  return vec4(col + gasLight * thin * (captured ? 0.04 : 1.0), captured ? 1.0 : 1.0 - trans);
}

void main() {
  vec2 uv = (gl_FragCoord.xy + uJitter) / uRes;
  vec3 rd = normalize(uCam * vec3((uv * 2.0 - 1.0) * uTan, 1.0));
  gCamDist = length(uCamPos);
  vec4 col = trace(uCamPos, rd, hash12(gl_FragCoord.xy + uFrame * 7.31));
  outColor = vec4(clamp(col.rgb, 0.0, 96.0), clamp(col.a, 0.0, 1.0));
}
