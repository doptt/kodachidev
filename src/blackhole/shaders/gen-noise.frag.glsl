#version 300 es
// Baked once at start-up: a tileable 2D noise atlas.
//   R  smooth fbm (spiral lanes in the disk)
//   G  unused
//   B  second smooth fbm (warps the strands so they wave like hair)
//   A  ridged fbm (dark gaps, the lanes of the veil)
precision highp float;
uniform vec2 uSize;
out vec4 outColor;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
vec2 hash2(ivec2 c, int seed) {
  uint a = pcg(uint(c.x) + pcg(uint(c.y) + pcg(uint(seed))));
  uint b = pcg(a);
  return vec2(a, b) / 4294967295.0;
}
ivec2 wrap(ivec2 c, int period) {
  return ((c % period) + period) % period;
}

/** Tileable value noise, `period` cells across the texture. */
float vnoise(vec2 uv, int period, int seed) {
  vec2 p = uv * float(period);
  ivec2 i = ivec2(floor(p));
  vec2 f = p - vec2(i);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash2(wrap(i, period), seed).x;
  float b = hash2(wrap(i + ivec2(1, 0), period), seed).x;
  float c = hash2(wrap(i + ivec2(0, 1), period), seed).x;
  float d = hash2(wrap(i + ivec2(1, 1), period), seed).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 uv, int period, int seed) {
  float sum = 0.0;
  float amp = 0.5;
  for (int o = 0; o < 6; o++) {
    sum += amp * vnoise(uv, period, seed + o);
    period *= 2;
    amp *= 0.5;
  }
  return sum / 0.984;
}

float ridged(vec2 uv, int period, int seed) {
  float sum = 0.0;
  float amp = 0.5;
  for (int o = 0; o < 5; o++) {
    float n = 1.0 - abs(vnoise(uv, period, seed + o) * 2.0 - 1.0);
    sum += amp * n * n;
    period *= 2;
    amp *= 0.5;
  }
  return sum / 0.969;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  outColor = vec4(fbm(uv, 4, 11), 0.0, fbm(uv, 4, 37), ridged(uv, 5, 53));
}
