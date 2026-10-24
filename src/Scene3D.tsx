import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { useEffect, useMemo, useRef } from "react"

// Shared state between the page (scroll / view switches) and the 3D scene.
export const sceneState = { p: 0, lp: 0, mode: "home" as "home" | "strip", kick: -1e9, dist: 0, speed: 7 }

const tex = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  draw(c.getContext("2d")!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const paint = { color: "#f2b705", metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 }
const glass = { color: "#0a1524", metalness: 0.9, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 }

function Wheel({ x, z }: { x: number; z: number }) {
  const spin = useRef<THREE.Group>(null!)
  useFrame((_, dt) => { spin.current.rotation.z -= (sceneState.speed / 0.55) * dt })
  const s = Math.sign(z)
  return (
    <group position={[x, 0.55, 0]}>
      <mesh position={[0, 0, s * 1.385]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.06, 32]} />
        <meshStandardMaterial color="#050505" />
      </mesh>
      <group ref={spin} position={[0, 0, z]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.55, 0.45, 32]} />
          <meshStandardMaterial color="#121212" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0, s * 0.23]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.34, 0.04, 24]} />
          <meshStandardMaterial color="#c9ced6" metalness={1} roughness={0.2} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <mesh key={k} position={[0, 0, s * 0.255]} rotation={[0, 0, (k * Math.PI) / 3]}>
            <boxGeometry args={[0.62, 0.05, 0.02]} />
            <meshStandardMaterial color="#5c626c" metalness={1} roughness={0.35} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Bus({ number }: { number: string }) {
  const g = useRef<THREE.Group>(null!)
  const body = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-6, 0.4); s.lineTo(5.9, 0.4); s.quadraticCurveTo(6.08, 0.45, 6.08, 0.9)
    s.lineTo(6.05, 2.2); s.lineTo(5.7, 3.3); s.quadraticCurveTo(5.6, 3.45, 5.3, 3.45)
    s.lineTo(-5.7, 3.45); s.quadraticCurveTo(-6.05, 3.4, -6.05, 3.0); s.lineTo(-6.05, 0.7); s.quadraticCurveTo(-6.05, 0.4, -6, 0.4)
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2.5, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.12, bevelSegments: 4, curveSegments: 16 })
    geo.translate(0, 0, -1.25)
    return geo
  }, [])
  const band = useMemo(() => tex(2048, 96, (c) => {
    c.fillStyle = "#12213b"; c.fillRect(0, 0, 2048, 96)
    c.fillStyle = "#f2b705"; c.font = "700 56px Arial"; c.textBaseline = "middle"
    c.fillText(`PARUL UNIVERSITY   ·   CAMPUS BUS   ·   ${number}   ·   PARUL UNIVERSITY   ·   CAMPUS BUS`, 40, 50)
  }), [number])
  const plate = useMemo(() => tex(256, 64, (c) => {
    c.fillStyle = "#f7f7f2"; c.fillRect(0, 0, 256, 64); c.strokeStyle = "#111"; c.lineWidth = 5; c.strokeRect(3, 3, 250, 58)
    c.fillStyle = "#111"; c.font = "700 38px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("GJ06 XV 4471", 128, 34)
  }), [])
  const sign = useMemo(() => tex(512, 64, (c) => {
    c.fillStyle = "#0b0b0b"; c.fillRect(0, 0, 512, 64); c.fillStyle = "#ffb000"; c.font = "700 34px monospace"
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(`${number}  PARUL CAMPUS`, 256, 34)
  }), [number])

  useFrame(() => {
    const k = Math.min(1, (performance.now() - sceneState.kick) / 1500)
    const e = 1 - Math.pow(1 - k, 3)
    g.current.position.x = -34 * (1 - e)                       // drives in on page switch
    g.current.rotation.z = Math.sin(performance.now() / 260) * 0.004 * (sceneState.speed / 7) // suspension sway
    g.current.position.y = Math.sin(performance.now() / 130) * 0.01
  })

  const winZ = [1.39, -1.39]
  return (
    <group ref={g}>
      <mesh geometry={body} castShadow><meshPhysicalMaterial {...paint} /></mesh>
      {/* lower navy livery band with lettering, both sides */}
      {winZ.map((z) => (
        <mesh key={z} position={[0, 0.98, z]} rotation={[0, z < 0 ? Math.PI : 0, 0]}>
          <planeGeometry args={[11.7, 0.5]} /><meshStandardMaterial map={band} roughness={0.5} />
        </mesh>
      ))}
      {/* side windows (door side +z has a gap for the door) */}
      {[-4.6, -3.1, -1.6, -0.1, 1.4, 2.9].map((x) => (
        <mesh key={"a" + x} position={[x, 2.55, 1.385]}><boxGeometry args={[1.35, 0.95, 0.03]} /><meshPhysicalMaterial {...glass} /></mesh>
      ))}
      {[-4.6, -3.1, -1.6, -0.1, 1.4, 2.9, 4.4].map((x) => (
        <mesh key={"b" + x} position={[x, 2.55, -1.385]}><boxGeometry args={[1.35, 0.95, 0.03]} /><meshPhysicalMaterial {...glass} /></mesh>
      ))}
      <mesh position={[4.75, 2.0, 1.385]}><boxGeometry args={[1.1, 2.1, 0.03]} /><meshPhysicalMaterial {...glass} /></mesh>
      {/* windshield, destination sign, rear window */}
      <mesh position={[5.9, 2.65, 0]} rotation={[0, 0, 0.31]}><boxGeometry args={[0.05, 0.95, 2.3]} /><meshPhysicalMaterial {...glass} /></mesh>
      <mesh position={[5.79, 3.2, 0]} rotation={[0, Math.PI / 2, -0.31]}><planeGeometry args={[2.1, 0.2]} /><meshBasicMaterial map={sign} /></mesh>
      <mesh position={[-6.2, 2.55, 0]}><boxGeometry args={[0.03, 0.95, 2.2]} /><meshPhysicalMaterial {...glass} /></mesh>
      {/* bumpers, grille, lights, plates */}
      {[6.1, -6.1].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]} castShadow><boxGeometry args={[0.28, 0.3, 2.7]} /><meshStandardMaterial color="#12213b" roughness={0.5} /></mesh>
      ))}
      <mesh position={[6.14, 1.35, 0]}><boxGeometry args={[0.03, 0.5, 1.2]} /><meshStandardMaterial color="#111" metalness={0.8} roughness={0.4} /></mesh>
      {[0.95, -0.95].map((z) => (
        <mesh key={"h" + z} position={[6.13, 1.1, z]} scale={[0.4, 1, 1.9]}>
          <sphereGeometry args={[0.14, 20, 16]} /><meshStandardMaterial color="#fff" emissive="#fff6d8" emissiveIntensity={2.2} />
        </mesh>
      ))}
      {[0.95, -0.95].map((z) => (
        <mesh key={"t" + z} position={[-6.18, 1.2, z]}><boxGeometry args={[0.04, 0.22, 0.4]} /><meshStandardMaterial color="#c1121f" emissive="#ff1a1a" emissiveIntensity={1.4} /></mesh>
      ))}
      <mesh position={[6.29, 0.5, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.9, 0.22]} /><meshBasicMaterial map={plate} /></mesh>
      <mesh position={[-6.26, 0.5, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[0.9, 0.22]} /><meshBasicMaterial map={plate} /></mesh>
      {/* roof AC unit + mirrors */}
      <mesh position={[0.5, 3.66, 0]} castShadow><boxGeometry args={[3, 0.28, 1.5]} /><meshStandardMaterial color="#e8ecf2" roughness={0.6} /></mesh>
      {[1.62, -1.62].map((z) => (
        <group key={"m" + z}>
          <mesh position={[5.6, 2.5, z * 0.93]}><boxGeometry args={[0.05, 0.05, 0.4]} /><meshStandardMaterial color="#111" /></mesh>
          <mesh position={[5.6, 2.5, z]}><boxGeometry args={[0.1, 0.5, 0.16]} /><meshStandardMaterial color="#111" metalness={0.6} roughness={0.4} /></mesh>
        </group>
      ))}
      <pointLight position={[7, 1.1, 0]} color="#fff2cc" intensity={6} distance={9} />
      {[3.7, -3.4].flatMap((x) => [1.28, -1.28].map((z) => <Wheel key={x + "_" + z} x={x} z={z} />))}
    </group>
  )
}

