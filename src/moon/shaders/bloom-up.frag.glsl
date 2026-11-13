// Bloom, on the way back up: each level is blurred with a small tent and added
// to the sharper one above it.
precision highp float;

uniform sampler2D uSource; // the smaller, blurrier level
uniform sampler2D uBase;   // this level, from the way down
uniform vec2 uTexel;       // one texel of the source
uniform float uSpread;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 d = uTexel * uSpread;
  vec3 blur = texture(uSource, vUv).rgb * 4.0;
  blur += (texture(uSource, vUv + vec2(d.x, 0.0)).rgb + texture(uSource, vUv - vec2(d.x, 0.0)).rgb + texture(uSource, vUv + vec2(0.0, d.y)).rgb + texture(uSource, vUv - vec2(0.0, d.y)).rgb) * 2.0;
  blur += texture(uSource, vUv + d).rgb + texture(uSource, vUv - d).rgb + texture(uSource, vUv + vec2(d.x, -d.y)).rgb + texture(uSource, vUv + vec2(-d.x, d.y)).rgb;
  outColor = vec4(texture(uBase, vUv).rgb + blur / 16.0, 1.0);
}
