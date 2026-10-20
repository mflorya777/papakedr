import { useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { FinishId, RoofColorId } from '../data/catalog'
import { bake, type BakedSet } from './textures/bake'
import { BRUSHED, CONCRETE, SHINGLE, STONES, TREAD, WOOD } from './textures/shaders'

// Physical sizes (metres) covered by one tile of each baked texture. Geometry
// UVs are generated in these units, so every surface keeps a constant texel
// density regardless of the configured length.
export const TEX = {
  wood: [2.4, 0.6] as [number, number],
  shingle: 0.5,
  concrete: 1,
  stones: 0.5,
  brushed: 1,
  tread: [1.8, 0.2] as [number, number],
}

const col = (hex: string) => new THREE.Color(hex)

interface WoodPalette {
  early: string
  late: string
  knot: string
  rough: number
  brushed: number
  clearcoat: number
}

const WOOD_PALETTES: Record<FinishId, WoodPalette> = {
  natural: { early: '#c68b52', late: '#93592b', knot: '#5b3219', rough: 0.6, brushed: 0.15, clearcoat: 0.12 },
  walnut: { early: '#7d4d2c', late: '#4d2a15', knot: '#2a160a', rough: 0.55, brushed: 0.15, clearcoat: 0.15 },
  graphite: { early: '#64625d', late: '#3d3c39', knot: '#252422', rough: 0.68, brushed: 0.35, clearcoat: 0.05 },
  charcoal: { early: '#2f2c29', late: '#181716', knot: '#0d0c0c', rough: 0.7, brushed: 1, clearcoat: 0.25 },
}

export const ROOF_BASE: Record<RoofColorId, string> = {
  black: '#2e2f31',
  brown: '#57392b',
  burgundy: '#66282a',
  green: '#37473b',
}

function apply(m: THREE.MeshStandardMaterial, t: BakedSet, repeat = 1) {
  for (const tex of [t.map, t.normalMap, t.ormMap]) tex.repeat.set(repeat, repeat)
  m.map = t.map
  m.normalMap = t.normalMap
  m.roughnessMap = t.ormMap
  m.aoMap = t.ormMap
  m.aoMapIntensity = 0.8
  return m
}

export function bakeWood(gl: THREE.WebGLRenderer, finish: FinishId): BakedSet {
  const p = WOOD_PALETTES[finish]
  return bake(gl, {
    key: `wood:${finish}`,
    width: 4096,
    height: 1024,
    size: TEX.wood,
    glsl: WOOD,
    relief: 0.0009 + 0.0011 * p.brushed,
    uniforms: {
      uEarly: { value: col(p.early) },
      uLate: { value: col(p.late) },
      uKnot: { value: col(p.knot) },
      uRings: { value: 36 },
      uRough: { value: p.rough },
      uBrushed: { value: p.brushed },
    },
  })
}

export interface Materials {
  wood: THREE.MeshPhysicalMaterial
  shingle: THREE.MeshStandardMaterial
  membrane: THREE.MeshStandardMaterial
  concrete: THREE.MeshStandardMaterial
  floor: THREE.MeshStandardMaterial
  blackSteel: THREE.MeshStandardMaterial
  stainless: THREE.MeshPhysicalMaterial
  galvanized: THREE.MeshStandardMaterial
  wheelPaint: THREE.MeshStandardMaterial
  tread: THREE.MeshStandardMaterial
  rubber: THREE.MeshStandardMaterial
  glass: THREE.MeshPhysicalMaterial
  fireGlass: THREE.MeshPhysicalMaterial
  fire: THREE.MeshStandardMaterial
  stones: THREE.MeshStandardMaterial
  nickel: THREE.MeshStandardMaterial
  ledStrip: THREE.MeshStandardMaterial
  reflectorAmber: THREE.MeshStandardMaterial
  reflectorRed: THREE.MeshStandardMaterial
  lampShade: THREE.MeshStandardMaterial
}

/** Materials independent of the configuration: baked once per renderer. */
export function useStaticMaterials() {
  const gl = useThree((s) => s.gl)
  return useMemo(() => {
    const concreteTex = bake(gl, {
      key: 'concrete',
      width: 2048,
      height: 2048,
      size: [TEX.concrete, TEX.concrete],
      glsl: CONCRETE,
      relief: 0.0012,
      uniforms: { uBase: { value: col('#9a9792') }, uPores: { value: 1 } },
    })
    const floorTex = bake(gl, {
      key: 'floor',
      width: 2048,
      height: 2048,
      size: [TEX.concrete, TEX.concrete],
      glsl: CONCRETE,
      relief: 0.0004,
      uniforms: { uBase: { value: col('#c9c3b8') }, uPores: { value: 0.35 } },
    })
    const steelTex = bake(gl, {
      key: 'brushed:stainless',
      width: 1024,
      height: 1024,
      size: [TEX.brushed, TEX.brushed],
      glsl: BRUSHED,
      relief: 0.00004,
      uniforms: { uBase: { value: col('#d6d7d8') }, uRough: { value: 0.42 } },
    })
    const galvTex = bake(gl, {
      key: 'brushed:galvanized',
      width: 1024,
      height: 1024,
      size: [TEX.brushed, TEX.brushed],
      glsl: BRUSHED,
      relief: 0.00006,
      uniforms: { uBase: { value: col('#a7aaac') }, uRough: { value: 0.42 } },
    })
    const blackTex = bake(gl, {
      key: 'brushed:black',
      width: 1024,
      height: 1024,
      size: [TEX.brushed, TEX.brushed],
      glsl: BRUSHED,
      relief: 0.00003,
      uniforms: { uBase: { value: col('#161616') }, uRough: { value: 0.48 } },
    })
    const treadTex = bake(gl, {
      key: 'tread',
      width: 4096,
      height: 512,
      size: TEX.tread,
      glsl: TREAD,
      relief: 0.012,
    })
    const stonesTex = bake(gl, {
      key: 'stones',
      width: 1024,
      height: 1024,
      size: [TEX.stones, TEX.stones],
      glsl: STONES,
      relief: 0.02,
    })

    const concrete = apply(new THREE.MeshStandardMaterial(), concreteTex)
    const floor = apply(new THREE.MeshStandardMaterial({ envMapIntensity: 0.3 }), floorTex, 1)
    floor.normalScale.set(0.6, 0.6)

    const stainless = new THREE.MeshPhysicalMaterial({ metalness: 1, color: '#ffffff' })
    apply(stainless, steelTex)
    // Revolved parts have no consistent tangent frame for brushed normals;
    // the brushed look comes from the roughness map alone.
    stainless.aoMap = null
    stainless.normalMap = null

    const galvanized = apply(new THREE.MeshStandardMaterial({ metalness: 1 }), galvTex)
    galvanized.aoMap = null
    galvanized.normalMap = null
    const blackSteel = apply(new THREE.MeshStandardMaterial({ metalness: 0.55 }), blackTex)
    blackSteel.aoMap = null

    const m: Omit<Materials, 'wood' | 'shingle'> = {
      membrane: new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.92 }),
      concrete,
      floor,
      blackSteel,
      stainless,
      galvanized,
      wheelPaint: new THREE.MeshStandardMaterial({ color: '#c4c6c8', metalness: 0.7, roughness: 0.32 }),
      tread: apply(new THREE.MeshStandardMaterial(), treadTex),
      rubber: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.82 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#0d1012',
        metalness: 0,
        roughness: 0.03,
        envMapIntensity: 1.6,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        emissive: new THREE.Color('#ffb066'),
        emissiveIntensity: 0,
      }),
      fireGlass: new THREE.MeshPhysicalMaterial({
        color: '#1a1410',
        roughness: 0.05,
        transparent: true,
        opacity: 0.35,
        envMapIntensity: 1.4,
      }),
      fire: new THREE.MeshStandardMaterial({
        color: '#120804',
        emissive: new THREE.Color('#ff6a1a'),
        emissiveIntensity: 0,
        roughness: 0.9,
      }),
      stones: apply(new THREE.MeshStandardMaterial(), stonesTex),
      nickel: new THREE.MeshStandardMaterial({ color: '#d9d6d0', metalness: 1, roughness: 0.28 }),
      ledStrip: new THREE.MeshStandardMaterial({
        color: '#2a2622',
        emissive: new THREE.Color('#ffb46b'),
        emissiveIntensity: 0,
        roughness: 0.4,
      }),
      reflectorAmber: new THREE.MeshStandardMaterial({ color: '#ff8a00', roughness: 0.25, emissive: '#ff6a00', emissiveIntensity: 0.15 }),
      reflectorRed: new THREE.MeshStandardMaterial({ color: '#b50d0d', roughness: 0.25, emissive: '#800000', emissiveIntensity: 0.15 }),
      lampShade: new THREE.MeshStandardMaterial({ color: '#1b1b1b', metalness: 0.6, roughness: 0.45 }),
    }
    return m
  }, [gl])
}

export function useWoodMaterial(finish: FinishId) {
  const gl = useThree((s) => s.gl)
  return useMemo(() => {
    const p = WOOD_PALETTES[finish]
    const m = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      clearcoat: p.clearcoat,
      clearcoatRoughness: 0.45,
      sheen: finish === 'charcoal' ? 0.25 : 0,
      sheenColor: new THREE.Color('#5a5650'),
      sheenRoughness: 0.6,
    })
    return apply(m, bakeWood(gl, finish))
  }, [gl, finish])
}

export function useShingleMaterial(roof: RoofColorId) {
  const gl = useThree((s) => s.gl)
  return useMemo(() => {
    const t = bake(gl, {
      key: `shingle:${roof}`,
      width: 2048,
      height: 2048,
      size: [TEX.shingle, TEX.shingle],
      glsl: SHINGLE,
      relief: 0.00055,
      uniforms: { uBase: { value: col(ROOF_BASE[roof]) } },
    })
    const m = new THREE.MeshStandardMaterial({ vertexColors: true })
    return apply(m, t)
  }, [gl, roof])
}
