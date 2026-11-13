// The moon's ground, in three layers. NASA's colour map and the slopes of its
// elevation model give the broad lie of the land. Over the cap round the chair
// goes a picture made for this scene (assets-src/scripts/moon.py): craters,
// boot prints and half-sunk stones, with the shadows the low sun throws across
// them baked in. Over everything, a tiling grain. All of it is lit as dust,
// under the scene's shadow map, a faint fill, and the pins' pulse rings.
//
// Everything is worked out in the moon's own frame (the frame of the maps), so
// the lights and the eye are handed in already turned into it.
#include <common>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

#define MAX_PINS 8

uniform sampler2D uColor;
uniform sampler2D uNormal;
uniform sampler2D uDetail;
uniform sampler2D uSite;   // r: in the sun (1) or in baked shadow (0); g: lighter or darker dust; b, a: normal
uniform vec3 uSiteUp;      // the chair's spot, and the two axes the site picture is laid out on
uniform vec3 uSiteU;
uniform vec3 uSiteV;
uniform float uSiteReach;  // how far round from the chair the picture reaches, radians
uniform vec4 uTile;        // how many times the grain repeats round the moon and from pole to pole: fine (xy) and coarse (zw)
uniform vec3 uSun;       // direction to the sun
uniform vec3 uSunLight;  // its colour times intensity
uniform vec3 uFill;      // direction the earthshine comes from
uniform vec3 uFillLight;
uniform vec3 uEye;       // the camera
uniform float uRadius;
uniform float uAlbedo;   // gain on the colour map
uniform float uBaked;    // strength of the baked normals
uniform float uTime;
uniform vec4 uPins[MAX_PINS]; // xyz: where each pin stands (unit); w: how strongly its ring shows
uniform vec3 uPinLight;

varying vec2 vUv;
varying vec3 vLocal;

#pragma regolith

// One pin's light on the ground: a steady small disc at its foot, and a ring that widens and fades
float pinGlow(vec3 dir, vec4 pin, float offset) {
  if (pin.w <= 0.0) return 0.0;
  float d = acos(clamp(dot(dir, pin.xyz), -1.0, 1.0)) * uRadius;
  if (d > 0.4) return 0.0;
  float t = fract(uTime * 0.3 + offset);
  float radius = mix(0.03, 0.3, t);
  float width = 0.004 + 0.008 * t;
  float ring = smoothstep(width, 0.0, abs(d - radius)) * (1.0 - t) * (1.0 - t);
  float foot = smoothstep(0.05, 0.0, d);
  return pin.w * (ring * 0.9 + foot * foot * 0.55);
}

void main() {
  vec3 up = normalize(vLocal);
  // East and north on the map are the tangent frame the normals were baked in
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), up));
  vec3 north = cross(up, east);
  vec3 v = normalize(uEye - vLocal);

  vec3 baked = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
  vec3 n = normalize(east * (baked.x * uBaked) + north * (baked.y * uBaked) + up * max(baked.z, 0.2));

  // The site picture: a flat map of the cap round the chair, true to distance from it
  float away = acos(clamp(dot(up, uSiteUp), -1.0, 1.0));
  vec2 spread = vec2(dot(up, uSiteU), dot(up, uSiteV)) / max(sin(away), 1e-4) * (away / uSiteReach);
  float here = 1.0 - smoothstep(0.82, 0.98, away / uSiteReach);
  vec4 site = texture2D(uSite, spread * 0.5 + 0.5);
  // Its slopes are the ground's own: they turn the normal that is lit
  vec3 alongU = normalize(uSiteU - up * dot(up, uSiteU));
  vec3 alongV = normalize(uSiteV - up * dot(up, uSiteV));
  n = normalize(n + (alongU * (site.b * 2.0 - 1.0) + alongV * (site.a * 2.0 - 1.0)) * (here * 1.6));

  // The grain, at two sizes. It tiles on the map's own grid, which bunches up toward the map's poles, so it is let go there.
  // It is not lit as a surface in its own right: with no shadows cast between grains, a low sun would turn every
  // slope that faces away into a black hole. It brightens and darkens the ground it lies on instead, by how much
  // more or less of the sun it catches.
  float open = smoothstep(0.12, 0.5, length(up.xz));
  vec3 fine = texture2D(uDetail, vUv * uTile.xy).xyz;
  vec3 coarse = texture2D(uDetail, vUv * uTile.zw + vec2(0.37, 0.61)).xyz;
  vec2 lean = ((fine.xy * 2.0 - 1.0) * 1.5 + (coarse.xy * 2.0 - 1.0) * 0.6) * open;
  vec3 leaned = normalize(n + east * lean.x + north * lean.y);
  float facing = dot(n, uSun);
  float relief = clamp(1.0 + (dot(leaned, uSun) - facing) / (max(facing, 0.0) + 0.28), 0.12, 2.2);

  vec3 albedo = texture2D(uColor, vUv).rgb;
  // The mosaic is a little brown and a little flat: real dust under a hard sun reads nearly neutral, the seas well darker than the highlands
  albedo = mix(vec3(dot(albedo, vec3(0.2126, 0.7152, 0.0722))), albedo, 0.6);
  albedo = pow(albedo, vec3(1.25)) * uAlbedo;
  albedo *= mix(1.0, 0.62 + 0.76 * fine.z, open) * mix(1.0, 0.78 + 0.44 * coarse.z, 0.7 * open) * mix(1.0, 0.55 + 0.9 * site.g, here);

  // In shadow: of the alien, his chair and the loose stones (the shadow map), or of the ground's own relief (baked)
  float shadow = getShadowMask() * mix(1.0, site.r, here);
  vec3 color = regolith(albedo, n, uSun, v, uSunLight) * (relief * shadow);

  // Earthshine: wrapped a little way past its own horizon, the way a big soft source reaches
  float wrap = max((dot(leaned, uFill) + 0.3) / 1.3, 0.0);
  color += albedo * uFillLight * (RECIPROCAL_PI * wrap * 1.5);
  // Sunlight thrown back up by the lit ground all around: what keeps a shadow from being a hole
  float lit = smoothstep(-0.15, 0.35, dot(up, uSun));
  color += albedo * uSunLight * (0.012 * lit);

  // The pins' rings: light added on dark ground, and a wash of their colour over bright ground, where added light would not show
  float glow = 0.0;
  for (int i = 0; i < MAX_PINS; i++) glow += pinGlow(up, uPins[i], float(i) * 0.37);
  color = mix(color, uPinLight * 0.42, clamp(glow, 0.0, 1.0) * 0.8) + uPinLight * glow * 0.6;

  gl_FragColor = vec4(color, 1.0);
}
