#version 300 es
// Final grade: sharpening, chromatic fringe, bloom, exposure, ACES tone mapping,
// vignette, film grain and dither, then the fade to exact black.
//
// The result is premultiplied: alpha is how much of the page behind the canvas
// is hidden. Empty space lets it through, the disk and the hole cover it, and
// the vignette, the closing iris and the final blackout darken it along with
// the scene.
precision highp float;
precision highp sampler2D;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;         // canvas size in pixels
uniform vec2 uHole;        // hole centre in uv
uniform float uRing;       // radius of the shadow, as a fraction of the height
uniform float uExposure;
uniform float uBloomAmt;
uniform float uFringe;
uniform float uSharpen;
uniform float uVignette;
uniform float uIris;       // edge darkness closing in, 0..1
uniform float uGrain;
uniform float uTime;
uniform float uBlackout;

in vec2 vUv;
out vec4 outColor;

// ACES fitted (Stephen Hill): sRGB → ACEScg-ish → RRT+ODT → sRGB
const mat3 ACES_IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
const mat3 ACES_OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
vec3 aces(vec3 c) {
  c = ACES_IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(ACES_OUT * (a / b), 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  if (uBlackout >= 1.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float aspect = uRes.x / uRes.y;
  vec2 fromHole = (vUv - uHole) * vec2(aspect, 1.0);
  float dist = length(fromHole);
  vec2 dir = fromHole / max(dist, 1e-4) / vec2(aspect, 1.0);

  // Fringe: strongest on the photon ring, a trace of it toward the corners
  float ringBand = exp(-pow((dist - uRing * 1.08) / (uRing * 0.42), 2.0));
  float k = uFringe * (ringBand * 0.00035 + dist * dist * 0.0004);
  vec4 centre = texture(uScene, vUv);
  vec3 col = vec3(texture(uScene, vUv + dir * k).r, centre.g, texture(uScene, vUv - dir * k).b);
  float cover = centre.a;

  // Unsharp mask: lifts the fine strands off the glow underneath them
  vec2 px = 1.0 / uRes;
  vec3 around = texture(uScene, vUv + vec2(px.x, 0.0)).rgb + texture(uScene, vUv - vec2(px.x, 0.0)).rgb
    + texture(uScene, vUv + vec2(0.0, px.y)).rgb + texture(uScene, vUv - vec2(0.0, px.y)).rgb;
  col = max(col + (centre.rgb - around * 0.25) * uSharpen, 0.0);

  // Glow everywhere except inside the shadow, which stays truly black
  col += texture(uBloom, vUv).rgb * uBloomAmt * smoothstep(uRing * 0.62, uRing * 1.02, dist);

  // Vignette, and the iris that closes in as the camera reaches the horizon.
  // Both darken the page behind as well as the scene.
  vec2 q = (vUv - 0.5) * vec2(min(aspect, 1.6), 1.0);
  float edge = dot(q, q);
  float iris = mix(1.6, -0.05, uIris);
  float keep = (1.0 - uVignette * smoothstep(0.08, 0.75, edge))
    * mix(1.0, smoothstep(iris + 0.5, iris, length(q)), step(0.001, uIris));
  col *= keep;

  col = toSrgb(aces(col * uExposure));
  // The tone curve burns the hottest parts to white. Bring them back to the
  // palette's cream (#FFEDC1), so pure white never appears.
  float hot = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(vec3(1.0), vec3(1.0, 0.929, 0.757), smoothstep(0.45, 1.0, hot));

  // Grain in the mid-tones; nothing is added to true black
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float n = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 311.0) - 0.5;
  col += n * uGrain * smoothstep(0.004, 0.12, l) * (1.0 - 0.6 * l);
  // Triangular dither, one 8-bit step wide, to keep the dark gradients from banding
  float d = hash(gl_FragCoord.xy * 1.37 + 17.0 + fract(uTime * 3.17) * 97.0) + hash(gl_FragCoord.yx * 1.91 + 5.0 + fract(uTime * 5.03) * 53.0) - 1.0;
  col += d / 255.0 * smoothstep(0.0, 2.0 / 255.0, l);
  col = max(col, 0.0) * (1.0 - uBlackout);

  // How much of the page is hidden: whatever the scene covers, plus whatever
  // light it adds (so glow brightens the page rather than washing it out),
  // plus the darkening of the vignette, the iris and the blackout.
  float alpha = max(cover, max(col.r, max(col.g, col.b)));
  alpha = 1.0 - (1.0 - alpha) * keep * (1.0 - uBlackout);
  outColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
