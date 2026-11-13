// A stone is the same stuff as the ground it lies on, a little darker for
// being solid, and lit the same way.
#include <common>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

uniform vec3 uSun;       // direction to the sun, world space
uniform vec3 uSunLight;
uniform vec3 uFill;
uniform vec3 uFillLight;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vTone;

#pragma regolith

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 albedo = vec3(0.3, 0.295, 0.285) * vTone;
  vec3 color = regolith(albedo, n, uSun, v, uSunLight) * getShadowMask();
  color += albedo * uFillLight * (RECIPROCAL_PI * max((dot(n, uFill) + 0.3) / 1.3, 0.0) * 1.5);
  // Light off the sunlit ground it sits on, on the faces that look down at it
  color += albedo * uSunLight * (0.03 * smoothstep(-0.15, 0.35, dot(normalize(vWorld), uSun)));
  gl_FragColor = vec4(color, 1.0);
}
