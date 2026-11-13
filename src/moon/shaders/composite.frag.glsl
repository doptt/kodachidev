// The last pass: the scene and its bloom, the sky put in behind them, then the
// film curve, a vignette and a breath of dither, out to the screen.
//
// The sky is drawn here rather than in the scene so that it is sampled once a
// screen pixel, after the scene has been antialiased, and takes no part in the
// bloom: stars stay points.
precision highp float;

uniform sampler2D uScene; // linear light; alpha is how much of the pixel the scene covers
uniform sampler2D uBloom;
uniform samplerCube uSky; // NASA's star map, stored through a cube root
uniform mat3 uSkyFrame;   // scene directions to the map's (galactic) axes
uniform vec3 uForward;    // the camera's forward axis
uniform vec3 uRight;      // its right axis, times the half-width of the view at unit distance
uniform vec3 uUp;         // its up axis, times the half-height
uniform float uFade;      // brightness of the scene, 0..1
uniform float uStars;     // brightness of the sky, 0..1
uniform float uSkyGain;
uniform float uGlow;
uniform float uExposure;
uniform float uAspect;
uniform float uPixel;      // the angle one pixel spans, radians

in vec2 vUv;
out vec4 outColor;

// The ACES film curve as three.js draws it (Stephen Hill's fit), so that the
// alien's materials look here as they did where they were made
vec3 rrtAndOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 film(vec3 color) {
  const mat3 inputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  return clamp(outputMat * rrtAndOdtFit(inputMat * color), 0.0, 1.0);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}

// Stars as points. The map's own are a few pixels of blur at this magnification; these are laid over it, each
// a pixel or two across whatever the size of the screen: one to a cell of a grid on the faces of a cube, most
// cells empty, a few bright.
vec3 points(vec3 d, float cells) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) {
    uv = d.yz / a.x;
    face = d.x > 0.0 ? 0.0 : 1.0;
  } else if (a.y >= a.z) {
    uv = d.xz / a.y;
    face = d.y > 0.0 ? 2.0 : 3.0;
  } else {
    uv = d.xy / a.z;
    face = d.z > 0.0 ? 4.0 : 5.0;
  }
  vec2 g = uv * cells;
  vec3 h = hash3(floor(g) + face * 37.0 + cells);
  if (h.z < 0.72) return vec3(0.0);
  float bright = pow((h.z - 0.72) / 0.28, 7.0);
  float size = uPixel * (0.8 + 0.9 * bright);
  float away = length(fract(g) - (0.25 + 0.5 * h.xy)) / cells;
  vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.87, 1.0), h.x);
  return tint * exp(-away * away / (size * size)) * (0.03 + 1.1 * bright);
}

// A far galaxy: a small tilted smudge with a brighter heart. `at` is its direction in the map's frame.
vec3 galaxy(vec3 g, vec3 at, float size, float squash, float turn, vec3 tint) {
  float near = dot(g, at);
  if (near < 0.995) return vec3(0.0);
  vec3 side = normalize(cross(at, vec3(0.0, 1.0, 0.0)));
  vec3 upward = cross(side, at);
  vec2 p = vec2(dot(g, side), dot(g, upward));
  p = vec2(p.x * cos(turn) + p.y * sin(turn), -p.x * sin(turn) + p.y * cos(turn)) / size;
  float r2 = p.x * p.x + p.y * p.y / (squash * squash);
  return tint * (exp(-r2 * 2.2) * 0.05 + exp(-r2 * 22.0) * 0.16);
}

void main() {
  vec4 scene = texture(uScene, vUv);
  vec3 color = (scene.rgb + texture(uBloom, vUv).rgb * uGlow) * uFade;

  float open = 1.0 - clamp(scene.a, 0.0, 1.0);
  if (open > 0.002 && uStars > 0.0) {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 dir = normalize(uForward + uRight * ndc.x + uUp * ndc.y);
    vec3 g = uSkyFrame * dir;
    vec3 sky = texture(uSky, g).rgb;
    sky = sky * sky * sky * uSkyGain + points(g, 58.0) + points(g, 23.0);
    sky += galaxy(g, normalize(vec3(0.93, 0.3, -0.2)), 0.011, 0.45, 0.6, vec3(1.0, 0.82, 0.6));
    sky += galaxy(g, normalize(vec3(0.72, 0.42, 0.55)), 0.008, 0.6, -0.9, vec3(0.75, 0.84, 1.0));
    sky += galaxy(g, normalize(vec3(0.55, 0.52, 0.65)), 0.014, 0.35, 0.2, vec3(1.0, 0.74, 0.55));
    sky += galaxy(g, normalize(vec3(0.82, 0.5, -0.28)), 0.007, 0.7, 1.4, vec3(0.9, 0.9, 1.0));
    sky += galaxy(g, normalize(vec3(0.6, 0.22, 0.77)), 0.009, 0.4, -0.3, vec3(1.0, 0.8, 0.7));
    color += sky * (uStars * open);
  }

  color = film(color);
  // The corners fall away a little, as through any lens
  vec2 q = (vUv - 0.5) * vec2(min(uAspect, 1.6), 1.0);
  color *= 1.0 - 0.22 * smoothstep(0.35, 1.05, length(q));
  color = toSrgb(color);
  // Half a code of noise, so the long dark gradients of the night side do not band
  color += (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.0) - 1.0) / 255.0;
  outColor = vec4(color, 1.0);
}
