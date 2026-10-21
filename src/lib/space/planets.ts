import { program, uniforms } from './gl'

// The planets in the Work section. Every planet is drawn analytically in one
// fragment shader: each pixel works out where it lands on each sphere, looks
// up a noise surface there and lights it. There is no mesh and no texture,
// so a planet stays sharp however close the camera gets. The noise adds
// octaves as a planet takes up more pixels, so zooming in keeps finding
// finer detail instead of blur.
//
// Layout and animation all happen in JS. The shader only gets told, per
// planet, where its centre is, how big it is and how it looks.

export const MAX_PLANETS = 6

export type PlanetLook = {
  /**
   * dust: a desert world, wind-blown streaks, canyons, craters and clouds.
   * cracked: a dark rocky world split into plates by a web of veins.
   */
  kind: 'dust' | 'cracked'
  /** dark, middle and light surface colours, as hex */
  colors: [string, string, string]
  /** the haze on the limb and the glow around the edge */
  air: string
  /** how thick the air is, 0 to 1. Thick air also tints the night side */
  haze?: number
  /** direction to the sun, x right, y up, z towards the viewer */
  sun?: [number, number, number]
  /** a sun glare on the limb, 0 to 1 */
  flare?: number
  /** rings, as inner and outer radius in planet radii */
  ring?: [number, number]
  /** the ring colour, defaults to the light surface colour */
  ringColor?: string
  /** how many rocks tumble through the rings, 0 to 1 */
  rocks?: number
  /** lean of the spin axis, in radians */
  tilt?: number
  /** any number, shuffles the noise so two planets of a kind differ */
  seed?: number
}

/** Where a planet is on screen this frame, in CSS pixels */
export type PlanetPlace = {
  x: number
  y: number
  r: number
  opacity: number
  spin: number
}

