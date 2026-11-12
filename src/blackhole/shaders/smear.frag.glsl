#version 300 es
// Radial streaks about the hole: light is dragged into long lines as the camera
// accelerates. Run twice, long then short, so the second pass fills the gaps
// between the taps of the first; the result is laid over the sharp image rather
// than replacing it, so the strands keep their detail. Only used late in the fall.
precision highp float;
precision highp sampler2D;

uniform sampler2D uSrc;
uniform sampler2D uSharp;  // the unsmeared scene
uniform float uMix;        // 0 sharp only .. 1 streaks only
uniform vec2 uCentre;      // hole position in uv
uniform float uLength;     // smear length as a fraction of the distance to the hole
uniform int uTaps;
uniform float uFrame;      // changes every frame so the tap pattern averages out over time

in vec2 vUv;
out vec4 outColor;

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 dir = vUv - uCentre;
  float n = float(uTaps);
  float offset = fract(ign(gl_FragCoord.xy) + uFrame * 0.6180339887);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  // Sample toward the hole: every tap stays on screen, and the shadow stays black
  for (int i = 0; i < uTaps; i++) {
    float t = (float(i) + offset) / n;
    float w = 1.0 - t * 0.8;
    sum += texture(uSrc, uCentre + dir * (1.0 - uLength * t)) * w;
    wsum += w;
  }
  outColor = mix(texture(uSharp, vUv), sum / wsum, uMix);
}
