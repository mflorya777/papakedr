// GLSL bodies for the procedural materials. Each defines height(), albedo()
// and roughness() over uv in [0,1]^2; see bake.ts for the shared helpers
// (gnoise, fbm, worley, hash) and for how the maps are derived.

/**
 * Planed softwood board. The texture spans 2.4 m along the grain (u) and
 * 0.6 m across it (v) so one 4096x1024 bake gives ~1700 px per metre.
 * Growth rings are distorted by low-frequency noise (cathedral figure) and by
 * knots, which pull the rings into concentric contours around them.
 */
export const WOOD = /* glsl */ `
uniform vec3 uEarly;
uniform vec3 uLate;
uniform vec3 uKnot;
uniform float uRings;
uniform float uRough;
uniform float uBrushed;

struct Wood { float late; float fiber; float pore; float knot; float halo; float tone; };

Wood wood(vec2 uv) {
  Wood w;
  // Knots: at most one per cell of a 5x3 grid, ~40% of cells occupied.
  vec2 kc = vec2(5., 3.);
  vec2 ki = floor(uv * kc);
  float bump = 0.;
  w.knot = 0.;
  w.halo = 0.;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y);
    vec2 c = mod(ki + o, kc);
    float present = step(.6, hash21(c + 7.31));
    vec2 pos = (ki + o + .2 + .6 * hash22(c + 1.7)) / kc;
    vec2 d = (uv - pos) * uSize;
    float r = mix(.006, .016, hash21(c + 3.1));
    float dist = length(d * vec2(.42, 1.));
    bump += present * 2.4 * exp(-dist * dist / (r * r * 7.));
    w.knot = max(w.knot, present * smoothstep(r, r * .78, dist));
    w.halo = max(w.halo, present * exp(-dist * dist / (r * r * 3.)));
  }

  float warp = fbm(uv, vec2(3., 2.), 4) * 2.6 + gnoise(uv, vec2(14., 5.)) * .45;
  float rc = uv.y * uRings + warp + bump;
  float r = fract(rc);
  float edge = .66 + .08 * gnoise(uv, vec2(40., 6.));
  w.late = smoothstep(edge - .1, edge + .05, r) * (1. - smoothstep(.93, 1., r));

  w.fiber = gnoise(uv, vec2(48., 900.)) * .55 + gnoise(uv, vec2(112., 2048.)) * .45;
  w.pore = smoothstep(.5, .85, gnoise(uv, vec2(560., 2600.)));
  w.tone = fbm(uv, vec2(2., 1.), 3);
  return w;
}

float height(vec2 uv) {
  Wood w = wood(uv);
  // A brushed (weathered / charred) board loses soft earlywood, raising latewood.
  float relief = mix(.35, 1., uBrushed);
  return w.late * relief + w.fiber * .18 - w.pore * .35 + w.knot * .25 - w.halo * .1 * uBrushed;
}

vec3 albedo(vec2 uv) {
  Wood w = wood(uv);
  vec3 c = mix(uEarly, uLate, w.late * .9);
  c *= 1. + .13 * w.fiber + .2 * w.tone;
  c = mix(c, uLate, w.halo * .35);
  c = mix(c, uKnot * (.75 + .5 * w.late), w.knot * .92);
  c *= 1. - .35 * w.pore;
  return max(c, vec3(0.));
}

float roughness(vec2 uv) {
  Wood w = wood(uv);
  return uRough + .06 * w.fiber - .07 * w.late + .1 * w.pore - .12 * w.knot + .05 * w.tone;
}
`

/**
 * Bitumen shingle surfaced with mineral granules (~1.5 mm), 0.5 x 0.5 m.
 */
export const SHINGLE = /* glsl */ `
uniform vec3 uBase;

float height(vec2 uv) {
  vec4 w = worley(uv, vec2(330.), .95);
  float r = .00085 * (.75 + .5 * hash21(w.zw));
  float dome = sqrt(max(0., 1. - (w.x * w.x) / (r * r)));
  return dome * .85 + fbm(uv, vec2(10.), 3) * .15;
}

vec3 albedo(vec2 uv) {
  vec4 w = worley(uv, vec2(330.), .95);
  float r = .00085 * (.75 + .5 * hash21(w.zw));
  float t = hash21(w.zw + 5.3);
  vec3 g = uBase * mix(.55, 1.45, t);
  // Occasional light and dark granules, as in real blended colours.
  g = mix(g, vec3(.22, .22, .21), step(.965, t));
  g = mix(g, uBase * .3, step(t, .04));
  g *= 1. + .12 * fbm(uv, vec2(6.), 3);
  vec3 bitumen = vec3(.012, .012, .013);
  return mix(bitumen, g, smoothstep(r * 1.05, r * .75, w.x));
}

float roughness(vec2 uv) {
  vec4 w = worley(uv, vec2(330.), .95);
  return mix(.55, .86, smoothstep(.0011, .0006, w.x));
}
`