const VERTEX = /* glsl */ `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define MAX ${MAX_PLANETS}

uniform int uCount;
uniform float uTime;
uniform vec4 uGeo[MAX];   // centre x, y in device pixels, radius, opacity
uniform vec4 uLook[MAX];  // kind, seed, spin, tilt
uniform vec4 uRing[MAX];  // inner and outer radius (0 for none), rocks, unused
uniform vec4 uAtmo[MAX];  // haze, flare, unused, unused
uniform vec3 uSun[MAX];
uniform vec3 uDeep[MAX];
uniform vec3 uMid[MAX];
uniform vec3 uLight[MAX];
uniform vec3 uAir[MAX];
uniform vec3 uRingCol[MAX];

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

// Octaves are added up to a cutoff that the caller works out from the size
// on screen, so a small planet stays cheap and a zoomed one keeps gaining
// detail. The last octave fades in so nothing pops while the size changes.
float fbm(vec3 p, float oct) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    v += amp * w * noise(p);
    p = p * 2.02 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return v;
}

// 1 along the middle of the range, 0 at both ends. Makes thin lines out of
// noise where it crosses the middle.
float ridge(float v) {
  return 1.0 - abs(v * 2.0 - 1.0);
}

// A thin line where the noise crosses its middle, from the cut upwards
float line(float v, float cut) {
  return smoothstep(cut, 1.0, ridge(v));
}

vec3 spinY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 spinZ(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

// Craters: at most one per grid cell, each at a random spot with a random
// size, kept inside its cell so nothing has to look next door. The bowl is
// shaded by hand: the wall on the sun side faces away from it.
float craters(vec3 p, float seed, vec3 sun) {
  vec3 i = floor(p);
  vec3 f = p - i;
  float h = hash(i + seed);
  if (h > 0.22) return 0.0;
  float rad = 0.1 + 0.18 * hash(i + seed + 5.0);
  vec3 c = vec3(hash(i + seed + 1.0), hash(i + seed + 2.0), hash(i + seed + 3.0)) * (1.0 - 2.0 * rad) + rad;
  vec3 o = (f - c) / rad;
  float d = length(o);
  if (d > 1.2) return 0.0;
  float facing = -dot(normalize(o), sun);
  float bowl = (1.0 - smoothstep(0.75, 0.95, d)) * (0.35 * facing - 0.25);
  float rim = smoothstep(0.7, 0.95, d) * (1.0 - smoothstep(1.0, 1.2, d)) * (0.25 - 0.3 * facing);
  return bowl + rim;
}

// Cells for the cracked plates: the nearest and second nearest of one
// jittered point per cell, searching the 2x2x2 block around the sample.
// The points stay near their cell centres so that block nearly always
// holds both, and a miss only nudges a crack.
void cells(vec3 p, float seed, out float edge, out float id, out vec3 toward) {
  vec3 b = floor(p - 0.5);
  float f1 = 9.0;
  float f2 = 9.0;
  id = 0.0;
  toward = vec3(0.0, 0.0, 1.0);
  for (int x = 0; x < 2; x++) {
    for (int y = 0; y < 2; y++) {
      for (int z = 0; z < 2; z++) {
        vec3 c = b + vec3(float(x), float(y), float(z));
        vec3 pt = c + 0.5 + (vec3(hash(c + seed), hash(c + seed + 1.0), hash(c + seed + 2.0)) - 0.5) * 0.7;
        vec3 o = pt - p;
        float d = length(o);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = hash(c + seed + 3.0);
          toward = o;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  edge = f2 - f1;
}

// One layer of veins: a hairline along each cell edge with a soft lip
// beside it, lit on the side that faces the sun and shaded on the other.
// Lines never go thinner than about a pixel and a half, they fade out
// instead, so nothing shimmers when the planet is small.
float veins(vec3 w, float k, float seed, vec3 sun, float px, out float relief, out float id) {
  float edge;
  vec3 toward;
  cells(w * k, seed, edge, id, toward);
  float wd = max(0.025, px * k * 1.3);
  float crack = 1.0 - smoothstep(0.0, wd, edge);
  float lip = (1.0 - smoothstep(wd, wd * 4.5, edge)) * (1.0 - crack);
  float fade = clamp(0.1 / (px * k), 0.0, 1.0);
  // the lip slopes down into the crack, so it faces away from its own cell
  relief = -lip * dot(normalize(toward), sun) * fade;
  return crack * fade;
}

// A soft pink desert. The dust lies in streaks: noise squashed across a
// slow flow and stretched along it, at a few sizes, so it comes out
// feathered and fans wherever the flow bends. Canyons are cell edges like
// the cracked world's veins, but only some of them, wider, with dusty
// floors and a lit and a shaded wall. Craters at three sizes, and one or
// two long cloud streaks that follow a contour of their own smooth field,
// made of strands along their length so the edges feather out.
vec3 dust(vec3 s, float seed, float oct, vec3 sun, float px, vec3 deep, vec3 mid, vec3 light, out float cloud) {
  vec3 p = s * 1.6 + seed;
  vec3 q = vec3(fbm(p * 0.9, 3.0), fbm(p * 0.9 + 4.3, 3.0), fbm(p * 0.9 + 9.1, 3.0)) - 0.5;
  vec3 w = p + q * 0.9;

  // soft airbrushed ground, then the streaks over it
  float ground = fbm(w * 1.1 + 2.0, oct - 2.0);
  vec3 along = w * vec3(1.2, 12.0, 1.2) + q * 3.0;
  float streak = fbm(along, oct - 1.0);
  float fine = ridge(fbm(along * 2.3 + 3.0, oct));
  float hairW = clamp((oct - 5.3) * 0.8, 0.0, 1.0);
  float hairA = hairW > 0.0 ? ridge(fbm(along * 6.0 + 8.0, oct)) : 0.0;
  float hairB = hairW > 0.0 ? ridge(fbm(along * 6.0 + 19.0, oct)) : 0.0;

  // dusty rose in the low ground, rose on the slopes, peach where it rises
  float tone = ground + (streak - 0.5) * 0.45;
  vec3 col = mix(deep, mid, smoothstep(0.2, 0.55, tone));
  col = mix(col, light, smoothstep(0.52, 0.82, tone) * 0.9);
  col *= 0.88 + 0.24 * streak;
  col = mix(col, light, pow(fine, 4.0) * 0.3);
  // up close the streaks split into dark and pale hairlines
  col *= 1.0 - pow(hairA, 4.0) * 0.2 * hairW;
  col = mix(col, light, pow(hairB, 8.0) * 0.25 * hairW);

  // canyons
  float edge;
  float cid;
  vec3 toward;
  cells(w * 3.0, seed + 31.0, edge, cid, toward);
  float open = smoothstep(0.5, 0.68, fbm(w * 0.8 + 17.0, 3.0));
  float wd = 0.05 + 0.06 * cid;
  float floor = (1.0 - smoothstep(0.0, wd, edge)) * open;
  float wall = (1.0 - smoothstep(wd, wd * 2.6, edge)) * (1.0 - floor) * open;
  float slope = -dot(normalize(toward), sun);
  col = mix(col, deep * (0.55 + 0.3 * streak), floor * 0.85);
  col *= 1.0 + wall * slope * 0.3 - wall * 0.08;

  // craters at three sizes, as a lit and shadowed bump on the colour
  float crater = craters(w * 4.0, seed, sun) + craters(w * 10.0 + 3.0, seed + 2.0, sun) * 0.7;
  crater += craters(w * 24.0 + 5.0, seed + 4.0, sun) * 0.5 * hairW;
  col *= 1.0 + crater * 1.5;

  // clouds
  vec3 c = spinY(w, uTime * 0.01);
  float sky = fbm(c * vec3(0.8, 2.0, 0.8) + 21.0, 2.0);
  float where = smoothstep(0.3, 0.46, fbm(c * 0.8 + 31.0, 2.0));
  float body = 1.0 - smoothstep(0.0, 0.09, abs(sky - 0.5));
  float strand = fbm(vec3(sky * 70.0, fbm(c * 1.5 + 41.0, 2.0) * 8.0, seed + 2.0), 3.0);
  float thr = mix(0.8, 0.24, body);
  cloud = pow(where * smoothstep(thr, thr + 0.2, strand + (fine - 0.5) * 0.15), 0.8);
  return col;
}

// A cracked rocky world: plates of bronze, amber and pale gold, each a
// slightly different tone, crazed by a web of fine veins at three sizes.
// The widest ones glow faintly, so the night side is not blank.
vec3 cracked(vec3 s, float seed, float oct, vec3 sun, float px, vec3 deep, vec3 mid, vec3 light, out float vein, out float ember) {
  vec3 p = s * 2.4 + seed;
  vec2 q = vec2(fbm(p * 0.7, oct - 2.0), fbm(p * 0.7 + 3.7, oct - 2.0)) - 0.5;
  vec3 w = p + q.xyx * 0.5;

  float plates = fbm(w * 1.1, oct - 1.0);
  float grain = fbm(w * 6.0 + 4.0, oct);

  float r1, r2, r3, id1, id2, id3;
  float c1 = veins(w, 5.0, seed, sun, px, r1, id1);
  float c2 = veins(w + 0.3, 13.0, seed + 7.0, sun, px, r2, id2);
  float c3 = veins(w + 0.7, 34.0, seed + 9.0, sun, px, r3, id3);
  vein = clamp(c1 + c2 * 0.7 + c3 * 0.45, 0.0, 1.0);
  float relief = r1 * 0.12 + r2 * 0.08 + r3 * 0.05;

  // every plate its own tone, only a little apart from its neighbours
  float tone = id1 * 0.5 + id2 * 0.5;
  vec3 col = mix(deep, mid, 0.4 + 0.55 * smoothstep(0.3, 0.7, plates));
  col = mix(col, light, smoothstep(0.45, 0.85, plates + (tone - 0.5) * 0.15) * 0.75);
  col = mix(col, light * vec3(1.0, 0.97, 0.9), tone * 0.12);
  col *= 0.88 + 0.24 * grain;
  col *= 1.0 + relief;
  col = mix(col, deep * 0.6, vein * 0.45);

  ember = c1 * smoothstep(0.5, 0.68, fbm(w * 0.6 + 14.0, oct - 3.0));
  return col;
}

// Ring density at a distance from the centre: a few broad bands, a couple
// of gaps and a great many fine grooves. The grooves are only added while
// they are wider than a pixel or two, px is how wide a pixel is in radii.
float ringAt(float d, vec4 ring, float seed, float px) {
  if (ring.y <= 0.0) return 0.0;
  float t = (d - ring.x) / (ring.y - ring.x);
  if (t < 0.0 || t > 1.0) return 0.0;
  float width = (ring.y - ring.x) / px;
  float broad = fbm(vec3(t * 5.0, seed, 2.0), 4.0);
  float g1 = noise(vec3(t * 48.0, seed + 3.0, 0.0));
  float g2 = noise(vec3(t * 150.0, seed + 5.0, 0.0)) * clamp(width / 450.0, 0.0, 1.0);
  float g3 = noise(vec3(t * 420.0, seed + 7.0, 0.0)) * clamp(width / 1300.0, 0.0, 1.0);
  float grooves = 0.5 + 0.5 * sin(t * 90.0 + g1 * 7.0);
  grooves *= 0.7 + 0.3 * sin(t * 300.0 + g2 * 9.0) * clamp(width / 900.0, 0.0, 1.0);
  float gaps = smoothstep(0.015, 0.045, abs(t - 0.55)) * smoothstep(0.01, 0.03, abs(t - 0.26)) * (1.0 - 0.6 * smoothstep(0.02, 0.0, abs(t - 0.79)));
  float edges = smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.82, t);
  float dens = (0.5 + 0.6 * broad) * mix(0.7, 1.0, g1) * mix(0.8, 1.0, g2 + 0.5 * g3) * (0.75 + 0.35 * grooves);
  return clamp(dens * 1.35, 0.0, 1.0) * gaps * edges;
}

// Rocks in the ring plane: at most one per grid cell, kept inside its cell.
// Returns how much of the pixel it covers and which way its lit side faces.
vec2 rocks(vec2 x, float seed, float fill, vec2 sun, float px) {
  vec2 i = floor(x);
  vec2 f = x - i;
  float h = hash(vec3(i, seed));
  if (h > fill) return vec2(0.0);
  float rad = 0.07 + 0.2 * hash(vec3(i, seed + 1.0)) * hash(vec3(i, seed + 4.0));
  vec2 c = vec2(hash(vec3(i, seed + 2.0)), hash(vec3(i, seed + 3.0))) * (1.0 - 2.0 * rad) + rad;
  vec2 o = f - c;
  // a bit lumpy rather than round
  float d = length(o) / rad * (0.85 + 0.3 * hash(vec3(i, seed + 6.0) + floor(atan(o.y, o.x) * 1.6)));
  float cover = 1.0 - smoothstep(1.0 - px / rad, 1.0 + px / rad, d);
  return vec2(cover, dot(normalize(o + 0.0001), sun));
}

void main() {
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    vec4 geo = uGeo[i];
    vec4 look = uLook[i];
    vec4 ring = uRing[i];
    vec4 atmo = uAtmo[i];
    if (geo.w <= 0.0 || geo.z <= 0.5) continue;

    vec2 p = (gl_FragCoord.xy - geo.xy) / geo.z;
    float d = length(p);
    float reach = max(1.7, ring.y + 0.1);
    if (d > reach) continue;

    float px = 1.0 / geo.z;
    float aa = 1.5 * px;
    float seed = look.y;
    float tilt = look.w;
    vec3 sun = normalize(uSun[i]);
    vec3 air = uAir[i];
    float haze = atmo.x;
    // how many noise octaves this size on screen can show
    float oct = clamp(log2(geo.z / 5.0), 3.0, 8.0);

    // The rings lie in the equator, so they lean with the spin axis. The
    // view is from slightly above, which is the extra lean towards us.
    vec3 axis = spinZ(normalize(vec3(0.0, 1.0, 0.32)), tilt);

    // Planet: lit surface inside the disc, a glow of air around it
    vec3 body = vec3(0.0);
    float cover = 0.0;
    float z = 0.0;
    if (d < 1.0 + aa) {
      z = sqrt(max(0.0, 1.0 - d * d));
      vec3 n = vec3(p, z);
      // into the planet's own frame, where y is the spin axis
      vec3 s = spinY(spinZ(n, -tilt), look.z);
      vec3 sunLocal = spinY(spinZ(sun, -tilt), look.z);
      // the limb is foreshortened, so it can take fewer octaves
      float o = oct + log2(max(z, 0.08)) * 0.6;

      float ndl = dot(n, sun);
      float day = smoothstep(-0.25, 0.3, ndl);
      float shine = 0.3 + 0.7 * max(ndl, 0.0);

      float cloud = 0.0;
      float vein = 0.0;
      float ember = 0.0;
      vec3 surf = look.x < 0.5
        ? dust(s, seed, o, sunLocal, px, uDeep[i], uMid[i], uLight[i], cloud)
        : cracked(s, seed, o, sunLocal, px, uDeep[i], uMid[i], uLight[i], vein, ember);

      vec3 lit = surf * (0.03 + 1.9 * day * shine);

      // clouds: white in the sun, going blue-grey where the light leaves
      vec3 cloudCol = mix(air * 0.5, vec3(1.0, 0.98, 0.96), smoothstep(-0.05, 0.5, ndl));
      lit = mix(lit, cloudCol * (0.03 + 1.5 * day * shine), cloud * 0.9);

      // the cracks glow a little, mostly seen on the night side
      lit += vec3(1.0, 0.36, 0.08) * ember * (0.9 - 0.7 * day);

      // shadow of the rings on the planet
      float facing = dot(sun, axis);
      if (abs(facing) > 0.001) {
        float t = -dot(n, axis) / facing;
        if (t > 0.0) lit *= 1.0 - 0.55 * ringAt(length(n + sun * t), ring, seed, px);
      }

      // air: a haze that thickens towards the limb and catches the sun
      // there, plus a little scattered light on the night side
      float limbLit = smoothstep(-0.5, 0.5, ndl);
      vec3 limbCol = air * (0.12 + 1.3 * limbLit);
      // thick air wraps the whole limb, and more of it on the night side
      // where it is all there is to see
      float rim = pow(1.0 - z, mix(1.4, 2.4, day));
      lit = mix(lit, limbCol, rim * haze * 0.85);
      lit += air * (0.07 + 0.3 * pow(1.0 - z, 0.8)) * haze * haze * (1.0 - day);
      // every planet gets a glow towards the lit edge and a bright line on
      // it, sharper and whiter where the air is thin
      lit += limbCol * pow(1.0 - z, 3.0) * limbLit * 0.5;
      lit += mix(air, vec3(1.0), 0.6) * pow(1.0 - z, 7.0 - 3.0 * haze) * limbLit * limbLit * (1.6 - 0.8 * haze);

      body = lit;
      cover = smoothstep(1.0, 1.0 - aa, d);
    }

    float glowSide = smoothstep(-0.6, 0.9, dot(normalize(vec3(p, 0.001)), sun));
    float glow = exp(-max(d - 1.0, 0.0) * (14.0 - 7.0 * haze)) * (0.1 + 0.9 * glowSide) * (1.0 - cover) * (0.3 + haze);
    if (d < 1.0) glow = 0.0;

    // Rings: where this pixel's view line crosses the ring plane, lit by
    // the sun, with the planet throwing its shadow across them and rocks
    // scattered through the inner part
    vec3 ringCol = vec3(0.0);
    float ringA = 0.0;
    bool ringFront = true;
    if (ring.y > 0.0) {
      float rz = -(p.x * axis.x + p.y * axis.y) / axis.z;
      vec3 q = vec3(p, rz);
      float r = length(q);
      float t = (r - ring.x) / (ring.y - ring.x);
      if (t > -0.35 && t < 1.0) {
        float dens = ringAt(r, ring, seed, px);

        // the sun side of the ring is lit, the far side sits in the shadow
        float along = dot(q, sun);
        float shade = along < 0.0 ? smoothstep(0.92, 1.1, length(q - sun * along)) : 1.0;
        // light scattering forward through the dust, strongest towards the sun
        float toSun = dot(normalize(q), sun);
        float lamp = 0.9 + 0.6 * abs(dot(sun, axis)) + 1.5 * pow(max(toSun, 0.0), 3.0);
        vec3 tint = mix(uRingCol[i] * 0.55, mix(uRingCol[i], vec3(1.0, 0.95, 0.85), 0.3) * 1.25, dens);
        // a pale sheen where the light comes through towards the sun
        tint = mix(tint, vec3(1.0, 0.93, 0.78) * 1.3, pow(max(toSun, 0.0), 1.5) * 0.4 * dens);
        ringCol = tint * dens * lamp * (0.05 + 0.95 * shade);
        ringA = clamp(dens * 1.15, 0.0, 0.96);

        if (ring.z > 0.0) {
          vec3 e1 = normalize(vec3(axis.y, -axis.x, 0.0));
          vec3 e2 = cross(axis, e1);
          vec2 u = vec2(dot(q, e1), dot(q, e2));
          vec2 sun2 = normalize(vec2(dot(sun, e1), dot(sun, e2)));
          // thickest near the planet, thinning out across the rings
          float fill = ring.z * (0.15 + 0.85 * (1.0 - smoothstep(-0.05, 0.7, t))) * smoothstep(-0.35, -0.12, t);
          vec2 big = rocks(u * 7.0, seed + 20.0, fill * 0.7, sun2, px * 7.0);
          vec2 small = rocks(u * 24.0, seed + 40.0, fill * 0.9, sun2, px * 24.0);
          float rock = max(big.x, small.x);
          float face = big.x > small.x ? big.y : small.y;
          vec3 rockCol = mix(uDeep[i] * 0.12, uRingCol[i] * 0.4, smoothstep(-0.2, 1.0, face) * 0.8) * (0.1 + 0.9 * shade);
          ringCol = mix(ringCol, rockCol, rock);
          ringA = mix(ringA, 1.0, rock);
        }
        ringFront = rz > z || d > 1.0;
      }
    }

    // Composite back to front: rings behind, the planet, rings in front
    vec3 c = vec3(0.0);
    float a = 0.0;
    if (!ringFront) {
      c = ringCol;
      a = ringA;
    }
    c = body * cover + c * (1.0 - cover);
    a = cover + a * (1.0 - cover);
    c += air * glow * 0.7;
    a = max(a, glow * 0.5);
    if (ringFront) {
      c = ringCol + c * (1.0 - ringA);
      a = ringA + a * (1.0 - ringA);
    }

    // The sun peeking round the limb: a hot core just outside the edge,
    // a wide soft halo and a streak along the ring plane
    if (atmo.y > 0.0) {
      vec2 at = normalize(sun.xy) * 1.02;
      vec2 off = p - at;
      float dd = length(off);
      vec2 e1 = normalize(vec2(axis.y, -axis.x));
      float streak = exp(-abs(dot(off, vec2(-e1.y, e1.x))) * 28.0) * exp(-dd * 2.2);
      float core = exp(-dd * dd * 70.0) * 1.2 + exp(-dd * 4.0) * 0.55;
      float f = (core + streak * 0.6) * atmo.y;
      c += mix(uRingCol[i], vec3(1.0, 0.95, 0.85), clamp(f * 0.8, 0.0, 1.0)) * f;
      a = max(a, min(f, 1.0));
    }

    c *= geo.w;
    a *= geo.w;
    col = c + col * (1.0 - a);
    alpha = a + alpha * (1.0 - a);
  }

  // a little extra saturation, then a soft shoulder so the bright side
  // doesn't clip
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = max(mix(vec3(lum), col, 1.1), 0.0);
  col = col / (1.0 + col * 0.3);
  gl_FragColor = vec4(col, alpha);
}
`

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  // the shader works in linear light, roughly
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => c ** 2.2) as [
    number,
    number,
    number,
  ]
}

