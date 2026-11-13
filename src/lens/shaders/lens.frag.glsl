#version 300 es
// The sky as seen from a little way above a black hole, in linear HDR.
//
// The hole is straight down. Its shadow is the dark dome at the bottom of the
// view; everything above the edge of the shadow is sky, bent by the hole.
// Each pixel's ray stays in the plane through the hole that contains it, so
// the lens is one number per ray: how far round the hole it has swung by the
// time it is out among the stars. That comes from a table worked out on the
// CPU (geodesic.ts) for the height the camera is hovering at.
//
// What is in the sky: the real night sky (NASA's Deep Star Map: every star
// Gaia has measured, and the Milky Way), and the projects, each a lit picture
// painted on it. Every ray looks up the sky in the direction it ends up
// pointing, and nothing eases the lens off anywhere, so the sky is truly
// lensed. What lies exactly behind the hole is seen as a ring some way above
// the edge of the shadow (the Einstein ring). Above the ring the sky is seen
// directly; in the band between the ring and the shadow it is seen a second
// time, mirrored and squeezed. Right at the edge the deflection runs away, and
// the same sky comes round again and again in thinner and thinner bands.
//
// A lens this strong would bend a screenshot out of shape, so the pictures
// are painted for it: each is put on the sky already stretched, in the shape
// the lens bends back into a flat rectangle when the project is settled (see
// picture.ts, which does the same sum as the loop below).
precision highp float;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp samplerCube;

uniform vec2 uTan;          // tan(half fov) * (aspect, 1)
uniform float uShift;       // how far right of the middle of the screen the scene stands, in NDC
uniform mat3 uCam;          // columns: right, up, forward
uniform float uEdge;        // angle from straight down to the edge of the shadow
uniform float uPix;         // angle covered by one pixel, radians
uniform sampler2D uTable;   // deflection by angle (see geodesic.ts)
uniform sampler2D uInverse; // the same lens run backwards, for the height the camera rests at (see picture.ts)
uniform samplerCube uSkyMap; // the star map, stored through a cube root (see assets-src/README-sky.md)
uniform mat3 uSky;          // turns a direction in the scene into a direction on the star map
uniform float uSkyOn;       // 0 until the star map has loaded, then fading up to 1
uniform float uTime;        // seconds; held at 0 under reduced motion, so nothing twinkles or drifts
uniform float uAlive;       // 0 under reduced motion: no shooting stars
uniform vec3 uDriftAxis;    // the axis the stars drift round, as a direction on the star map
uniform float uMeteorAim;   // where on the sky shooting stars start: radians from the zenith, straight ahead

uniform sampler2DArray uShots;
uniform vec2 uSrcTurn[4];   // how far each lit project is from where it rests: cos and sin of the turn about x
uniform vec3 uSrcLayer[4];  // x: layer in uShots, y: how much of it is there (0 switches it off), z: how brightly it is lit
uniform mat3 uRest;         // the camera as it is at rest; columns: right, up, forward
uniform float uRestCentre;  // middle of a settled picture, as a tangent above the resting camera's axis
uniform vec2 uHalf;         // half-size of a settled picture on the resting screen, as tangents

uniform float uFade;        // brightness of the pictures and the rings
uniform float uStars;       // brightness of the stars
uniform float uRim;         // extra light on the edge of the shadow

in vec2 vUv;
out vec4 outColor;

