// How lunar dust reflects. Shared by the ground and the rocks.
//
// Dust is not a matte surface. Seen with the sun behind you it has no limb
// darkening at all (the full Moon is a flat disc), it is far brighter looking
// back down the sunlight than across it, and in the last few degrees toward
// the sun's own direction the shadows between grains disappear and it surges.
// This is the usual short form of that:
//
//   shape   Lommel-Seeliger, mu0 / (mu0 + mu), at small phase angles, sliding
//           toward Lambert as the phase angle opens (McEwen's lunar-Lambert)
//   phase   a backscattering lobe, times a Hapke-style opposition surge
//           B0 / (1 + tan(g / 2) / h)
//
// `irradiance` is the light's colour times its intensity, in the units
// three.js uses for a DirectionalLight, so that the ground and the standard
// materials standing on it are lit alike.

const float OPPOSITION = 0.9;        // B0: how much brighter at exact opposition
const float OPPOSITION_WIDTH = 0.055; // h: how narrow the surge is

vec3 regolith(vec3 albedo, vec3 n, vec3 l, vec3 v, vec3 irradiance) {
  float mu0 = dot(n, l);
  if (mu0 <= 0.0) return vec3(0.0);
  float mu = max(dot(n, v), 0.02);
  float g = acos(clamp(dot(l, v), -1.0, 1.0));
  // Held short of its limit at the very limb, where one pixel spans the whole run-up to it
  float seeliger = min(2.0 * mu0 / (mu0 + mu), 1.6);
  float shape = mix(mu0, seeliger, mix(1.0, 0.3, smoothstep(0.0, 2.2, g)));
  float surge = OPPOSITION / (1.0 + tan(g * 0.5) / OPPOSITION_WIDTH);
  float phase = (0.5 + 0.5 * exp(-g * 1.15)) * (1.0 + surge);
  return albedo * irradiance * (RECIPROCAL_PI * shape * phase);
}
