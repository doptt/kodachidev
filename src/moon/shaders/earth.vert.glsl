// The Earth and its shell of air: a sphere seen from so far away that the
// camera's own position does not matter, only which way it is looking.
varying vec2 vUv;
varying vec3 vNormal; // world space
varying vec3 vView;   // world space, from the surface toward the camera

void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
