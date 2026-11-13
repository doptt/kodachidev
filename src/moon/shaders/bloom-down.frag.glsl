// Bloom, on the way down: each level is half the size of the one before. The
// first level also decides what glows at all: only what is brighter than the
// sunlit ground (the pins, the Earth's limb, a highlight on the can).
precision highp float;

uniform sampler2D uSource;
uniform vec2 uTexel;      // one texel of the source
uniform float uThreshold; // 0 on every level but the first

in vec2 vUv;
out vec4 outColor;

vec3 take(vec2 offset) {
  return texture(uSource, vUv + offset * uTexel).rgb;
}

void main() {
  // Four bilinear taps, each the mean of four texels: a 4x4 box, cheap and free of shimmer
  vec3 sum = take(vec2(-1.0, -1.0)) + take(vec2(1.0, -1.0)) + take(vec2(-1.0, 1.0)) + take(vec2(1.0, 1.0));
  vec3 color = sum * 0.25;
  if (uThreshold > 0.0) {
    // A glint off polished metal can be a hundred times white: held down, or one pixel of it floods the picture
    color = min(color, vec3(5.0));
    float brightest = max(color.r, max(color.g, color.b));
    // A soft knee, so that something crossing the threshold does not pop
    float over = max(brightest - uThreshold, 0.0);
    color *= over / (over + uThreshold * 0.5) * step(1e-5, brightest);
  }
  outColor = vec4(color, 1.0);
}