const dayC = new THREE.Color("#a9d6ff"), duskC = new THREE.Color("#ff9d5c"), nightC = new THREE.Color("#0a1030")
const camPos = new THREE.CatmullRomCurve3([[-9, 2.4, 10], [10, 2.2, 6.5], [1, 9, 9.5], [-10, 1.8, -6], [4, 1.3, 7.5]].map((a) => new THREE.Vector3(...a)))
const camLook = new THREE.CatmullRomCurve3([[1, 1.6, 0], [0, 1.7, 0], [0, 1, 0], [1, 1.8, 0], [4, 1.8, 0]].map((a) => new THREE.Vector3(...a)))
const tmpC = new THREE.Color(), tp = new THREE.Vector3(), tl = new THREE.Vector3(), look = new THREE.Vector3(0, 1.6, 0)

function World() {
  const { scene, gl, camera, size } = useThree()
  const sun = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const bMat = useRef<THREE.MeshStandardMaterial>(null!)
  const bl = useRef<THREE.InstancedMesh>(null!)
  const br = useRef<THREE.InstancedMesh>(null!)
  const N = 36, L = N * 11
  const road = useMemo(() => {
    const t = tex(512, 128, (c) => {
      c.fillStyle = "#2a2d35"; c.fillRect(0, 0, 512, 128)
      c.fillStyle = "#e9e9e4"; c.fillRect(0, 6, 512, 4); c.fillRect(0, 118, 512, 4)
      c.fillStyle = "#f2b705"; c.fillRect(40, 62, 200, 5)
    })
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(60, 1)
    return t
  }, [])
  const wins = useMemo(() => tex(128, 256, (c) => {
    c.fillStyle = "#c9ced8"; c.fillRect(0, 0, 128, 256)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      c.fillStyle = (x * 7 + y * 13) % 5 < 2 ? "#ffd98a" : "#39465e"; c.fillRect(x * 16 + 3, y * 16 + 3, 10, 10)
    }
  }), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.background = new THREE.Color(dayC)
    scene.fog = new THREE.Fog(dayC, 40, 150)
    const pal = ["#c8b8a6", "#9fb3c8", "#d9c7a0", "#b0a4b8", "#a7c4b5"].map((c) => new THREE.Color(c))
    ;[bl, br].forEach((r) => { for (let i = 0; i < N; i++) r.current.setColorAt(i, pal[(i * 3) % 5]) })
    return () => pm.dispose()
  }, [gl, scene])

  useFrame((_, dt) => {
    const s = sceneState, home = s.mode === "home"
    const dp = home ? s.p - s.lp : 0
    s.lp = s.p
    const target = 7 + (dp * 320) / Math.max(dt, 0.008) * 1
    s.speed += (Math.max(-30, Math.min(45, target)) - s.speed) * Math.min(1, dt * 6)
    s.dist += s.speed * dt
    road.offset.x = s.dist / 7.5

    ;[bl, br].forEach((r, side) => {
      for (let i = 0; i < N; i++) {
        const h = 5 + ((i * 37 + side * 11) % 11) * 1.7
        const x = ((((i * 11 - s.dist) % L) + L) % L) - L / 2
        dummy.position.set(x, h / 2, (side ? -1 : 1) * (11 + ((i + side) % 3) * 4.5))
        dummy.scale.set(6 + (i % 4), h, 6 + ((i * 3) % 4))
        dummy.updateMatrix()
        r.current.setMatrixAt(i, dummy.matrix)
      }
      r.current.instanceMatrix.needsUpdate = true
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true
    })

    // camera rig: story path on the home page, fixed side-view strip elsewhere
    const q = home ? s.p : 0.08
    const cam = camera as THREE.PerspectiveCamera
    if (home) { camPos.getPoint(q, tp); camLook.getPoint(q, tl) } else { tp.set(0.5, 2.7, size.width < 700 ? 22 : 14.5); tl.set(0, 1.7, 0) }
    cam.position.lerp(tp, Math.min(1, dt * 4)); look.lerp(tl, Math.min(1, dt * 4)); cam.lookAt(look)
    const fov = size.width / size.height < 1 ? 62 : 38
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix() }

    // sky: day -> dusk -> night over the scroll
    const col = q < 0.5 ? tmpC.copy(dayC).lerp(duskC, q / 0.5) : tmpC.copy(duskC).lerp(nightC, (q - 0.5) / 0.5)
    ;(scene.background as THREE.Color).copy(col); (scene.fog as THREE.Fog).color.copy(col)
    const n = THREE.MathUtils.smoothstep(q, 0.5, 1)
    sun.current.intensity = 2.6 * (1 - n * 0.85); hemi.current.intensity = 0.9 - n * 0.55
    bMat.current.emissiveIntensity = 0.15 + n * 1.3
  })

  const bm = <meshStandardMaterial ref={bMat} map={wins} emissiveMap={wins} emissive="#ffd98a" roughness={0.8} />
  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffffff", "#446644", 0.9]} />
      <directionalLight ref={sun} position={[12, 20, 10]} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-bias={-0.0004} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[700, 140]} /><meshStandardMaterial color="#38603f" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow><planeGeometry args={[700, 9]} /><meshStandardMaterial map={road} roughness={0.9} /></mesh>
      <instancedMesh ref={bl} args={[undefined, undefined, N]} castShadow>{<boxGeometry />}{bm}</instancedMesh>
      <instancedMesh ref={br} args={[undefined, undefined, N]} castShadow><boxGeometry /><meshStandardMaterial map={wins} emissiveMap={wins} emissive="#ffd98a" emissiveIntensity={0.4} roughness={0.8} /></instancedMesh>
    </>
  )
}

export default function Scene3D({ mode, pulse, busNumber }: { mode: "home" | "strip"; pulse: number; busNumber: string }) {
  useEffect(() => { sceneState.mode = mode }, [mode])
  useEffect(() => { sceneState.kick = performance.now() }, [pulse])
  useEffect(() => {
    const on = () => {
      const h = document.documentElement.scrollHeight - innerHeight
      sceneState.p = h > 0 ? Math.min(1, scrollY / h) : 0
    }
    on()
    addEventListener("scroll", on, { passive: true })
    return () => removeEventListener("scroll", on)
  }, [])
  return (
    <div className="scene">
      <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 38, position: [-9, 2.4, 10], near: 0.1, far: 400 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <World />
        <Bus number={busNumber} />
      </Canvas>
    </div>
  )
}
