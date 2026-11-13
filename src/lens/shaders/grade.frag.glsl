#version 300 es
// Final grade for the lensed sky: glow, a gentle shoulder for anything
// brighter than paper white, a trace of grain, and dither.
//
// Unlike the black hole's grade there is no film curve here. The pictures in
// this scene are screenshots of real sites, and they should come out in the
// colours they were made in; only the light that the lens has piled up into
// rings goes over white, and only that is rolled off.
precision highp float;
precision highp sampler2D;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uBloomAmt;
uniform float uGrain;
uniform float uTime;

in vec2 vUv;
out vec4 outColor;

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Straight up to 0.82, then easing toward 1
vec3 shoulder(vec3 c) {
  const float knee = 0.82;
  vec3 over = max(c - knee, 0.0);
  return min(c, knee) + (1.0 - knee) * (1.0 - exp(-over / (1.0 - knee)));
}

void main() {
  vec3 col = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomAmt;

  // A light vignette, so the corners of the sky fall away
  float aspect = uRes.x / uRes.y;
  vec2 q = (vUv - 0.5) * vec2(min(aspect, 1.6), 1.0);
  col *= 1.0 - 0.22 * smoothstep(0.1, 0.8, dot(q, q));

  col = toSrgb(shoulder(max(col, 0.0)));

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float n = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 311.0) - 0.5;
  col += n * uGrain * smoothstep(0.004, 0.12, l) * (1.0 - 0.6 * l);
  // Triangular dither, one 8-bit step wide, so the dark gradients don't band
  float dth = hash(gl_FragCoord.xy * 1.37 + 17.0 + fract(uTime * 3.17) * 97.0) + hash(gl_FragCoord.yx * 1.91 + 5.0 + fract(uTime * 5.03) * 53.0) - 1.0;
  col += dth / 255.0 * smoothstep(0.0, 2.0 / 255.0, l);

  outColor = vec4(max(col, 0.0), 1.0);
}
