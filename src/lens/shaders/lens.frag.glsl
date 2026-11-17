#version 300 es
// The sky as seen from just above a black hole, in linear HDR.
//
// The hole is straight down. Its shadow fills the bottom of the view like a
// horizon; everything above the edge of the shadow is sky, bent by the hole.
// Each pixel's ray stays in the plane through the hole that contains it, so
// the lens is one number per ray: how far round the hole it has swung by the
// time it is out among the stars. That comes from a table worked out on the
// CPU (geodesic.ts) for the height the camera is hovering at.
//
// What is in the sky: the real night sky (NASA's Deep Star Map: every star
// Gaia has measured, and the Milky Way), and the projects, each a lit picture
// hung on it. Every ray looks up the map in the direction it ends up pointing,
// so the sky is truly lensed: squeezed toward the horizon, mirrored in the
// band just above the edge of the shadow, and smeared into arcs along it.
// Right at that edge the deflection runs away, and the same sky comes round
// again and again in thinner and thinner bands.
//
// The horizon itself is drawn, not worked out: a band of the palette's tan
// light lying along the edge of the shadow, hot and cream at its top, with
// fine streaks running round the hole under it and thinning into the dark.
precision highp float;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp samplerCube;

uniform vec2 uTan;          // tan(half fov) * (aspect, 1)
uniform mat3 uCam;          // columns: right, up, forward
uniform float uEdge;        // angle from straight down to the edge of the shadow
uniform float uReach;       // how far above that edge the lens is felt, radians
uniform float uFloor;       // how much of the lens is kept above that (see LENS_FLOOR in geodesic.ts)
uniform float uPix;         // angle covered by one pixel, radians
uniform sampler2D uTable;   // deflection by angle (see geodesic.ts)
uniform samplerCube uSkyMap; // the star map, stored through a cube root (see assets-src/README-sky.md)
uniform mat3 uSky;          // turns a direction in the scene into a direction on the star map
uniform float uSkyOn;       // 0 until the star map has loaded, then fading up to 1
uniform float uTime;        // seconds; held at 0 under reduced motion, so nothing twinkles or drifts
uniform float uAlive;       // 0 under reduced motion: no shooting stars
uniform vec3 uDriftAxis;    // the axis the stars drift round, as a direction on the star map

uniform sampler2DArray uShots; // each project's first picture, a layer each
uniform sampler2DArray uMore;  // their further views
uniform vec3 uSrcCentre[6]; // where each lit card is on the sky
uniform vec3 uSrcUp[6];     // which way is up in its picture
uniform vec3 uSrcRight[6];  // and which way is across
uniform vec2 uSrcLayer[6];  // x: layer in uShots, or below zero, -1 - layer in uMore; y: brightness (0 switches it off)
uniform vec3 uSrcShape[6];  // x: its size, as a share of uHalf; y: how much it fades toward the sides of the screen; z: how bright it is
uniform vec2 uSideFade;     // where across the screen that fade begins and where it would be complete: |x|, 1 at the edge
uniform vec2 uHalf;         // half-size of a settled picture, as tangents

uniform float uFade;        // brightness of the pictures and the rings
uniform float uStars;       // brightness of the stars
uniform float uRim;         // extra light on the edge of the shadow

in vec2 vUv;
out vec4 outColor;

const float PI = 3.14159265359;
// These two match geodesic.ts
const float TABLE_SIZE = 384.0;
const float TABLE_LOG = 13.0;
// The palette's cream (#FFEDC1), in linear light
const vec3 CREAM = vec3(1.0, 0.85, 0.53);
// The palette's tan (#BCA68E), in linear light, a shade toward gold so that it glows and does not grey
const vec3 TAN = vec3(0.5, 0.385, 0.25);
// The horizon's band of light. Angles are radians below the edge of the shadow.
const float BAND_AT = 0.008;    // where its hot core lies
const float BAND_WIDE = 0.0085; // how wide the core is
const float BAND_BODY = 0.03;   // how deep the tan body under the core goes
const float BAND_DEEP = 0.027;  // how fast the streaks under it thin out
// How bright the star map is drawn. It is a photograph of a dark sky: most of
// it is far below anything a screen can show beside a lit picture.
const float SKY_GAIN = 9.0;
// The galaxy's own glow (the map without its stars) is drawn darker and with more contrast than that:
// at GALAXY_FULL (the map's light, as stored, at the bright heart of the Milky Way) it keeps GALAXY_GAIN
// of its light, and the fainter it is the less it keeps, by the power GALAXY_CURVE.
const float GALAXY_FULL = 0.035;
const float GALAXY_GAIN = 0.8;
const float GALAXY_CURVE = 0.52;

