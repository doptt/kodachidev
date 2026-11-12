#version 300 es
// Baked once at start-up: every row of this texture is one strand of the disk.
// Rows are independent 1D noise, periodic in x, so a strand can be wrapped any
// whole number of times around the hole and rotated at its own speed.
//   R  long swells: where a strand is lit and where it fades out
//   G  medium variation
//   B  sparse beads: the glitter along a strand
//   A  fine variation
// The three bands are kept apart so each layer of strands can use only the
// ones that stay much longer than the strand is wide.
precision highp float;
uniform vec2 uSize;
out vec4 outColor;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hash(int cell, int row, int seed) {
  return float(pcg(uint(cell) + pcg(uint(row) + pcg(uint(seed))))) / 4294967295.0;
}
/** Value noise along x with `period` cells per texture width. */
float vnoise(float x, int period, int row, int seed) {
  float p = x * float(period);
  int i = int(floor(p));
  float f = p - float(i);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(hash(i % period, row, seed), hash((i + 1) % period, row, seed), f);
}

void main() {
  float x = gl_FragCoord.x / uSize.x;
  int row = int(gl_FragCoord.y);

  float slow = vnoise(x, 2, row, 1) * 0.5 + vnoise(x, 5, row, 2) * 0.32 + vnoise(x, 9, row, 3) * 0.18;
  float mid = vnoise(x, 16, row, 4) * 0.5 + vnoise(x, 34, row, 5) * 0.32 + vnoise(x, 64, row, 6) * 0.18;
  float fine = vnoise(x, 110, row, 7) * 0.6 + vnoise(x, 256, row, 13) * 0.4;
  // Beads: sharp peaks of a fast noise, gated by a slower one so they come in runs
  float gate = smoothstep(0.52, 0.78, vnoise(x, 29, row, 8));
  float bead = pow(vnoise(x, 340, row, 9), 9.0) * gate;
  bead += pow(vnoise(x, 150, row, 10), 22.0) * 2.0;
  outColor = vec4(slow, mid, clamp(bead, 0.0, 1.0), fine);
}
