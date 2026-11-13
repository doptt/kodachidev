// The stones lying about on the moon: one faceted shape, drawn many times.
#include <common>
#include <shadowmap_pars_vertex>

attribute float aTone; // each stone's own shade of grey

varying vec3 vNormal; // world space
varying vec3 vWorld;
varying float vTone;

void main() {
  mat4 placed = modelMatrix * instanceMatrix;
  vec3 objectNormal = normalize(mat3(instanceMatrix) * normal);
  vNormal = normalize(mat3(modelMatrix) * objectNormal);
  vTone = aTone;

  vec3 transformedNormal = normalMatrix * objectNormal;
  vec4 worldPosition = placed * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;

  #include <shadowmap_vertex>
}
