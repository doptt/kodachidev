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
// again and again in thinner and thinner bands: those are the rings, and they
// are made of the projects' own light and the galaxy's.
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

uniform sampler2DArray uShots;
uniform vec3 uSrcCentre[4]; // where each lit project is on the sky
uniform vec3 uSrcUp[4];     // which way is up in its picture
uniform vec2 uSrcLayer[4];  // x: layer in uShots, y: brightness (0 switches it off)
uniform vec2 uHalf;         // half-size of a picture, as tangents

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
// How bright the star map is drawn. It is a photograph of a dark sky: most of
// it is far below anything a screen can show beside a lit picture.
const float SKY_GAIN = 9.0;

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
  vec3 stored = textureGrad(uSkyMap, uSky * sky, uSky * skyDx, uSky * skyDy).rgb;
  vec3 starlight = stored * stored * stored * SKY_GAIN;
  // A touch of the palette's warmth, so the galaxy sits with the cream of the rings
  starlight *= vec3(1.0, 0.94, 0.86);
  col += starlight * uStars * uSkyOn * (1.0 + 1.6 * bent);

  // Projects. Slot 0 is the one nearest to settled, and is drawn last, on top.
  for (int n = 3; n >= 0; n--) {
    vec3 c = uSrcCentre[n];
    float z = dot(sky, c);
    float zs = max(z, 0.02);
    // Position on the picture's own plane: x across, y up
    vec2 p = vec2(sky.x, dot(sky, uSrcUp[n])) / zs;
    vec2 px = vec2(skyDx.x, dot(skyDx, uSrcUp[n])) / zs - p * dot(skyDx, c) / zs;
    vec2 py = vec2(skyDy.x, dot(skyDy, uSrcUp[n])) / zs - p * dot(skyDy, c) / zs;

    // Rounded rectangle
    float corner = 0.07 * uHalf.y;
    vec2 q = abs(p) - (uHalf - corner);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float soft = max(length(vec2(length(px), length(py))) * 0.75, 1e-6);
    float inside = (1.0 - smoothstep(-soft, soft, sd)) * step(0.02, z);

    vec2 uv = p / uHalf * 0.5 + 0.5;
    vec2 scale = 0.5 / uHalf;
    vec3 shot = textureGrad(uShots, vec3(uv, uSrcLayer[n].x), px * scale, py * scale).rgb;

    // A hairline of light round the picture. Squeezed into a ring it becomes the bright line of the ring.
    float line = 0.012 * uHalf.y;
    float rim = exp(-pow((sd + line) / max(line, soft), 2.0)) * min(1.0, line / soft);

    float gain = uSrcLayer[n].y;
    vec3 lit = shot * (1.0 + 1.5 * bent) + CREAM * rim * (0.55 + 3.2 * bent);
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
