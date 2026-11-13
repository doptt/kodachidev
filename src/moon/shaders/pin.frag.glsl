// A pin lights itself. Its head is a bead: brighter than white in the middle
// (the bloom takes it from there) and deep amber at the rim, so that it has an
// edge and can be told from sunlit ground as well as from the dark. Its stem
// runs from amber at the foot to the head's own light at the top.
uniform vec3 uLight;    // the pins' colour
uniform float uGain;    // how bright the middle of the head is
uniform float uOpacity;
uniform float uBead;    // 1 for the head, 0 for the stem

varying vec3 vNormal;
varying float vAlong;

void main() {
  vec3 amber = uLight * vec3(0.42, 0.24, 0.1);
  float facing = abs(normalize(vNormal).z);
  vec3 bead = mix(amber * 0.55, uLight * uGain, smoothstep(0.3, 0.85, facing));
  vec3 stem = mix(amber * 0.4, uLight * (0.2 + 0.22 * uGain), vAlong * vAlong);
  gl_FragColor = vec4(mix(stem, bead, uBead), uOpacity);
}
