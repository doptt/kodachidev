// The Earth: NASA's Blue Marble by day, a cloud layer that drifts over it, a
// glint of sun off the oceans, and air that scatters blue toward the limb.
// The night side is left almost black: at this size its city lights would be
// a few pixels of noise.
uniform sampler2D uMap; // rgb: the surface; a: the clouds
uniform vec3 uSun;      // direction to the sun, world space
uniform float uClouds;  // how far the cloud layer has drifted, in turns

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  // The map's first row is the north pole; the sphere's v runs the other way
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 ground = texture2D(uMap, uv).rgb;
  float cloud = texture2D(uMap, uv + vec2(uClouds, 0.0)).a;
  cloud = smoothstep(0.08, 0.85, cloud);

  float sun = dot(n, uSun);
  // Day into night over a band about as wide as the air is deep at this scale
  float day = smoothstep(-0.1, 0.22, sun);
  float rim = 1.0 - max(dot(n, v), 0.0);

  // Water is the part of the map that is bluer than it is anything else
  float water = smoothstep(0.02, 0.1, ground.b - max(ground.r, ground.g) * 0.92);
  vec3 h = normalize(uSun + v);
  float glint = pow(max(dot(n, h), 0.0), 90.0) * water * (1.0 - cloud);

  vec3 surface = ground * 1.15 + vec3(1.0, 0.96, 0.9) * glint * 1.6;
  surface = mix(surface, vec3(1.02, 1.03, 1.05), cloud * 0.92);
  vec3 color = surface * (max(sun, 0.0) * 0.82 + 0.18) * day;

  // Rayleigh, roughly: more air to look through toward the limb, and it is blue
  vec3 air = vec3(0.26, 0.5, 1.0);
  color = mix(color, air * day * 1.25, pow(rim, 2.6) * 0.75);
  color += air * pow(rim, 5.0) * day * 0.5;

  gl_FragColor = vec4(color * 1.7, 1.0);
}
