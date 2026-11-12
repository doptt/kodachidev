#version 300 es
// Bloom upsample: 9-tap tent, added onto the next level up with blending.
precision highp float;
precision highp sampler2D;

uniform sampler2D uSrc;
uniform vec2 uTexel;     // 1 / source size
uniform float uWeight;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 d = uTexel;
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += (texture(uSrc, vUv + vec2(d.x, 0.0)).rgb + texture(uSrc, vUv - vec2(d.x, 0.0)).rgb
    + texture(uSrc, vUv + vec2(0.0, d.y)).rgb + texture(uSrc, vUv - vec2(0.0, d.y)).rgb) * 2.0;
  c += texture(uSrc, vUv + d).rgb + texture(uSrc, vUv - d).rgb
    + texture(uSrc, vUv + vec2(d.x, -d.y)).rgb + texture(uSrc, vUv + vec2(-d.x, d.y)).rgb;
  outColor = vec4(c / 16.0 * uWeight, 1.0);
}
