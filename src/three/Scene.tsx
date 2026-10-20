import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { CameraControls, Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { suspend } from 'suspend-react'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { MODELS, type Config, type SceneMood } from '../data/catalog'
import { useStore, type CameraView } from '../state'
import { useStaticMaterials } from './materials'
import { Sauna } from './Sauna'
import { makeLayout } from './models/layout'

RectAreaLightUniformsLib.init()

// CC0 HDRIs shipped as npm modules, so the configurator has no runtime CDN dependency.
const hdriDay: Promise<{ default: string }> = import('@pmndrs/assets/hdri/studio.exr')
const hdriEvening: Promise<{ default: string }> = import('@pmndrs/assets/hdri/sunset.exr')

const MOODS = {
  day: {
    background: '#e6e2db',
    env: 0.5,
    sun: { position: [7, 10, 6] as const, intensity: 3.8, color: '#fff4e6' },
    fill: 0.25,
  },
  evening: {
    background: '#1d2026',
    env: 0.16,
    sun: { position: [-9, 3.2, 4] as const, intensity: 0.55, color: '#ff9a5c' },
    fill: 0.05,
  },
}

function Floor() {
  const { floor } = useStaticMaterials()
  useMemo(() => {
    for (const t of [floor.map, floor.normalMap, floor.roughnessMap]) t?.repeat.set(24, 24)
  }, [floor])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={floor}>
      <circleGeometry args={[24, 96]} />
    </mesh>
  )
}

function Lights({ mood }: { mood: SceneMood }) {
  const m = MOODS[mood]
  return (
    <>
      <directionalLight
        position={m.sun.position}
        intensity={m.sun.intensity}
        color={m.sun.color}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-radius={6}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      <hemisphereLight args={['#ffffff', '#b8ad9c', m.fill]} />
    </>
  )
}

function Env({ mood }: { mood: SceneMood }) {
  const day = suspend(() => hdriDay, ['hdri-day']).default
  const evening = suspend(() => hdriEvening, ['hdri-evening']).default
  return (
    <Environment
      files={mood === 'day' ? day : evening}
      environmentIntensity={MOODS[mood].env}
      environmentRotation={[0, Math.PI / 3, 0]}
    >
      {/* Soft boxes around the horizon give metals and glass clean highlights. */}
      {mood === 'day' && (
        <group rotation={[0, 0.4, 0]}>
          <Lightformer form="rect" intensity={1.1} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2
            return (
              <Lightformer
                key={i}
                form="rect"
                intensity={i % 2 ? 0.5 : 1.1}
                position={[Math.cos(a) * 9, 2, Math.sin(a) * 9]}
                scale={[3, 16, 1]}
                target={[0, 1.5, 0]}
              />
            )
          })}
          <Lightformer form="rect" intensity={0.5} color="#d9cfc1" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} />
        </group>
      )}
    </Environment>
  )
}

/** Camera presets, framed for the current model and length. */
function viewFor(view: CameraView, config: Config): [number, number, number, number, number, number] {
  const L = config.length
  const lay = makeLayout(config)
  const door = lay.openings.find((o) => o.kind === 'door')!
  const midY = MODELS[config.model].shell.elevation + MODELS[config.model].shell.height / 2
  switch (view) {
    case 'entrance':
      return door.wall === '+x'
        ? [L / 2 + 3.6, 1.7, door.c + 1.4, L / 2, door.y0 + door.h / 2, door.c]
        : [door.c + 1.2, 1.8, 4.2, door.c - 0.25, door.y0 + door.h / 2, 1]
    case 'side':
      return [0, midY + 0.3, L * 0.95 + 5.4, 0, midY + 0.05, 0]
    case 'roof':
      return [L * 0.6 + 3.2, midY + 4.4, 4.4, 0, midY + 0.4, 0]
    default:
      return [L * 0.75 + 4.6, midY + 1.3, L * 0.55 + 5.8, 0, midY + 0.05, 0]
  }
}

function Rig() {
  const ref = useRef<CameraControls>(null)
  const config = useStore((s) => s.config)
  const view = useStore((s) => s.view)
  const nonce = useStore((s) => s.viewNonce)
  const first = useRef(true)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.setLookAt(...viewFor(view, config), !first.current)
    first.current = false
    // Re-frame on explicit view requests and on model or size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, config.model, config.length])
  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={2.2}
      maxDistance={18}
      maxPolarAngle={Math.PI / 2 - 0.04}
      smoothTime={0.6}
      dollySpeed={0.6}
    />
  )
}

function Background({ mood }: { mood: SceneMood }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const c = new THREE.Color(MOODS[mood].background)
    scene.background = c
    scene.fog = new THREE.Fog(c, 16, 34)
  }, [scene, mood])
  return null
}

// `?static` renders on demand only (used for automated screenshots).
const STATIC = new URLSearchParams(window.location.search).has('static')

export function Scene({ onReady }: { onReady: () => void }) {
  const config = useStore((s) => s.config)
  const mood = useStore((s) => s.mood)
  return (
    <Canvas
      shadows
      frameloop={STATIC ? 'demand' : 'always'}
      dpr={[1, 2]}
      camera={{ fov: 32, near: 0.1, far: 120, position: [8, 3, 8] }}
      gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      onCreated={() => requestAnimationFrame(onReady)}
    >
      <Background mood={mood} />
      <Lights mood={mood} />
      <Suspense fallback={null}>
        <Env mood={mood} />
      </Suspense>
      <Sauna config={config} mood={mood} />
      <Floor />
      <Rig />
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={0.55} distanceFalloff={0.6} intensity={2.4} quality="high" />
        <Bloom luminanceThreshold={1.1} intensity={mood === 'evening' ? 0.9 : 0.15} mipmapBlur radius={0.7} />
        <Vignette offset={0.35} darkness={0.35} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </Canvas>
  )
}
