#version 300 es
// Temporal accumulation: blends this frame's jittered render into the history.
// At rest the history is trusted fully, which supersamples the thin strands and
// the photon ring; while the camera moves it is clamped to what the current
// frame could plausibly contain, so nothing ghosts. Alpha (coverage) is
// accumulated along with the colour.
precision highp float;
precision highp sampler2D;

uniform sampler2D uCur;
uniform sampler2D uHist;
uniform float uBlend;   // weight of the current frame
uniform float uClamp;   // 0 trust history, 1 clamp it to the current neighbourhood

in vec2 vUv;
out vec4 outColor;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 cur = texelFetch(uCur, px, 0);
  vec4 hist = texture(uHist, vUv);

  if (uClamp > 0.0) {
    ivec2 hi = textureSize(uCur, 0) - 1;
    vec4 a = texelFetch(uCur, clamp(px + ivec2(1, 0), ivec2(0), hi), 0);
    vec4 b = texelFetch(uCur, clamp(px - ivec2(1, 0), ivec2(0), hi), 0);
    vec4 c = texelFetch(uCur, clamp(px + ivec2(0, 1), ivec2(0), hi), 0);
    vec4 d = texelFetch(uCur, clamp(px - ivec2(0, 1), ivec2(0), hi), 0);
    vec4 lo = min(cur, min(min(a, b), min(c, d)));
    vec4 up = max(cur, max(max(a, b), max(c, d)));
    hist = mix(hist, clamp(hist, lo, up), uClamp);
  }

  // Weight by inverse brightness so a single hot sample can't flicker
  float wc = uBlend / (1.0 + luma(cur.rgb));
  float wh = (1.0 - uBlend) / (1.0 + luma(hist.rgb));
  outColor = (cur * wc + hist * wh) / max(wc + wh, 1e-5);
}
