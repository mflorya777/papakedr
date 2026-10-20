import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { MODELS, type Config, type SceneMood } from '../data/catalog'
import { useShingleMaterial, useStaticMaterials, useWoodMaterial } from './materials'
import { Bag, makeLayout, type MaterialKey } from './models/layout'
import { buildShell } from './parts/shell'
import { buildRoof } from './parts/roof'
import { buildOpenings } from './parts/openings'
import { buildBlocks, buildChimney, buildLighting, buildTrailer } from './parts/base'

export function buildSauna(config: Config) {
  const lay = makeLayout(config)
  const bag = new Bag()
  buildShell(bag, lay)
  buildRoof(bag, lay, config.shingle)
  const door = buildOpenings(bag, lay)
  if (MODELS[config.model].base === 'blocks') buildBlocks(bag, lay)
  else buildTrailer(bag, lay)
  buildChimney(bag, lay)
  const lighting = buildLighting(bag, lay, config.lighting, door)
  const meshes = [...bag.builders].map(([key, b]) => ({ key, geometry: b.build() }))
  return { lay, meshes, door, lighting }
}

export function Sauna({ config, mood }: { config: Config; mood: SceneMood }) {
  const statics = useStaticMaterials()
  const wood = useWoodMaterial(config.finish)
  const shingle = useShingleMaterial(config.roofColor)
  const { model, length, shingle: shape, stove, windows, lighting } = config

  const built = useMemo(
    () => buildSauna({ ...config }),
    // Finish and roof colour only swap materials; everything else rebuilds geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, length, shape, stove, windows, lighting],
  )
  useEffect(() => () => built.meshes.forEach((m) => m.geometry.dispose()), [built])

  const materials: Record<MaterialKey, THREE.Material> = { ...statics, wood, shingle }

  const evening = mood === 'evening'
  useEffect(() => {
    statics.glass.emissiveIntensity = evening ? 2.2 : 0
    statics.ledStrip.emissiveIntensity = lighting ? (evening ? 14 : 0.6) : 0
  }, [statics, evening, lighting])

  // Flickering fire behind the stove door glass.
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current += dt
    const f = 0.75 + 0.25 * Math.sin(t.current * 9.1) * Math.sin(t.current * 3.7 + 1.3)
    statics.fire.emissiveIntensity = (evening ? 7 : 2.5) * f
  })

  const lamp = built.door?.lamp
  const lampTarget = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    if (lamp) lampTarget.position.set(lamp[0], 0, lamp[2])
  }, [lamp, lampTarget])
  return (
    <group>
      {built.meshes.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={materials[key]}
          castShadow={key !== 'glass' && key !== 'fireGlass' && key !== 'ledStrip'}
          receiveShadow
        />
      ))}
      {evening &&
        lighting &&
        built.lighting.strips.map((s, i) => (
          <rectAreaLight
            key={i}
            args={['#ffb46b', 9, s.x1 - s.x0, 0.06]}
            position={[(s.x0 + s.x1) / 2, s.y, s.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        ))}
      {evening && lighting && lamp && (
        <spotLight
          position={[lamp[0], lamp[1] - 0.1, lamp[2]]}
          angle={1.1}
          penumbra={0.9}
          intensity={6}
          distance={5}
          decay={1.6}
          color="#ffb46b"
          target={lampTarget}
        />
      )}
      <primitive object={lampTarget} />
      {evening &&
        built.lay.openings
          .filter((o) => o.kind !== 'door')
          .map((o, i) => {
            const z = built.lay.outer.halfWidth + 0.35
            return (
              <pointLight
                key={i}
                position={[o.c, o.y0 + o.h / 2, z]}
                intensity={o.kind === 'niche' ? 0.8 : 0.5}
                distance={2.2}
                decay={2}
                color={o.kind === 'niche' ? '#ff8a3a' : '#ffb470'}
              />
            )
          })}
    </group>
  )
}