// The sun is up and to the left, a little in front, unless a look says otherwise
const DEFAULT_SUN: [number, number, number] = [-0.56, 0.46, 0.69]

export type PlanetScene = {
  resize(width: number, height: number, dpr: number): void
  /** `places` and `looks` are matched by index and drawn in that order, last on top */
  draw(places: PlanetPlace[], looks: PlanetLook[], time: number): void
  dispose(): void
}

/** Returns null without WebGL, so the caller can fall back to something flat */
export function createPlanetScene(canvas: HTMLCanvasElement): PlanetScene | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true })
  if (!gl) return null

  let prog: WebGLProgram
  try {
    prog = program(gl, VERTEX, FRAGMENT, ['aPos'])
  } catch {
    return null
  }
  const u = uniforms(gl, prog, [
    'uCount',
    'uTime',
    'uGeo',
    'uLook',
    'uRing',
    'uAtmo',
    'uSun',
    'uDeep',
    'uMid',
    'uLight',
    'uAir',
    'uRingCol',
  ] as const)

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  const geo = new Float32Array(MAX_PLANETS * 4)
  const look = new Float32Array(MAX_PLANETS * 4)
  const ring = new Float32Array(MAX_PLANETS * 4)
  const atmo = new Float32Array(MAX_PLANETS * 4)
  const sun = new Float32Array(MAX_PLANETS * 3)
  const deep = new Float32Array(MAX_PLANETS * 3)
  const mid = new Float32Array(MAX_PLANETS * 3)
  const light = new Float32Array(MAX_PLANETS * 3)
  const air = new Float32Array(MAX_PLANETS * 3)
  const ringCol = new Float32Array(MAX_PLANETS * 3)
  // hex parsing is cached per look so it doesn't run every frame
  const parsed = new WeakMap<PlanetLook, [number, number, number][]>()

  let height = 0
  let scale = 1

  return {
    resize(w, h, dpr) {
      height = h
      scale = dpr
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    },

    draw(places, looks, time) {
      const count = Math.min(places.length, MAX_PLANETS)
      for (let i = 0; i < count; i++) {
        const place = places[i]
        const l = looks[i]
        let colors = parsed.get(l)
        if (!colors) {
          colors = [...l.colors.map(rgb), rgb(l.air), rgb(l.ringColor ?? l.colors[2])]
          parsed.set(l, colors)
        }
        // GL counts y from the bottom
        geo.set([place.x * scale, (height - place.y) * scale, place.r * scale, place.opacity], i * 4)
        look.set([l.kind === 'dust' ? 0 : 1, l.seed ?? i * 7.3, place.spin, l.tilt ?? 0], i * 4)
        ring.set([...(l.ring ?? [0, 0]), l.rocks ?? 0, 0], i * 4)
        atmo.set([l.haze ?? 0.6, l.flare ?? 0, 0, 0], i * 4)
        sun.set(l.sun ?? DEFAULT_SUN, i * 3)
        deep.set(colors[0], i * 3)
        mid.set(colors[1], i * 3)
        light.set(colors[2], i * 3)
        air.set(colors[3], i * 3)
        ringCol.set(colors[4], i * 3)
      }

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(prog)
      gl.uniform1i(u.uCount, count)
      gl.uniform1f(u.uTime, time)
      gl.uniform4fv(u.uGeo, geo)
      gl.uniform4fv(u.uLook, look)
      gl.uniform4fv(u.uRing, ring)
      gl.uniform4fv(u.uAtmo, atmo)
      gl.uniform3fv(u.uSun, sun)
      gl.uniform3fv(u.uDeep, deep)
      gl.uniform3fv(u.uMid, mid)
      gl.uniform3fv(u.uLight, light)
      gl.uniform3fv(u.uAir, air)
      gl.uniform3fv(u.uRingCol, ringCol)
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },

    // Not losing the context on purpose: the canvas can be handed straight
    // back to a new scene, and a lost context would stay lost.
    dispose() {
      gl.deleteBuffer(quad)
      gl.deleteProgram(prog)
    },
  }
}
