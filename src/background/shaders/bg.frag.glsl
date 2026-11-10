#version 300 es
precision highp float;

// kodachi.dev animated background.
//
// World space: the hero still spans x in [-0.5, 0.5] and y in [-0.5/aspect, 0.5/aspect]
// (one cell; cell width = 1). The texture is a seamlessly tileable 2x3 quilt of six
// different frames of the source video with the hero frame in the top-left cell
// (see dev/background.build-field.py), sampled with GL_REPEAT. So the world is an
// endless field with no mirror axes, no creases and no special-case rectangle around
// the hero: every point is treated the same way. A very gentle static warp and an
// animated domain warp make the liquid flow; lighting, fibres, stars and bokeh are
// layered on top.

uniform sampler2D uTex;
uniform sampler2D uBloom;   // baked glow of the field's bright specks (same layout, 1/4 size)
uniform float uBloomOn;    // 1 once the bloom map has loaded
uniform vec2  uRes;        // canvas size in device pixels
uniform vec2  uTexSize;    // texture size in texels
uniform vec2  uCells;      // quilt layout (columns, rows)
uniform float uTime;       // seconds, for twinkle and light drift
uniform float uFlow;       // flow time; advances faster while scrolling
uniform vec2  uCam;        // camera position in world units
uniform float uCamRot;     // camera roll in radians
uniform float uZoom;       // camera zoom (1 = cover)
uniform vec2  uParallax;   // mouse parallax, in fractions of the viewport height
uniform float uTexAspect;  // cell width / height
uniform float uWaveAmp;    // flow warp amplitude (world units)
uniform float uWarpScale;  // flow warp frequency
uniform float uLightAngle; // base light direction (radians)
uniform float uLightStr;   // highlight strength
uniform float uStars;      // star density multiplier
uniform float uDarkness;   // 0..1
uniform float uContrast;   // ~1
uniform float uHue;        // tiny hue rotation (radians)
uniform float uRipple;     // 0..1 scroll-velocity ripple

out vec4 fragColor;

const vec3 NAVY = vec3(0.020, 0.024, 0.102);        // #05061a
const vec3 PERIWINKLE = vec3(0.557, 0.588, 1.0);    // #8e96ff
const vec3 STAR_WHITE = vec3(0.90, 0.92, 1.0);
const vec3 DEEP_BLUE = vec3(0.30, 0.38, 1.0);

// ---- hashing & noise -------------------------------------------------------

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // quintic: smooth second derivative, no grid feel
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

const mat2 FBM_M = mat2(1.6, 1.2, -1.2, 1.6);

// 5 octaves, centred roughly on 0.
float fbm5(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = FBM_M * p;
    a *= 0.5;
  }
  return v - 0.484;
}

// 3 octaves for the static field warp and blend meanders.
float fbm3(vec2 p) {
  float v = 0.5 * vnoise(p);
  v += 0.25 * vnoise(FBM_M * p);
  v += 0.125 * vnoise(FBM_M * FBM_M * p);
  return v - 0.4375;
}

// ---- helpers ---------------------------------------------------------------

