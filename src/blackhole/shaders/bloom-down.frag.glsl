#version 300 es
// Bloom downsample: 13-tap filter (Jimenez, "Next Generation Post Processing in
// Call of Duty"). The first level also keeps only light above a soft threshold
// and averages by inverse brightness so single hot pixels don't flicker.
precision highp float;
precision highp sampler2D;

uniform sampler2D uSrc;
uniform vec2 uTexel;       // 1 / source size
uniform float uFirst;      // 1 on the first level
uniform float uThreshold;
uniform float uKnee;

in vec2 vUv;
out vec4 outColor;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
vec3 prefilter(vec3 c) {
  float l = luma(c);
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  return c * max(soft, l - uThreshold) / max(l, 1e-5);
}
vec3 tap(vec2 o) {
  return texture(uSrc, vUv + o * uTexel).rgb;
}
vec3 box(vec3 a, vec3 b, vec3 c, vec3 d) {
  if (uFirst > 0.5) {
    a = prefilter(a);
    b = prefilter(b);
    c = prefilter(c);
    d = prefilter(d);
    float wa = 1.0 / (1.0 + luma(a));
    float wb = 1.0 / (1.0 + luma(b));
    float wc = 1.0 / (1.0 + luma(c));
    float wd = 1.0 / (1.0 + luma(d));
    return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  }
  return (a + b + c + d) * 0.25;
}

void main() {
  vec3 a = tap(vec2(-2.0, 2.0));
  vec3 b = tap(vec2(0.0, 2.0));
  vec3 c = tap(vec2(2.0, 2.0));
  vec3 d = tap(vec2(-2.0, 0.0));
  vec3 e = tap(vec2(0.0, 0.0));
  vec3 f = tap(vec2(2.0, 0.0));
  vec3 g = tap(vec2(-2.0, -2.0));
  vec3 h = tap(vec2(0.0, -2.0));
  vec3 i = tap(vec2(2.0, -2.0));
  vec3 j = tap(vec2(-1.0, 1.0));
  vec3 k = tap(vec2(1.0, 1.0));
  vec3 l = tap(vec2(-1.0, -1.0));
  vec3 m = tap(vec2(1.0, -1.0));

  vec3 col = box(j, k, l, m) * 0.5;
  col += box(a, b, d, e) * 0.125;
  col += box(b, c, e, f) * 0.125;
  col += box(d, e, g, h) * 0.125;
  col += box(e, f, h, i) * 0.125;
  outColor = vec4(col, 1.0);
}
