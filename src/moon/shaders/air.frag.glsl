// The thin line of air standing off the Earth's limb: a shell a little larger
// than the planet, drawn from the inside so that only the part beyond the limb
// shows. Brightest against the planet, gone at the shell's own edge, and only
// on the side the sun is on.
uniform vec3 uSun;
uniform float uEdge; // cosine, on the shell, of the angle at which the planet's limb is seen

varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec3 n = normalize(vNormal);
  // The shell's far side faces away from the camera: 0 at its edge, uEdge where the planet's limb cuts it off
  float inward = max(dot(-n, normalize(vView)), 0.0);
  float depth = clamp(inward / uEdge, 0.0, 1.0);
  float day = smoothstep(-0.25, 0.35, dot(n, uSun));
  vec3 air = mix(vec3(0.2, 0.42, 1.0), vec3(0.45, 0.68, 1.0), depth);
  gl_FragColor = vec4(air * (pow(depth, 2.4) * day * 1.1), 0.0);
}