// How far each layer of drawn stars turns ahead of the map, radians a second:
// the nearer the layer, the faster, which is what gives the sky its depth.
const vec3 LAYER_DRIFT = vec3(0.0025, 0.006, 0.011);

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec4 hash43(vec3 p) {
  vec4 p4 = fract(vec4(p.xyzx) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
// Smooth noise, 0..1
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
// v turned about the unit axis k
vec3 spin(vec3 v, vec3 k, float a) {
  float c = cos(a);
  return v * c + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - c);
}

// One set of the streaks under the horizon: `lines` of them to the radian,
// each a row round the hole at its own depth, lit in long dashes that slide
// slowly along it. `ring` is the way round the hole, as a unit vector, so the
// dashes join up all the way round. Rows thinner than a pixel melt away.
float streaks(float depth, vec2 ring, float lines, float seed) {
  float row = depth * lines;
  float i = floor(row);
  float f = row - i;
  vec4 h = hash43(vec3(i, seed, 2.0));
  float a = uTime * (0.01 + 0.035 * h.z);
  float c = cos(a);
  float s = sin(a);
  vec2 r = vec2(c * ring.x - s * ring.y, s * ring.x + c * ring.y);
  float dash = smoothstep(0.4, 0.8, vnoise(vec3(r * (1.4 + 3.2 * h.y), i * 7.13 + seed * 31.0)));
  float wide = 0.14 + 0.24 * h.w;
  float across = exp(-(f - 0.5) * (f - 0.5) / (wide * wide));
  float keep = smoothstep(1.1, 2.4, 1.0 / (lines * uPix));
  return h.x * h.x * dash * across * keep;
}

// The colour of a star, cool red giants to hot blue ones, by a number 0..1.
// Most come out between cream and white, so the sky stays in the palette.
vec3 starTint(float c) {
  const vec3 ember = vec3(1.0, 0.62, 0.36);
  const vec3 cream = vec3(1.0, 0.86, 0.62);
  const vec3 white = vec3(1.0, 0.97, 0.92);
  const vec3 blue = vec3(0.66, 0.8, 1.0);
  if (c < 0.14) return mix(ember, cream, c / 0.14);
  if (c < 0.66) return mix(cream, white, (c - 0.14) / 0.52);
  return mix(white, blue, (c - 0.66) / 0.34);
}

// One layer of drawn stars: the sky is cut into cells (n across each face of
// a cube) and each cell may hold one star, somewhere near its middle.
//
// dir is where on the sky this pixel's ray ends up, dirDx and dirDy how that
// changes to the next pixel across and up, foot how much sky the pixel
// covers, and radius the star's size in pixels.
vec3 starLayer(vec3 dir, vec3 dirDx, vec3 dirDy, float foot, float n, float seed, float density, float radius, float gain) {
  vec3 a = abs(dir);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) { uv = dir.yz / a.x; face = dir.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { uv = dir.zx / a.y; face = dir.y > 0.0 ? 2.0 : 3.0; }
  else { uv = dir.xy / a.z; face = dir.z > 0.0 ? 4.0 : 5.0; }
  vec2 cell = floor((uv * 0.5 + 0.5) * n);
  vec4 h = hash43(vec3(cell, face * 19.0 + seed));
  if (h.x > density) return vec3(0.0);
  vec4 k = hash43(vec3(cell.yx + 7.0, face * 13.0 + seed + 3.0));

  vec2 sp = (cell + 0.5 + (h.yz - 0.5) * 0.5) / n * 2.0 - 1.0;
  float sgn = mod(face, 2.0) < 0.5 ? 1.0 : -1.0;
  vec3 star = normalize(face < 1.5 ? vec3(sgn, sp) : face < 3.5 ? vec3(sp.y, sgn, sp.x) : vec3(sp, sgn));

  // Most are faint; a few are bright, and those are a little larger
  float mag = pow(h.w, 7.0);
  // A star is a point, so it is drawn as a round dot of so many pixels
  // however the lens has stretched the sky round it. How far this pixel is
  // from the star, in pixels, comes from how the sky changes from one pixel
  // to the next.
  float r = radius * (1.0 + 1.2 * mag);
  vec3 off = star - dir;
  float aa = dot(dirDx, dirDx);
  float ab = dot(dirDx, dirDy);
  float bb = dot(dirDy, dirDy);
  vec2 rhs = vec2(dot(dirDx, off), dot(dirDy, off));
  vec2 px = vec2(bb * rhs.x - ab * rhs.y, aa * rhs.y - ab * rhs.x) / max(aa * bb - ab * ab, 1e-24);
  float core = exp(-dot(px, px) / (r * r));
  // A star has to stay inside its cell, so where the lens squeezes a great
  // deal of sky into each pixel the stars dim and then melt away
  float limit = 0.1 / n;
  float keep = min(1.0, uPix / foot) * (1.0 - smoothstep(0.6 * limit, limit, r * foot));

  // Twinkle: two slow beats out of step, and for some stars a brief glint now and then
  float tw = 1.0 + 0.36 * sin(uTime * (1.2 + 3.0 * k.x) + k.y * 6.2832) + 0.2 * sin(uTime * (3.8 + 4.6 * k.z) + k.w * 6.2832);
  float glint = pow(0.5 + 0.5 * sin(uTime * (0.45 + 1.1 * k.y) + k.x * 6.2832), 18.0) * step(0.55, k.z);
  // The colour shivers with the light, as it does for a star low in the sky
  vec3 tint = starTint(clamp(h.x / density + 0.06 * (tw - 1.0), 0.0, 1.0));
  return tint * core * keep * gain * (0.1 + 1.9 * mag) * (tw + 1.5 * glint);
}

// A shooting star now and then: a short streak along a great circle of the
// sky, bright at the head and fading down the tail. One may fall in each
// stretch of `period` seconds; `seed` tells the streams apart.
vec3 meteor(vec3 dir, float foot, float period, float seed) {
  float slot = floor(uTime / period);
  vec4 h = hash43(vec3(slot, seed, 4.0));
  vec4 k = hash43(vec3(seed, slot, 9.0));
  // Not every stretch has one
  if (k.x > 0.7) return vec3(0.0);
  const float LIFE = 1.1;
  float u = (uTime - slot * period - h.x * (period - LIFE)) / LIFE;
  if (u <= 0.0 || u >= 1.0) return vec3(0.0);

  // Where it starts (up in the sky ahead) and which way it falls (across and down)
  vec3 s = normalize(vec3(h.y * 1.8 - 0.9, 0.12 + 0.5 * h.z, 1.0));
  vec3 w = vec3(h.w < 0.5 ? 1.0 : -1.0, -0.25 - 0.5 * k.y, 0.3 * (k.z - 0.5));
  vec3 v = normalize(w - s * dot(w, s));
  vec3 nrm = cross(s, v);

  float ahead = dot(dir, s);
  if (ahead <= 0.2) return vec3(0.0);
  float along = atan(dot(dir, v), ahead);
  float off = dot(dir, nrm);
  float reach = 0.16 + 0.22 * k.w;
  float head = reach * (1.0 - (1.0 - u) * (1.0 - u));
  float tail = 0.035 + 0.07 * sin(PI * u);
  float back = head - along;
  float body = back > 0.0 && back < tail ? (1.0 - back / tail) : 0.0;
  float width = max(uPix * 0.9, foot * 0.75);
  float across = exp(-off * off / (width * width)) * min(1.0, uPix / width);
  float life = sin(PI * u);
  return mix(CREAM, vec3(1.0), body) * (body * body * across * life * life * 5.0);
}

void main() {
  vec3 d = normalize(uCam * vec3((vUv * 2.0 - 1.0) * uTan, 1.0));
  // Angle from straight down
  float psi = acos(clamp(-d.y, -1.0, 1.0));
  float above = psi - uEdge;
  float x = above / (PI - uEdge);

  // Deflection, from the table. It is laid out on a log scale toward the edge.
  float s = clamp(1.0 + log(max(x, 1e-9)) / TABLE_LOG, 0.0, 1.0) * (TABLE_SIZE - 1.0);
  float i = min(floor(s), TABLE_SIZE - 2.0);
  float phi = mix(texelFetch(uTable, ivec2(int(i), 0), 0).r, texelFetch(uTable, ivec2(int(i) + 1, 0), 0).r, s - i);

  // The lens is felt in full at the edge and eased off above it, so that a
  // picture standing clear of the horizon can be read (see geodesic.ts)
  float t = clamp(above / uReach, 0.0, 1.0);
  float w = uFloor + (1.0 - uFloor) * (1.0 - t * t * (3.0 - 2.0 * t));
  float theta = w * phi + (1.0 - w) * (PI - psi);

  // The part of the sky this ray ends up pointing at
  vec2 flat2 = d.xz;
  vec3 tang = vec3(flat2.x, 0.0, flat2.y) / max(length(flat2), 1e-5);
  vec3 sky = cos(theta) * vec3(0.0, 1.0, 0.0) + sin(theta) * tang;
  vec3 skyDx = dFdx(sky);
  vec3 skyDy = dFdy(sky);

  // Light that has been round the hole comes back brighter: the rings glow
  float bent = smoothstep(1.75, 2.9, theta);

  vec3 col = vec3(0.0);

  // The night sky. The map is read with the true size of this pixel on the
  // sky, so that where the lens squeezes a wide stretch of sky into a thin
  // band the band gets the average of it, and does not sparkle.
  vec3 m = uSky * sky;
  vec3 mDx = uSky * skyDx;
  vec3 mDy = uSky * skyDy;
  // The map is read twice: once as it is, and once blurred, which is the
  // galaxy's glow and dust without its stars. Where the first stands well
  // clear of the second there is a star in the map, and those shimmer.
  vec3 sharp = textureGrad(uSkyMap, m, mDx, mDy).rgb;
  vec3 soft = textureGrad(uSkyMap, m, mDx * 6.0, mDy * 6.0).rgb;
  vec3 glow = soft * soft * soft;
  vec3 starlight = sharp * sharp * sharp;
  // What stands clear of the blur is the map's stars; the rest is the galaxy itself, with its dust lanes
  vec3 points = max(starlight - glow, 0.0);
  vec3 field = starlight - points;
  // The galaxy is drawn with more contrast than the photograph has, so that the sky is black, its
  // dust falls away into that, and only the bright river of it is left standing. The stars keep all their light.
  float dust = dot(glow, vec3(0.333));
  field *= min(1.0, GALAXY_GAIN * pow(dust / GALAXY_FULL, GALAXY_CURVE));
  float point = smoothstep(0.012, 0.06, dot(points, vec3(0.333)));
  float shimmer = 0.4 + 1.2 * vnoise(m * 320.0 + uTime * vec3(0.8, 0.5, -0.65));
  starlight = (field + points * (1.0 + point * (shimmer - 1.0))) * SKY_GAIN;
  // A touch of the palette's warmth, so the galaxy sits with the tan of the horizon
  starlight *= vec3(1.0, 0.93, 0.83);

  // Stars drawn over the map, in three layers that turn at their own speeds.
  // There are more of them where the galaxy is thick.
  float foot = max(length(skyDx), length(skyDy));
  float thick = 0.55 + 0.45 * smoothstep(0.0, 0.035, dot(glow, vec3(0.333)));
  vec3 drawn = starLayer(spin(m, uDriftAxis, uTime * LAYER_DRIFT.x), spin(mDx, uDriftAxis, uTime * LAYER_DRIFT.x), spin(mDy, uDriftAxis, uTime * LAYER_DRIFT.x), foot, 64.0, 1.0, 0.85 * thick, 0.95, 0.75);
  drawn += starLayer(spin(m, uDriftAxis, uTime * LAYER_DRIFT.y), spin(mDx, uDriftAxis, uTime * LAYER_DRIFT.y), spin(mDy, uDriftAxis, uTime * LAYER_DRIFT.y), foot, 38.0, 2.0, 0.6 * thick, 1.15, 1.5);
  drawn += starLayer(spin(m, uDriftAxis, uTime * LAYER_DRIFT.z), spin(mDx, uDriftAxis, uTime * LAYER_DRIFT.z), spin(mDy, uDriftAxis, uTime * LAYER_DRIFT.z), foot, 17.0, 3.0, 0.42, 1.45, 3.4);
  drawn += (meteor(sky, foot, 6.5, 1.0) + meteor(sky, foot, 11.0, 2.0)) * uAlive;

  // Down against the horizon the lens piles the whole sky up into thin arcs. They are let go dim,
  // so that what lies along the horizon is its own band of light and the sky above it is clean.
  col += (starlight * uSkyOn + drawn) * uStars * (1.0 - 0.92 * smoothstep(1.9, 2.7, theta));

  // The cards: each lit project's picture, and round the settled one its further views, on the same
  // sky to either side. Slot 0 is the one nearest to settled, and is drawn last, on top.
  // The cards beside the middle one fade out toward the sides of the screen.
  float aside = 1.0 - smoothstep(uSideFade.x, uSideFade.y, abs(vUv.x * 2.0 - 1.0));
  for (int n = 5; n >= 0; n--) {
    // A slot that is switched off costs this one comparison
    float gain = uSrcLayer[n].y;
    if (gain <= 0.0) continue;
    vec3 c = uSrcCentre[n];
    float z = dot(sky, c);
    if (z < 0.02) continue;
    // Position on the picture's own plane: x across, y up
    vec2 p = vec2(dot(sky, uSrcRight[n]), dot(sky, uSrcUp[n])) / z;
    vec2 px = vec2(dot(skyDx, uSrcRight[n]), dot(skyDx, uSrcUp[n])) / z - p * dot(skyDx, c) / z;
    vec2 py = vec2(dot(skyDy, uSrcRight[n]), dot(skyDy, uSrcUp[n])) / z - p * dot(skyDy, c) / z;

    // Rounded rectangle
    vec2 size = uHalf * uSrcShape[n].x;
    float corner = 0.07 * size.y;
    vec2 q = abs(p) - (size - corner);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float soft = max(length(vec2(length(px), length(py))) * 0.75, 1e-6);
    // Only the first image of a picture is drawn. The later ones, of light that has been right round
    // the hole, are hairlines against the edge of the shadow, where the horizon's own band now lies.
    // Outside the card there is nothing to draw, and its picture is not looked up.
    if (sd >= soft || theta >= 3.3) continue;
    float inside = (1.0 - smoothstep(-soft, soft, sd)) * (1.0 - smoothstep(2.9, 3.3, theta));

    vec2 uv = p / size * 0.5 + 0.5;
    vec2 scale = 0.5 / size;
    float layer = uSrcLayer[n].x;
    vec3 shot;
    if (layer >= 0.0) shot = textureGrad(uShots, vec3(uv, layer), px * scale, py * scale).rgb;
    else shot = textureGrad(uMore, vec3(uv, -1.0 - layer), px * scale, py * scale).rgb;

    // A hairline of light round the picture. Squeezed into a ring it becomes the bright line of the ring.
    float line = 0.012 * size.y;
    float rim = exp(-pow((sd + line) / max(line, soft), 2.0)) * min(1.0, line / soft);

    vec3 lit = shot * (1.0 + 1.5 * bent) + CREAM * rim * (0.55 + 3.2 * bent);
    // Toward the side of the screen a card goes dark first and only then thin, so the stars do not show through its picture
    float sideways = mix(1.0, aside, uSrcShape[n].y);
    col = mix(col, lit * (uFade * uSrcShape[n].z * sideways), inside * gain * smoothstep(0.0, 0.45, sideways));
  }

  // Inside the shadow nothing comes back
  col *= smoothstep(0.0, uPix * 0.8, above);

  // The horizon. Just inside the edge of the shadow lies the band: a hot core
  // that swells and thins along its length, its glow spilling up into the sky
  // and down over the streaks, which run round the hole and fade into the dark.
  float depth = -above;
  float rise = max(above, 0.0);
  float sunk = max(depth, 0.0);
  vec2 ring = d.xz / max(length(d.xz), 1e-5);
  float swell = 0.55 + 0.9 * vnoise(vec3(ring * 1.7 + uTime * 0.018, 5.0));
  float off = (depth - BAND_AT) / BAND_WIDE;
  float core = exp(-off * off) * swell;
  // The glow: tight round the core, and a wider breath of it over the low sky
  float halo = exp(-abs(depth - BAND_AT) / 0.02) * 0.16 + step(0.0, above) * exp(-rise / 0.09) * 0.02;
  float lines = streaks(sunk, ring, 78.0, 1.0) + 0.85 * streaks(sunk, ring, 190.0, 2.0) + 0.7 * streaks(sunk, ring, 430.0, 3.0);
  float inside = step(0.0, depth);
  // The body of the band: tan, under the core, itself drawn out into streaks
  float body = inside * exp(-sunk * sunk / (BAND_BODY * BAND_BODY)) * (0.6 + 0.5 * swell) * (0.5 + 1.0 * lines);
  float under = inside * (exp(-sunk / BAND_DEEP) + 0.07 * exp(-sunk / 0.1)) * (1.0 - smoothstep(0.16, 0.3, sunk));
  // The limb itself: a hairline where the sky stops
  float limb = step(0.0, above) * exp(-rise / (uPix * 1.4)) * 0.12;
  vec3 band = CREAM * (core * 1.5 + limb) + TAN * (halo + body + under * (0.04 + 1.3 * lines)) + CREAM * under * under * lines * 0.3;
  col += band * (0.75 + 2.2 * uRim) * max(uFade, uStars * 0.6);

  outColor = vec4(min(col, 64.0), 1.0);
}