/** Cast concrete / micro-cement, 1 x 1 m. */
export const CONCRETE = /* glsl */ `
uniform vec3 uBase;
uniform float uPores;

float pores(vec2 uv) {
  vec4 w = worley(uv, vec2(160.), 1.);
  float r = .0011 * hash21(w.zw + 2.) * step(.55, hash21(w.zw));
  return smoothstep(r, r * .4, w.x);
}

float height(vec2 uv) {
  return fbm(uv, vec2(24.), 5) * .5 - pores(uv) * uPores;
}

vec3 albedo(vec2 uv) {
  float n = fbm(uv, vec2(3.), 5);
  float m = fbm(uv + .37, vec2(20.), 4);
  vec3 c = uBase * (1. + .16 * n + .06 * m);
  c = mix(c, uBase * .45, pores(uv) * uPores);
  return c;
}

float roughness(vec2 uv) {
  return .72 + .12 * fbm(uv, vec2(6.), 4) + .1 * pores(uv) * uPores;
}
`

/** Rounded river stones (sauna-stove niche), 0.5 x 0.5 m. */
export const STONES = /* glsl */ `
float height(vec2 uv) {
  vec4 w = worley(uv, vec2(9.), .8);
  float edge = w.y - w.x;
  return smoothstep(0., .022, edge) + fbm(uv, vec2(40.), 3) * .08;
}
vec3 albedo(vec2 uv) {
  vec4 w = worley(uv, vec2(9.), .8);
  float t = hash21(w.zw);
  vec3 c = mix(vec3(.16, .155, .15), vec3(.42, .38, .33), t);
  c = mix(c, vec3(.3, .31, .33), step(.7, hash21(w.zw + 3.)));
  c *= 1. + .25 * fbm(uv, vec2(48.), 4);
  return mix(vec3(.02), c, smoothstep(0., .006, w.y - w.x));
}
float roughness(vec2 uv) { return .6 + .2 * fbm(uv, vec2(30.), 3); }
`

/** Brushed stainless / galvanised steel, 1 x 1 m, streaks along u. */
export const BRUSHED = /* glsl */ `
uniform vec3 uBase;
uniform float uRough;
float height(vec2 uv) {
  return gnoise(uv, vec2(6., 1800.)) * .5 + gnoise(uv, vec2(3., 700.)) * .5;
}
vec3 albedo(vec2 uv) {
  return uBase * (1. + .04 * gnoise(uv, vec2(4., 900.)) + .05 * fbm(uv, vec2(3.), 3));
}
float roughness(vec2 uv) {
  return uRough + .07 * gnoise(uv, vec2(5., 1400.)) + .05 * fbm(uv, vec2(4.), 3);
}
`

/** Tyre tread: 1.8 m of circumference (u) by 0.2 m of width (v). */
export const TREAD = /* glsl */ `
float height(vec2 uv) {
  float x = uv.x * 64.;
  float y = uv.y;
  float zig = .03 * sin(x * 6.2831853);
  float g1 = smoothstep(.012, .022, abs(y - .5 - zig));
  float g2 = smoothstep(.01, .02, abs(y - .27 + zig * .6));
  float g3 = smoothstep(.01, .02, abs(y - .73 + zig * .6));
  float off = y < .5 ? 0. : .5;
  float shoulder = step(y, .27) + step(.73, y);
  float lat = mix(1., smoothstep(.04, .09, abs(fract(x + off) - .5)), shoulder);
  float sipe = mix(smoothstep(.01, .03, abs(fract(x * 2. + off + y * 2.) - .5)), 1., shoulder);
  return g1 * g2 * g3 * lat * sipe + gnoise(uv, vec2(64., 8.)) * .03;
}
vec3 albedo(vec2 uv) { return vec3(.022) * (.85 + .3 * height(uv)); }
float roughness(vec2 uv) { return .78 + .1 * (1. - height(uv)); }
`
