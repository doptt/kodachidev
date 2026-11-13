// A pin's stem and head. The stem carries how far up it each point is; the
// head, which way each point of it faces.
uniform float uLength; // height of the stem

varying vec3 vNormal; // view space
varying float vAlong; // 0 at the foot of the stem, 1 at the top

void main() {
  vNormal = normalize(normalMatrix * normal);
  vAlong = position.y / uLength;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