const float PI = 3.14159265359;
// These two match geodesic.ts
const float TABLE_SIZE = 384.0;
const float TABLE_LOG = 13.0;
// This one matches picture.ts
const float INVERSE_SIZE = 256.0;
// The palette's cream (#FFEDC1), in linear light
const vec3 CREAM = vec3(1.0, 0.85, 0.53);
// How bright the star map is drawn. It is a photograph of a dark sky: most of
// it is far below anything a screen can show beside a lit picture.
const float SKY_GAIN = 9.0;
// A lens does not change how bright a surface looks, only how big: the
// pictures and the galaxy are drawn as bright as they are. A star is a point,
// and a point is brighter by as much as the lens enlarges the sky round it.
// That runs away on the ring, so it is capped here.
const float MAG_MAX = 12.0;
// How bright the hairline round a picture is. The same everywhere, and enough
// to bloom, so the line of the ring glows and a settled picture's frame with it.
const float HAIRLINE = 1.8;

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
// covers, grow how much the lens enlarges the sky here, and radius the star's
// size in pixels.
vec3 starLayer(vec3 dir, vec3 dirDx, vec3 dirDy, float foot, float grow, float n, float seed, float density, float radius, float gain) {
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
  // The lens brightens a star by as much as it enlarges the sky, and dims it
  // where it squeezes the sky. And a star has to stay inside its cell, so
  // where a great deal of sky is squeezed into each pixel the stars melt away.
  float limit = 0.1 / n;
  float keep = grow * (1.0 - smoothstep(0.6 * limit, limit, r * foot));

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
vec3 meteor(vec3 dir, float foot, float grow, float period, float seed) {
  float slot = floor(uTime / period);
  vec4 h = hash43(vec3(slot, seed, 4.0));
  vec4 k = hash43(vec3(seed, slot, 9.0));
  // Not every stretch has one
  if (k.x > 0.7) return vec3(0.0);
  const float LIFE = 1.1;
  float u = (uTime - slot * period - h.x * (period - LIFE)) / LIFE;
  if (u <= 0.0 || u >= 1.0) return vec3(0.0);

  // Where it starts and which way it falls (across and down). Both are laid
  // out round the level sky straight ahead, 1.22 radians from the zenith, and
  // then turned about x to where the camera is looking.
  float aim = uMeteorAim - 1.22;
  vec2 cs = vec2(cos(aim), sin(aim));
  vec3 s = normalize(vec3(h.y * 1.8 - 0.9, 0.12 + 0.5 * h.z, 1.0));
  vec3 w = vec3(h.w < 0.5 ? 1.0 : -1.0, -0.25 - 0.5 * k.y, 0.3 * (k.z - 0.5));
  s = vec3(s.x, s.y * cs.x - s.z * cs.y, s.y * cs.y + s.z * cs.x);
  w = vec3(w.x, w.y * cs.x - w.z * cs.y, w.y * cs.y + w.z * cs.x);
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
  float across = exp(-off * off / (width * width)) * grow;
  float life = sin(PI * u);
  return mix(CREAM, vec3(1.0), body) * (body * body * across * life * life * 5.0);
}

void main() {
  vec3 d = normalize(uCam * vec3((vUv * 2.0 - 1.0 - vec2(uShift, 0.0)) * uTan, 1.0));
  // Angle from straight down
  float psi = acos(clamp(-d.y, -1.0, 1.0));
  float above = psi - uEdge;
  float x = above / (PI - uEdge);

  // Deflection, from the table. It is laid out on a log scale toward the edge.
  float s = clamp(1.0 + log(max(x, 1e-9)) / TABLE_LOG, 0.0, 1.0) * (TABLE_SIZE - 1.0);
  float i = min(floor(s), TABLE_SIZE - 2.0);
  float phi = mix(texelFetch(uTable, ivec2(int(i), 0), 0).r, texelFetch(uTable, ivec2(int(i) + 1, 0), 0).r, s - i);

  float theta = phi;

  // The part of the sky this ray ends up pointing at
  vec2 flat2 = d.xz;
  vec3 tang = vec3(flat2.x, 0.0, flat2.y) / max(length(flat2), 1e-5);
  vec3 sky = cos(theta) * vec3(0.0, 1.0, 0.0) + sin(theta) * tang;
  vec3 skyDx = dFdx(sky);
  vec3 skyDy = dFdy(sky);

  // How much the lens enlarges the sky here: the solid angle this pixel covers
  // on the screen, over the solid angle of sky it sees
  float mag = min(length(cross(dFdx(d), dFdy(d))) / max(length(cross(skyDx, skyDy)), 1e-12), MAG_MAX);

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
  float point = smoothstep(0.012, 0.06, dot(starlight - glow, vec3(0.333)));
  float shimmer = 0.4 + 1.2 * vnoise(m * 320.0 + uTime * vec3(0.8, 0.5, -0.65));
  starlight *= (1.0 + point * (shimmer - 1.0)) * SKY_GAIN;
  // A touch of the palette's warmth, so the galaxy sits with the cream of the rings
  starlight *= vec3(1.0, 0.94, 0.86);

  // Stars drawn over the map, in three layers that turn at their own speeds.
  // There are more of them where the galaxy is thick.
  float foot = max(length(skyDx), length(skyDy));
  float thick = 0.55 + 0.45 * smoothstep(0.0, 0.035, dot(glow, vec3(0.333)));
  vec3 drawn = starLayer(spin(m, uDriftAxis, uTime * LAYER_DRIFT.x), spin(mDx, uDriftAxis, uTime * LAYER_DRIFT.x), spin(mDy, uDriftAxis, uTime * LAYER_DRIFT.x), foot, mag, 64.0, 1.0, 0.85 * thick, 0.95, 0.75);
  drawn += starLayer(spin(m, uDriftAxis, uTime * LAYER_DRIFT.y), spin(mDx, uDriftAxis, uTime * LAYER_DRIFT.y), spin(mDy, uDriftAxis, uTime * LAYER_DRIFT.y), foot, mag, 38.0, 2.0, 0.6 * thick, 1.15, 1.5);
  drawn += starLayer(spin(m, uDriftAxis, uTime * LAYER_DRIFT.z), spin(mDx, uDriftAxis, uTime * LAYER_DRIFT.z), spin(mDy, uDriftAxis, uTime * LAYER_DRIFT.z), foot, mag, 17.0, 3.0, 0.42, 1.45, 3.4);
  drawn += (meteor(sky, foot, mag, 6.5, 1.0) + meteor(sky, foot, mag, 11.0, 2.0)) * uAlive;

  col += (starlight * uSkyOn + drawn) * uStars;

  // Projects. Slot 0 is the one nearest to settled, and is drawn last, on top.
  for (int n = 3; n >= 0; n--) {
    // Turn this part of the sky back to where the project rests
    vec2 cs = uSrcTurn[n];
    vec3 r = vec3(sky.x, sky.y * cs.x + sky.z * cs.y, -sky.y * cs.y + sky.z * cs.x);
    // Where the resting camera sees it directly: the lens run backwards. A ray
    // stays in its plane through the hole, so the direction round the hole is
    // kept and only the angle from straight down changes.
    float v = acos(clamp(r.y, -1.0, 1.0)) / PI * (INVERSE_SIZE - 1.0);
    float j = min(floor(v), INVERSE_SIZE - 2.0);
    float back = mix(texelFetch(uInverse, ivec2(int(j), 0), 0).r, texelFetch(uInverse, ivec2(int(j) + 1, 0), 0).r, v - j);
    vec2 side = r.xz / max(length(r.xz), 1e-5);
    vec3 e = vec3(sin(back) * side.x, -cos(back), sin(back) * side.y);
    // Onto the resting screen: x across, y up, from the middle of the picture
    vec3 at = e * uRest;
    vec2 p = at.xy / max(at.z, 0.02) - vec2(0.0, uRestCentre);
    // How the picture changes from one pixel to the next. Across the ring it
    // jumps, so the change is capped: a seam there would sparkle.
    float cap = 0.25 * uHalf.y;
    vec2 px = dFdx(p);
    vec2 py = dFdy(p);
    px *= min(1.0, cap / max(length(px), 1e-9));
    py *= min(1.0, cap / max(length(py), 1e-9));

    // Rounded rectangle
    float corner = 0.07 * uHalf.y;
    vec2 q = abs(p) - (uHalf - corner);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float soft = max(length(vec2(length(px), length(py))) * 0.75, 1e-6);
    float inside = (1.0 - smoothstep(-soft, soft, sd)) * step(0.02, at.z);

    vec2 uv = p / uHalf * 0.5 + 0.5;
    vec2 scale = 0.5 / uHalf;
    vec3 shot = textureGrad(uShots, vec3(uv, uSrcLayer[n].x), px * scale, py * scale).rgb;

    // A hairline of light round the picture. Squeezed into a ring it becomes the bright line of the ring.
    float line = 0.012 * uHalf.y;
    float across = (sd + line) / max(line, soft);
    float rim = exp(-across * across) * min(1.0, line / soft);

    float gain = uSrcLayer[n].y;
    vec3 lit = shot * uSrcLayer[n].z + CREAM * rim * HAIRLINE;
    col = mix(col, lit * uFade, inside * gain);
  }

  // The edge of the shadow: every later image of the sky piled into one line
  float rise = max(above, 0.0);
  float edgeLine = exp(-rise / (uPix * 1.6)) * 1.5 + exp(-rise / 0.012) * 0.22 + exp(-rise / 0.06) * 0.03;
  col += CREAM * edgeLine * (0.5 + 2.6 * uRim) * max(uFade, uStars * 0.6);

  // Inside the shadow nothing comes back
  float open = smoothstep(0.0, uPix * 0.8, above);
  outColor = vec4(min(col * open, 64.0), 1.0);
}
