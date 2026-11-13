// The moon's ground: a plain ball. Its relief is all in how it is lit.
#include <common>
#include <shadowmap_pars_vertex>

uniform float uRadius;

varying vec2 vUv;
varying vec3 vLocal; // position in the moon's own frame (the frame of NASA's maps)

void main() {
  vUv = uv;
  vec3 dir = normalize(position);
  vLocal = dir * uRadius;

  // The ball's own normal: what the shadow map's bias is taken along
  vec3 transformedNormal = normalMatrix * dir;
  vec4 worldPosition = modelMatrix * vec4(vLocal, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;

  #include <shadowmap_vertex>
}
