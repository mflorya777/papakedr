import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// Procedural PBR textures are rendered once on the GPU into mip-mapped render
// targets. Each material shader exposes `vec3 albedo()`, `vec2 surface()`
// (height, roughness) at the current texel; this wrapper turns them into the
// three maps a MeshStandardMaterial needs. Heights are differentiated in the
// shader, so normal maps are exact rather than estimated from 8-bit data.

export type BakeOutput = 'albedo' | 'normal' | 'orm'

export interface BakeSpec {
  /** Unique cache key: shader name + every uniform that affects the result. */
  key: string
  width: number
  height: number
  /** Physical size of the texture in metres, used for the normal-map gradient. */
  size: [number, number]
  /** GLSL providing `float height(vec2 uv)`, `vec3 albedo(vec2 uv)`, `float roughness(vec2 uv)`. */
  glsl: string
  uniforms?: Record<string, THREE.IUniform>
  /** Normal-map strength: metres of relief per unit of height. */
  relief: number
}

export interface BakedSet {
  map: THREE.Texture
  normalMap: THREE.Texture
  /** R = ambient occlusion, G = roughness (three.js ORM convention). */
  ormMap: THREE.Texture
}

const COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uTexel;
uniform vec2 uSize;
uniform float uRelief;
uniform int uMode;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec2 gradDir(vec2 i) { float a = hash21(i) * 6.2831853; return vec2(cos(a), sin(a)); }

// Periodic gradient noise; 'cells' must be integers so textures tile seamlessly.
float gnoise(vec2 uv, vec2 cells) {
  vec2 p = uv * cells;
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  float a = dot(gradDir(mod(i, cells)), f);
  float b = dot(gradDir(mod(i + vec2(1, 0), cells)), f - vec2(1, 0));
  float c = dot(gradDir(mod(i + vec2(0, 1), cells)), f - vec2(0, 1));
  float d = dot(gradDir(mod(i + vec2(1, 1), cells)), f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.4;
}
float fbm(vec2 uv, vec2 cells, int octaves) {
  float s = 0., a = .5, n = 0.;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * gnoise(uv, cells);
    n += a;
    cells *= 2.;
    a *= .5;
  }
  return s / n;
}
// Periodic Worley noise: x = distance to nearest feature, y = 2nd nearest, zw = id of nearest.
vec4 worley(vec2 uv, vec2 cells, float jitter) {
  vec2 p = uv * cells;
  vec2 i = floor(p), f = fract(p);
  float d1 = 9., d2 = 9.;
  vec2 id = vec2(0);
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y);
    vec2 c = mod(i + o, cells);
    vec2 r = o + .5 + (hash22(c) - .5) * jitter - f;
    // Aspect-correct distance in physical units.
    r *= uSize / cells;
    float d = length(r);
    if (d < d1) { d2 = d1; d1 = d; id = c; } else if (d < d2) { d2 = d; }
  }
  return vec4(d1, d2, id);
}
`

const MAIN = /* glsl */ `
void main() {
  vec2 uv = vUv;
  if (uMode == 0) {
    gl_FragColor = vec4(albedo(uv), 1.0);
  } else if (uMode == 1) {
    vec2 e = uTexel;
    float hx = height(uv + vec2(e.x, 0.)) - height(uv - vec2(e.x, 0.));
    float hy = height(uv + vec2(0., e.y)) - height(uv - vec2(0., e.y));
    // Convert height deltas to slopes in metres.
    vec2 slope = vec2(hx / (2. * e.x * uSize.x), hy / (2. * e.y * uSize.y)) * uRelief;
    vec3 n = normalize(vec3(-slope, 1.0));
    gl_FragColor = vec4(n * .5 + .5, 1.0);
  } else {
    float h = height(uv);
    float ao = mix(.72, 1., smoothstep(-.1, .9, h));
    gl_FragColor = vec4(ao, clamp(roughness(uv), .02, 1.), 0., 1.);
  }
}
`

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const cache = new Map<string, BakedSet>()

function bakeOne(
  gl: THREE.WebGLRenderer,
  quad: FullScreenQuad,
  material: THREE.ShaderMaterial,
  spec: BakeSpec,
  mode: number,
  srgb: boolean,
  anisotropy: number,
): THREE.Texture {
  const target = new THREE.WebGLRenderTarget(spec.width, spec.height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    depthBuffer: false,
    anisotropy,
  })
  material.uniforms.uMode.value = mode
  gl.setRenderTarget(target)
  // Render in tiles so one huge draw call never trips a GPU watchdog.
  const tile = 1024
  gl.setScissorTest(true)
  for (let y = 0; y < spec.height; y += tile) {
    for (let x = 0; x < spec.width; x += tile) {
      gl.setScissor(x, y, Math.min(tile, spec.width - x), Math.min(tile, spec.height - y))
      quad.render(gl)
    }
  }
  gl.setScissorTest(false)
  // The render target owns its texture; keep the target alive with it.
  const tex = target.texture
  tex.userData.target = target
  return tex
}

export function bake(gl: THREE.WebGLRenderer, spec: BakeSpec): BakedSet {
  const hit = cache.get(spec.key)
  if (hit) return hit

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: COMMON + spec.glsl + MAIN,
    uniforms: {
      uTexel: { value: new THREE.Vector2(1 / spec.width, 1 / spec.height) },
      uSize: { value: new THREE.Vector2(...spec.size) },
      uRelief: { value: spec.relief },
      uMode: { value: 0 },
      ...spec.uniforms,
    },
    depthTest: false,
    depthWrite: false,
  })
  const quad = new FullScreenQuad(material)
  const prevTarget = gl.getRenderTarget()
  const prevAutoClear = gl.autoClear
  gl.autoClear = false
  const aniso = Math.min(16, gl.capabilities.getMaxAnisotropy())

  const set: BakedSet = {
    map: bakeOne(gl, quad, material, spec, 0, true, aniso),
    normalMap: bakeOne(gl, quad, material, spec, 1, false, aniso),
    ormMap: bakeOne(gl, quad, material, spec, 2, false, aniso),
  }

  gl.setRenderTarget(prevTarget)
  gl.autoClear = prevAutoClear
  quad.dispose()
  material.dispose()
  cache.set(spec.key, set)
  return set
}