vec2 rot(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// World -> texture coordinates. The hero cell is the top-left cell of the quilt and
// the image was flipped on upload, so v = 1 is the top of the quilt.
vec2 worldToTex(vec2 p) {
  float u = (p.x + 0.5) / uCells.x;
  float vDown = (0.5 - p.y * uTexAspect) / uCells.y;
  return vec2(u, 1.0 - vDown);
}

float height(vec3 c) {
  // The image is blue-dominant; weight blue so the ridges read as height.
  return dot(c, vec3(0.22, 0.18, 0.60));
}

vec3 hueRotate(vec3 c, float a) {
  // Rotation about the luminance axis (YIQ).
  const vec3 k = vec3(0.57735);
  float s = sin(a), co = cos(a);
  return c * co + cross(k, c) * s + k * dot(k, c) * (1.0 - co);
}

// Catmull-Rom bicubic with 9 bilinear taps (Jimenez / Pettineo). Sharper than bilinear
// when the scenes zoom in, with no smear; the negative lobes give a light unsharp mask.
vec3 sampleBicubic(vec2 uv) {
  vec2 samplePos = uv * uTexSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / w12;
  vec2 texPos0 = (texPos1 - 1.0) / uTexSize;
  vec2 texPos3 = (texPos1 + 2.0) / uTexSize;
  vec2 texPos12 = (texPos1 + offset12) / uTexSize;
  vec3 result = vec3(0.0);
  result += texture(uTex, vec2(texPos0.x, texPos0.y)).rgb * w0.x * w0.y;
  result += texture(uTex, vec2(texPos12.x, texPos0.y)).rgb * w12.x * w0.y;
  result += texture(uTex, vec2(texPos3.x, texPos0.y)).rgb * w3.x * w0.y;
  result += texture(uTex, vec2(texPos0.x, texPos12.y)).rgb * w0.x * w12.y;
  result += texture(uTex, vec2(texPos12.x, texPos12.y)).rgb * w12.x * w12.y;
  result += texture(uTex, vec2(texPos3.x, texPos12.y)).rgb * w3.x * w12.y;
  result += texture(uTex, vec2(texPos0.x, texPos3.y)).rgb * w0.x * w3.y;
  result += texture(uTex, vec2(texPos12.x, texPos3.y)).rgb * w12.x * w3.y;
  result += texture(uTex, vec2(texPos3.x, texPos3.y)).rgb * w3.x * w3.y;
  return max(result, 0.0);
}

float heightAt(vec2 p, float lod) {
  return height(textureLod(uTex, worldToTex(p), lod).rgb);
}

// Gradient of the blurred height field from four taps around p (world units).
vec2 gradAt(vec2 p, float eps, float lod) {
  float hx1 = heightAt(p + vec2(eps, 0.0), lod);
  float hx0 = heightAt(p - vec2(eps, 0.0), lod);
  float hy1 = heightAt(p + vec2(0.0, eps), lod);
  float hy0 = heightAt(p - vec2(0.0, eps), lod);
  return vec2(hx1 - hx0, hy1 - hy0) / (2.0 * eps);
}

// One layer of stars. `p` is in units of viewport height, already parallaxed.
// Grid-cell hashing: each cell holds at most one star, placed well inside the
// cell so the soft glow never crosses into a neighbour. `bloom` adds a wide,
// slightly chromatic halo for the brightest sparkles.
vec3 starLayer(vec2 p, float cells, float radiusPx, float density, float seed, float bloom) {
  vec2 g = p * cells + seed;
  vec2 cell = floor(g);
  vec2 h = hash22(cell + seed * 7.13);
  vec2 h2 = hash22(cell * 1.7 + 19.0 + seed);
  float present = step(h2.x, density);
  if (present < 0.5) return vec3(0.0);
  vec2 starPos = cell + 0.2 + h * 0.6;
  float dPx = length(g - starPos) / cells * uRes.y;
  float twinkle = 0.66 + 0.34 * sin(uTime * (0.35 + h2.y * 0.8) + h.x * 6.2832);
  // Sizes are authored for a 1080px-tall canvas and scale with it, so stars keep their
  // apparent size on retina and large displays instead of shrinking to single pixels.
  float r = radiusPx * (0.7 + 0.6 * h.y) * max(uRes.y / 1080.0, 0.8);
  float core = smoothstep(r, r * 0.1, dPx);
  // Bloom: a tight glow hugging the core and a wide faint halo. Every star gets some;
  // `bloom` adds more for the big near layers.
  float glow = exp(-dPx / (r * 2.2)) * 0.40;
  float halo = exp(-dPx / (r * 6.0)) * (0.05 + 0.09 * bloom);
  float amp = twinkle * (0.55 + 0.45 * h2.y);
  // Warm-white core, periwinkle glow, deeper blue halo: a hint of chromatic bloom.
  vec3 coreCol = mix(PERIWINKLE, STAR_WHITE, 0.35 + 0.5 * h.x);
  return (core * coreCol + glow * PERIWINKLE + halo * DEEP_BLUE) * amp;
}

// Soft out-of-focus dots, as in the reference footage: big, faint, slow.
vec3 bokehLayer(vec2 p, float cells, float radiusPx, float density, float seed) {
  vec2 g = p * cells + seed;
  vec2 cell = floor(g);
  vec2 h = hash22(cell + seed * 3.71);
  vec2 h2 = hash22(cell * 2.3 + 7.0 + seed);
  if (h2.x > density) return vec3(0.0);
  vec2 pos = cell + 0.25 + h * 0.5;
  float dPx = length(g - pos) / cells * uRes.y;
  float r = radiusPx * (0.7 + 0.6 * h.y) * max(uRes.y / 1080.0, 0.8);
  // Flat disc with a soft rim and a faint brighter ring, like a defocused highlight.
  float disc = smoothstep(r, r * 0.55, dPx);
  float ring = smoothstep(r * 0.55, r * 0.9, dPx) * smoothstep(r, r * 0.9, dPx);
  float breathe = 0.75 + 0.25 * sin(uTime * (0.15 + h2.y * 0.2) + h.x * 6.2832);
  float halo = exp(-dPx / (r * 1.1)) * 0.035; // soft bleed past the rim
  return (disc * 0.10 + ring * 0.06 + halo) * breathe * mix(DEEP_BLUE, PERIWINKLE, h2.y);
}

// ---- main ------------------------------------------------------------------

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 c = uv - 0.5;
  float viewAspect = uRes.x / uRes.y;

  // "object-fit: cover" of one cell in world units.
  float W, H;
  if (viewAspect >= uTexAspect) { W = 1.0; H = 1.0 / viewAspect; }
  else { H = 1.0 / uTexAspect; W = H * viewAspect; }

  // Camera: view-space -> world.
  vec2 view = c * vec2(W, H) / uZoom;
  view = rot(view, uCamRot);
  vec2 parallax = uParallax * (H / uZoom);
  vec2 p = view + uCam + parallax;

  // Gentle static warp so the quilt never reads as a grid. Its amplitude grows slowly
  // with distance from the hero (gradient ~0.05/unit: no visible shear anywhere) and is
  // almost nil over the hero itself.
  float away = smoothstep(0.25, 1.1, length(p * vec2(1.0, uTexAspect)));
  vec2 fieldWarp = vec2(fbm3(p * 0.9 + 11.7), fbm3(p * 0.9 + 37.1));
  p += fieldWarp * (0.05 * away);

  vec2 pStatic = p; // before the animated warp: anchors fine detail so it never shimmers

  // Animated flow warp: domain-warped noise sliding in two directions.
  float amp = uWaveAmp + uRipple * 0.03;
  vec2 fp = p * uWarpScale;
  vec2 q = vec2(fbm5(fp + vec2(uFlow * 0.045, uFlow * 0.02)),
                fbm5(fp + vec2(5.2, 1.3) - vec2(uFlow * 0.03, uFlow * 0.05)));
  vec2 warp = vec2(fbm5(fp + 2.4 * q + vec2(-uFlow * 0.02, uFlow * 0.035)),
                   fbm5(fp + 2.4 * q + vec2(9.1, -4.4) + vec2(uFlow * 0.04, 0.0)));
  p += warp * amp;

  vec2 t = worldToTex(p);
  vec3 col = sampleBicubic(t);

  // Local-contrast lift: add back a little of what a 3-texel blur removes, so fine
  // strands and speck edges read crisper without sharpening noise (the field texture is
  // a temporal average of several video frames, so there is little left to amplify).
  vec3 soft = textureLod(uTex, t, 1.6).rgb;
  col = max(col + (col - soft) * 0.32, 0.0);

  // Bloom of the paint's own bright specks, baked from the field so the bright pass
  // happens before the blur. Sampled with the same warped coordinates: it flows with them.
  vec3 speckBloom = texture(uBloom, t).rgb * uBloomOn;

  // Height field from coarse mips so the lighting follows ridges, not pixel grain.
  // Two scales: broad swells for the sheen, finer ridges for small glints.
  float epsB = 0.012 / uZoom;
  float epsF = 0.004 / uZoom;
  vec2 gradB = gradAt(p, epsB, 3.5);
  vec2 gradF = gradAt(p, epsF, 1.5);
  float hC = heightAt(p, 3.0);
  // 8-bit steps in the flat blue areas produce tiny gradients; ignore those so the
  // light only ever catches real ridges.
  float glB = length(gradB);
  gradB *= smoothstep(0.9, 2.8, glB);
  glB = length(gradB);
  float glF = length(gradF);
  gradF *= smoothstep(3.0, 9.0, glF);

  // Contrast around a navy-ish mean.
  col = mix(vec3(0.07, 0.09, 0.30), col, uContrast);

  // Lighting: a key light gliding slowly around the ridges, plus a broad, soft sheen.
  float ang = uLightAngle + sin(uTime * 0.11) * 0.55 + uTime * 0.035;
  vec3 L = normalize(vec3(cos(ang), sin(ang), 0.75));
  vec3 Lfill = normalize(vec3(cos(ang + 2.4), sin(ang + 2.4), 1.4));
  vec3 N = normalize(vec3(-gradB * 0.35 - gradF * 0.05, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hk = normalize(L + V);
  vec3 Hf = normalize(Lfill + V);
  float specK = pow(max(dot(N, Hk), 0.0), 26.0);
  float sheen = pow(max(dot(N, Hf), 0.0), 6.0) * 0.18;
  float edge = max(dot(gradB / max(glB, 1e-4), L.xy), 0.0) * smoothstep(1.5, 6.0, glB);
  float ridgeMask = smoothstep(0.04, 0.30, hC);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0); // tilt-dependent gloss on the steep flanks
  float light = (specK * 0.70 + edge * 0.12 + sheen * (0.6 + 0.8 * fres)) * ridgeMask * uLightStr;
  vec3 lightCol = mix(DEEP_BLUE, PERIWINKLE, specK);
  col += lightCol * light * 0.5;

  // Fibres and grain: the brushed, stringy, slightly grainy texture of the paint in the
  // footage. Anisotropic noise in the local tangent frame (streaks along the ridges) plus
  // an isotropic fine grain. Both are anchored to the un-animated coordinates and kept
  // well above pixel scale so they drift with the flow instead of shimmering.
  vec2 tangent = glB > 1e-4 ? vec2(-gradB.y, gradB.x) / glB : vec2(1.0, 0.0);
  vec2 fibreUV = vec2(dot(pStatic, tangent) * 40.0, dot(pStatic, vec2(tangent.y, -tangent.x)) * 260.0);
  float fibre = vnoise(fibreUV + vec2(uFlow * 0.03, 0.0)) - 0.5;
  fibre += 0.5 * (vnoise(fibreUV * vec2(2.1, 1.6) + 3.1) - 0.5);
  float grain = vnoise(pStatic * 520.0 + 7.7) - 0.5;
  grain += 0.5 * (vnoise(pStatic * 1040.0 + 2.2) - 0.5);
  col += vec3(0.6, 0.7, 1.0) * (fibre * 0.020 + grain * 0.016) * ridgeMask;

  // Stars and bokeh: depth layers in viewport-height units with scroll/camera parallax.
  float starScale = 1.0 / H; // world units -> viewport heights
  vec2 sp = c * vec2(viewAspect, 1.0);
  vec2 camS = (uCam + parallax) * starScale;
  vec3 stars = vec3(0.0);
  stars += starLayer(sp + camS * 0.16 + vec2(uTime * 0.0015, 0.0), 26.0, 0.7, 0.30 * uStars, 5.0, 0.0) * 0.40;
  stars += starLayer(sp + camS * 0.22 + vec2(uTime * 0.0020, 0.0), 16.0, 1.0, 0.32 * uStars, 3.0, 0.0) * 0.55;
  stars += starLayer(sp + camS * 0.48 + vec2(uTime * 0.0045, uTime * 0.0012), 9.0, 1.6, 0.26 * uStars, 11.0, 0.5) * 0.8;
  stars += starLayer(sp + camS * 0.85 + vec2(uTime * 0.0085, uTime * 0.0025), 5.0, 2.6, 0.22 * uStars, 23.0, 1.0);
  stars += starLayer(sp + camS * 1.15 + vec2(uTime * 0.0110, uTime * 0.0040), 3.0, 3.6, 0.10 * uStars, 41.0, 1.0) * 0.9;
  stars += bokehLayer(sp + camS * 1.4 + vec2(uTime * 0.0060, uTime * 0.0030), 2.2, 9.0, 0.10 * uStars, 67.0);
  stars += bokehLayer(sp + camS * 0.6 + vec2(-uTime * 0.0030, uTime * 0.0010), 3.5, 5.5, 0.08 * uStars, 89.0);
  col += stars * 1.3;
  // A slow shimmer keeps the speck glow from looking printed on.
  float shimmer = 0.88 + 0.12 * sin(uTime * 0.45 + (p.x + p.y) * 9.0);
  col += speckBloom * vec3(0.85, 0.9, 1.0) * (0.55 * shimmer);

  // Grading: tiny hue shift, darkness toward navy, soft vignette.
  col = hueRotate(col, uHue);
  col = mix(col, NAVY * 0.6, uDarkness * 0.85);
  float vig = smoothstep(1.35, 0.3, length(c * vec2(1.0, 1.15)));
  col *= mix(0.74, 1.0, vig);

  // Triangular-distributed dither (two hashes) so the dark gradients never band.
  vec2 dp = gl_FragCoord.xy + fract(uTime) * 61.7;
  float dither = (hash12(dp) + hash12(dp + 17.3) - 1.0) / 255.0;
  col += dither;

  fragColor = vec4(max(col, 0.0), 1.0);
}
