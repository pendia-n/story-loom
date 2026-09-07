import type * as Three from 'three'
import QRCode from 'qrcode'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from './AppHeader'
import { SECURITY_QUESTIONS } from '../lib/security-questions'

type ViewMode = 'room' | 'float' | 'walk'
type BackgroundMode = 'morning' | 'night' | 'twilight' | 'afternoon' | 'sunrise'

let THREE: typeof Three

type Photo = {
  id: string
  title: string
  caption: string
  url?: string
  filename?: string
  contentType?: string
  durationSeconds?: number | null
}

type PendingUpload = {
  id: string
  file: File
  previewUrl: string
}

type Chapter = {
  id: string
  title: string
  subtitle: string
  created_at?: string
  updated_at?: string
  background_mode?: BackgroundMode
  background_url?: string | null
  finishes?: string[]
}

type User = { id: string; username: string }

const demoPhotos: Photo[] = [
  { id: 'demo-1', title: 'The first warm day', caption: 'A little more light than yesterday.' },
  { id: 'demo-2', title: 'Along the quiet coast', caption: 'Keep the horizon close.' },
  { id: 'demo-3', title: 'Small table, big story', caption: 'The details came back first.' },
  { id: 'demo-4', title: 'After the rain', caption: 'Everything looked newly possible.' },
  { id: 'demo-5', title: 'A window left open', caption: 'For the future to find its way in.' },
  { id: 'demo-6', title: 'The long way home', caption: 'Worth taking slowly.' },
]

const backgroundLabels: Record<BackgroundMode, string> = { morning: 'Morning', night: 'Night', twilight: 'Twilight', afternoon: 'After noon', sunrise: 'Sun rise' }
const backgroundColors: Record<BackgroundMode, [string, string, string]> = {
  morning: ['#c8d5cf', '#ead9bb', '#fff4dd'], night: ['#030b09', '#0b1c16', '#183a2e'],
  twilight: ['#c47d68', '#4c5260', '#172a35'], afternoon: ['#fffefa', '#f2f1ec', '#dbe4e4'], sunrise: ['#101c38', '#435675', '#a27f78'],
}

function atmosphereTexture(mode: BackgroundMode) {
  const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  const colors = backgroundColors[mode]; const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(.52, colors[1]); gradient.addColorStop(1, colors[2])
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height)
  const glow = context.createRadialGradient(mode === 'sunrise' ? 160 : 690, 120, 10, mode === 'sunrise' ? 160 : 690, 120, 330)
  glow.addColorStop(0, mode === 'night' ? 'rgba(91,145,117,.18)' : 'rgba(255,238,190,.34)'); glow.addColorStop(1, 'transparent')
  context.fillStyle = glow; context.fillRect(0, 0, canvas.width, canvas.height)
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture
}

const chapterFinishes = [
  ['golden-hour', 'Golden Hour', '$1.99', 'Warm moving light and dust.'],
  ['rain-window', 'Rain Window', '$1.99', 'Slow rain and soft glass reflections.'],
  ['stardust-ceiling', 'Stardust Ceiling', '$2.99', 'A quiet constellation above the room.'],
  ['premiere-night', 'Premiere Night', '$3.99', 'Cinema lighting and a title sequence.'],
  ['keepsake-export', 'Keepsake Export', '$9–19', 'A high-resolution downloadable chapter archive.'],
] as const

function artworkTexture(photo: Photo, index: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const context = canvas.getContext('2d')
  if (!context) return new THREE.Texture()
  const palettes = [
    ['#e8b787', '#4e7180', '#17322b'], ['#d58b72', '#e5cda5', '#375c5a'],
    ['#6d8b82', '#d9b08c', '#263e41'], ['#d6b785', '#718f7b', '#243c3a'],
    ['#8e6c72', '#e8c996', '#314b53'], ['#5d7880', '#e2a778', '#1d332d'],
  ][index % 6]
  const gradient = context.createLinearGradient(0, 0, 640, 480)
  gradient.addColorStop(0, palettes[0])
  gradient.addColorStop(0.55, palettes[1])
  gradient.addColorStop(1, palettes[2])
  context.fillStyle = gradient
  context.fillRect(0, 0, 640, 480)
  context.globalAlpha = 0.22
  for (let n = 0; n < 11; n += 1) {
    context.fillStyle = n % 2 ? '#fff4d8' : '#0e2a27'
    context.beginPath()
    context.arc(80 + n * 72, 140 + (n % 3) * 54, 55 + (n % 4) * 17, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
  context.fillStyle = 'rgba(8, 26, 22, .74)'
  context.fillRect(28, 350, 584, 94)
  context.fillStyle = '#f4e5c5'
  context.font = '600 25px Manrope, sans-serif'
  context.fillText(photo.title, 48, 389)
  context.fillStyle = 'rgba(244,229,197,.74)'
  context.font = '400 15px Manrope, sans-serif'
  context.fillText(photo.caption, 48, 417)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

type GalleryCanvasProps = {
  photos: Photo[]
  mode: ViewMode
  backgroundMode: BackgroundMode
  backgroundUrl?: string | null
  finishes?: string[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function GalleryCanvas(props: GalleryCanvasProps) {
  const gateRef = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [autoWalk, setAutoWalk] = useState(false)
  const handleFailure = useCallback(() => setFailed(true), [])

  useEffect(() => {
    const gate = gateRef.current
    if (!gate) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true)
        observer.disconnect()
      }
    }, { rootMargin: '420px 0px' })
    observer.observe(gate)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!nearViewport) return
    let active = true
    void import('three').then((module) => {
      THREE = module
      if (active) setReady(true)
    })
    return () => { active = false }
  }, [nearViewport])

  function command(type: string) {
    window.dispatchEvent(new CustomEvent('storyloom-walk', { detail: type }))
  }

  return <div className="gallery-lazy-shell" ref={gateRef}>
    {failed ? <div className="gallery-fallback" aria-label="Accessible two-dimensional gallery">{props.photos.map((photo, index) => <button key={photo.id} className={props.selectedId === photo.id ? 'is-active' : ''} onClick={() => props.onSelect(photo.id)}>{photo.url && photo.contentType !== 'video/mp4' ? <img src={photo.url} alt="" /> : <span className="fallback-art">{String(index + 1).padStart(2, '0')}</span>}<strong>{photo.title}</strong></button>)}</div> : ready ? <GalleryCanvasReady {...props} onFailure={handleFailure} /> : <div className="gallery-loading"><span>✦</span><p>Preparing the room…</p></div>}
    {ready && !failed && props.mode === 'walk' && <div className="walk-controls" aria-label="Walk controls">
      <div className="walk-pad"><button aria-label="Move forward" onPointerDown={() => command('forward')}>↑</button><button aria-label="Move left" onPointerDown={() => command('left')}>←</button><button aria-label="Move backward" onPointerDown={() => command('back')}>↓</button><button aria-label="Move right" onPointerDown={() => command('right')}>→</button></div>
      <div className="walk-actions"><button onClick={() => command('entrance')}>Entrance</button><button onClick={() => command('next')}>Next memory</button><button className={autoWalk ? 'is-active' : ''} onClick={() => { const next = !autoWalk; setAutoWalk(next); command(next ? 'auto-on' : 'auto-off') }}>{autoWalk ? 'Pause' : 'Auto walk'}</button></div>
    </div>}
  </div>
}

function GalleryCanvasReady({ photos, mode, backgroundMode, backgroundUrl, finishes = [], selectedId, onSelect, onFailure }: GalleryCanvasProps & { onFailure: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef(selectedId)
  selectionRef.current = selectedId

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    const atmosphereColors = backgroundColors[backgroundMode]
    scene.background = new THREE.Color(atmosphereColors[2])
    scene.fog = new THREE.Fog(atmosphereColors[2], 10, 30)
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 100)
    camera.position.set(0, 2.15, 8.7)
    camera.lookAt(0, 2, 0)
    let renderer: Three.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' })
    } catch {
      onFailure()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    mount.appendChild(renderer.domElement)

    const textureLoader = new THREE.TextureLoader()
    const ownedTextures = new Set<Three.Texture>()
    const atmosphere = atmosphereTexture(backgroundMode)
    ownedTextures.add(atmosphere)
    const atmosphereDome = new THREE.Mesh(
      new THREE.SphereGeometry(45, 48, 32),
      new THREE.MeshBasicMaterial({ map: atmosphere, side: THREE.BackSide, depthWrite: false }),
    )
    scene.add(atmosphereDome)
    if (backgroundUrl) {
      textureLoader.load(backgroundUrl, (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace
        ownedTextures.add(loaded)
        ;(atmosphereDome.material as Three.MeshBasicMaterial).map = loaded
        ;(atmosphereDome.material as Three.MeshBasicMaterial).needsUpdate = true
        atmosphere.dispose()
      })
    }

    const room = new THREE.Group()
    scene.add(room)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 34),
      new THREE.MeshStandardMaterial({ color: '#18332d', roughness: 0.9, metalness: 0.05 }),
    )
    floor.rotation.x = -Math.PI / 2
    room.add(floor)
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 10),
      new THREE.MeshStandardMaterial({ color: '#102721', roughness: 0.96, side: THREE.DoubleSide }),
    )
    backWall.position.set(0, 5, -8)
    room.add(backWall)
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 34),
      new THREE.MeshStandardMaterial({ color: '#0b1f1a', roughness: 1, side: THREE.DoubleSide }),
    )
    ceiling.position.y = 10
    ceiling.rotation.x = Math.PI / 2
    room.add(ceiling)
    if (mode === 'walk') {
      const corridorMaterial = new THREE.MeshStandardMaterial({ color: '#102721', roughness: 0.96, side: THREE.DoubleSide })
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(34, 9), corridorMaterial.clone())
        wall.position.set(side * 4.1, 4.5, -1)
        wall.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2
        room.add(wall)
      }
    }
    const lightColors: Record<BackgroundMode, [string, string]> = {
      morning: ['#fff1d0', '#47766d'], night: ['#b9d6c7', '#0b211c'],
      twilight: ['#ffd0a7', '#3b4d68'], afternoon: ['#ffffff', '#789999'], sunrise: ['#c7d9ff', '#18264b'],
    }
    scene.add(new THREE.HemisphereLight(lightColors[backgroundMode][0], lightColors[backgroundMode][1], backgroundMode === 'night' ? 1.45 : 1.75))
    const keyLight = new THREE.PointLight(lightColors[backgroundMode][0], backgroundMode === 'night' ? 35 : 44, 22, 2)
    keyLight.position.set(0, 8, 2)
    scene.add(keyLight)
    const fillLight = new THREE.PointLight(lightColors[backgroundMode][1], 18, 18, 2)
    fillLight.position.set(-6, 3, 3)
    scene.add(fillLight)

    let rainDrops: Three.Points | null = null
    let stars: Three.Points | null = null
    if (finishes.includes('golden-hour')) {
      const goldenLight = new THREE.PointLight('#ffb45f', 28, 16, 2)
      goldenLight.position.set(-5, 4, 4)
      scene.add(goldenLight)
      renderer.toneMappingExposure = 1.2
    }
    if (finishes.includes('premiere-night')) {
      const premiereLight = new THREE.SpotLight('#e7c5ff', 40, 24, Math.PI / 5, 0.45, 1.4)
      premiereLight.position.set(0, 9, 1)
      premiereLight.target.position.set(0, 0, -4)
      scene.add(premiereLight, premiereLight.target)
    }
    if (finishes.includes('rain-window')) {
      const positions = new Float32Array(180 * 3)
      for (let index = 0; index < 180; index += 1) {
        positions[index * 3] = (Math.random() - 0.5) * 22
        positions[index * 3 + 1] = Math.random() * 10
        positions[index * 3 + 2] = -2 - Math.random() * 18
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      rainDrops = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#b7d9dc', size: 0.055, transparent: true, opacity: 0.42 }))
      scene.add(rainDrops)
    }
    if (finishes.includes('stardust-ceiling')) {
      const positions = new Float32Array(140 * 3)
      for (let index = 0; index < 140; index += 1) {
        positions[index * 3] = (Math.random() - 0.5) * 20
        positions[index * 3 + 1] = 6.5 + Math.random() * 4
        positions[index * 3 + 2] = (Math.random() - 0.5) * 24
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#fff0bd', size: 0.08, transparent: true, opacity: 0.76 }))
      scene.add(stars)
    }

    const galleryGroup = new THREE.Group()
    room.add(galleryGroup)
    const interactive: Three.Object3D[] = []
    const videos: HTMLVideoElement[] = []
    const videoById = new Map<string, HTMLVideoElement>()
    photos.forEach((photo, index) => {
      const texture = artworkTexture(photo, index)
      const frame = new THREE.Group()
      const width = 2.4
      const height = 1.8
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.64, metalness: 0.02 }),
      )
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.18, height + 0.18, 0.14),
        new THREE.MeshStandardMaterial({ color: '#b77c49', roughness: 0.54, metalness: 0.1 }),
      )
      trim.position.z = -0.09
      frame.add(trim, plane)
      frame.userData.itemId = photo.id
      interactive.push(plane)
      plane.userData.itemId = photo.id
      const side = index % 2 === 0 ? 1 : -1
      const lane = Math.floor(index / 2)
      if (mode === 'float') {
        const angle = (index / Math.max(photos.length, 1)) * Math.PI * 2
        frame.position.set(Math.cos(angle) * 4.2, 2.8 + Math.sin(angle * 1.7) * 1.25, Math.sin(angle) * 3.4)
        frame.rotation.y = -angle + Math.PI / 2
      } else if (mode === 'walk') {
        frame.position.set(side * 3.75, 2.65, 5.5 - lane * 3.45)
        frame.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2
      } else {
        const columns = Math.min(3, Math.max(1, photos.length))
        const column = index % columns
        const row = Math.floor(index / columns)
        frame.position.set((column - (columns - 1) / 2) * 3.15, 3.85 - row * 2.25, -7.72)
      }
      if (photo.url && photo.contentType === 'video/mp4') {
        const video = document.createElement('video')
        video.src = photo.url
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.preload = 'metadata'
        const videoTexture = new THREE.VideoTexture(video)
        videoTexture.colorSpace = THREE.SRGBColorSpace
        ownedTextures.add(videoTexture)
        videos.push(video)
        videoById.set(photo.id, video)
        ;(plane.material as Three.MeshStandardMaterial).map = videoTexture
        ;(plane.material as Three.MeshStandardMaterial).needsUpdate = true
        texture.dispose()
      } else if (photo.url) {
        textureLoader.load(photo.url, (loaded) => {
          loaded.colorSpace = THREE.SRGBColorSpace
          ownedTextures.add(loaded)
          ;(plane.material as Three.MeshStandardMaterial).map = loaded
          ;(plane.material as Three.MeshStandardMaterial).needsUpdate = true
          texture.dispose()
        })
      }
      galleryGroup.add(frame)
    })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const keys = new Set<string>()
    const drag = { active: false, x: 0, yaw: 0 }
    const auto = { active: false }
    const onPointerDown = (event: PointerEvent) => { drag.active = true; drag.x = event.clientX }
    const onPointerUp = () => { drag.active = false }
    const onPointerMove = (event: PointerEvent) => {
      if (drag.active && mode === 'walk') {
        drag.yaw += (event.clientX - drag.x) * 0.004
        drag.x = event.clientX
      }
    }
    const onKeyDown = (event: KeyboardEvent) => { keys.add(event.key.toLowerCase()) }
    const onKeyUp = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()) }
    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(interactive, false)[0]
      if (hit?.object.userData.itemId) {
        const id = String(hit.object.userData.itemId)
        onSelect(id)
        const video = videoById.get(id)
        if (video) {
          if (video.paused) void video.play().catch(() => undefined)
          else video.pause()
        }
      }
    }
    const onWalkCommand = (event: Event) => {
      const command = String((event as CustomEvent).detail ?? '')
      if (command === 'entrance') { camera.position.set(0, 2.15, 7.2); drag.yaw = 0; auto.active = false; return }
      if (command === 'auto-on' || command === 'auto-off') { auto.active = command === 'auto-on'; return }
      if (command === 'next') {
        const current = Math.max(photos.findIndex((photo) => photo.id === selectionRef.current), -1)
        const next = photos[(current + 1) % Math.max(photos.length, 1)]
        if (next) { onSelect(next.id); camera.position.z = THREE.MathUtils.clamp(6.4 - Math.floor((current + 1) / 2) * 3.45, -5.2, 7.2) }
        return
      }
      const map: Record<string, string> = { forward: 'w', back: 's', left: 'a', right: 'd' }
      const key = map[command]
      if (key) { keys.add(key); window.setTimeout(() => keys.delete(key), 260) }
    }
    const onContextLost = (event: Event) => { event.preventDefault(); onFailure() }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('click', onClick)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('storyloom-walk', onWalkCommand)
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)

    const startedAt = performance.now()
    let frameId = 0
    const resize = () => {
      const width = mount.clientWidth || 1
      const height = mount.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()
    const animate = () => {
      const elapsed = (performance.now() - startedAt) / 1000
      if (rainDrops) {
        const positions = rainDrops.geometry.getAttribute('position') as Three.BufferAttribute
        for (let index = 0; index < positions.count; index += 1) {
          const nextY = positions.getY(index) - 0.075
          positions.setY(index, nextY < 0 ? 10 : nextY)
        }
        positions.needsUpdate = true
      }
      if (stars) (stars.material as Three.PointsMaterial).opacity = 0.62 + Math.sin(elapsed * 1.7) * 0.18
      if (mode === 'float') galleryGroup.rotation.y = elapsed * 0.075
      if (mode === 'walk') {
        const speed = 0.055
        const direction = new THREE.Vector3()
        const forward = new THREE.Vector3(-Math.sin(drag.yaw), 0, -Math.cos(drag.yaw))
        const right = new THREE.Vector3(Math.cos(drag.yaw), 0, -Math.sin(drag.yaw))
        if (keys.has('w') || keys.has('arrowup') || auto.active) direction.addScaledVector(forward, speed)
        if (keys.has('s') || keys.has('arrowdown')) direction.addScaledVector(forward, -speed)
        if (keys.has('a') || keys.has('arrowleft')) direction.addScaledVector(right, -speed)
        if (keys.has('d') || keys.has('arrowright')) direction.addScaledVector(right, speed)
        camera.position.x = THREE.MathUtils.clamp(camera.position.x + direction.x, -3.6, 3.6)
        camera.position.z = THREE.MathUtils.clamp(camera.position.z + direction.z, -5.4, 7.4)
        camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, drag.yaw, 0.08)
      } else {
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.025)
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, mode === 'room' ? 3.8 : 8.7, 0.035)
        camera.lookAt(0, 2.5, mode === 'room' ? -7.2 : 0)
      }
      interactive.forEach((object) => {
        const isSelected = object.userData.itemId === selectionRef.current
        const material = (object as Three.Mesh).material as Three.MeshStandardMaterial
        material.emissive.set(isSelected ? '#d8b17e' : '#000000')
        material.emissiveIntensity = isSelected ? 0.32 : 0
      })
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('storyloom-walk', onWalkCommand)
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      videos.forEach((video) => { video.pause(); video.removeAttribute('src'); video.load() })
      ownedTextures.forEach((texture) => texture.dispose())
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const material = object.material
          if (Array.isArray(material)) material.forEach((item) => item.dispose())
          else material.dispose()
        }
      })
    }
  }, [backgroundMode, backgroundUrl, finishes, mode, onFailure, onSelect, photos])

  return <div className="gallery-canvas" ref={mountRef} aria-label="Interactive three-dimensional gallery" />
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <div className="modal-card" role="dialog" aria-modal="true">{children}</div>
  </div>
}

function AuthModal({ onClose, onAuthed }: { onClose: () => void; onAuthed: (user: User) => void }) {
  const [isRegistering, setIsRegistering] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [addQuestions, setAddQuestions] = useState(false)
  const [addTotp, setAddTotp] = useState(false)
  const [question1, setQuestion1] = useState<string>(SECURITY_QUESTIONS[0])
  const [question2, setQuestion2] = useState<string>(SECURITY_QUESTIONS[1])
  const [answer1, setAnswer1] = useState('')
  const [answer2, setAnswer2] = useState('')
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')

  function finish(user?: User) {
    if (user) onAuthed(user)
    onClose()
  }

  async function prepareTotp() {
    setBusy(true); setError('')
    const response = await fetch('/api/auth/register/totp-setup', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username }),
    })
    const result = await response.json() as { secret?: string; uri?: string; error?: string }
    if (!response.ok || !result.secret || !result.uri) {
      setBusy(false); setError(result.error ?? 'Could not prepare the authenticator.'); return
    }
    setTotpSetup({ secret: result.secret, qr: await QRCode.toDataURL(result.uri, { width: 220, margin: 1 }) })
    setTotpCode(''); setBusy(false)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    if (isRegistering && addTotp && (!totpSetup || !/^\d{6}$/.test(totpCode))) {
      setBusy(false); setError('Prepare TOTP and enter its six-digit code before creating the account.'); return
    }
    const response = await fetch(isRegistering ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password, ...(isRegistering && addTotp && totpSetup ? { totpSecret: totpSetup.secret, totpCode } : {}) }),
    })
    const result = await response.json() as { user?: User; error?: string }
    if (!response.ok || !result.user) { setBusy(false); setError(result.error ?? 'Could not sign in.'); return }
    if (!isRegistering) { setBusy(false); finish(result.user); return }
    if (addQuestions) {
      const questionResponse = await fetch('/api/security/questions', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ question1, answer1, question2, answer2 }) })
      const questionResult = await questionResponse.json() as { error?: string }
      if (!questionResponse.ok) { setBusy(false); setError(questionResult.error ?? 'Your account was made, but recovery questions were not saved.'); return }
    }
    setBusy(false); finish(result.user)
  }
  return <Modal onClose={onClose}>
    <div className="modal-eyebrow">Your private rooms</div>
    <h2>{isRegistering ? 'Make a little room' : 'Welcome back'}</h2>
    <p className="modal-copy">Your chapters stay yours. Sign in when you want to save a new one.</p>
    <form onSubmit={submit} className="stack-form">
      <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" minLength={isRegistering ? 12 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegistering ? 'new-password' : 'current-password'} required />{isRegistering && <small className="field-help">12+ characters; use three of uppercase, lowercase, number, and symbol.</small>}</label>
      {isRegistering && <div className="signup-recovery">
        <label className="option-switch"><input type="checkbox" checked={addTotp} onChange={(event) => { setAddTotp(event.target.checked); setTotpSetup(null); setTotpCode('') }} /><span><strong>Authenticator recovery</strong><small>Optional · connect and verify before account creation</small></span></label>
        {addTotp && <div className="totp-setup">{totpSetup ? <><img src={totpSetup.qr} alt="Authenticator setup QR code" /><p>Scan now. Manual key: <code>{totpSetup.secret}</code></p><label>Six-digit code<input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" required /></label><button type="button" className="auth-secondary-action" onClick={() => void prepareTotp()} disabled={busy}>Generate a new key</button></> : <button type="button" className="button button-cream" onClick={() => void prepareTotp()} disabled={busy}>Prepare authenticator</button>}</div>}
        <label className="option-switch"><input type="checkbox" checked={addQuestions} onChange={(event) => setAddQuestions(event.target.checked)} /><span><strong>Two recovery questions</strong><small>Optional · the two answers must differ</small></span></label>
        {addQuestions && <div className="question-pair"><label>Question one<select value={question1} onChange={(event) => setQuestion1(event.target.value)}>{SECURITY_QUESTIONS.map((question) => <option value={question} key={question}>{question}</option>)}</select></label><label>Answer one<input value={answer1} onChange={(event) => setAnswer1(event.target.value)} minLength={3} required /></label><label>Question two<select value={question2} onChange={(event) => setQuestion2(event.target.value)}>{SECURITY_QUESTIONS.map((question) => <option value={question} key={question}>{question}</option>)}</select></label><label>Answer two<input value={answer2} onChange={(event) => setAnswer2(event.target.value)} minLength={3} required /></label></div>}
      </div>}
      {error && <p className="form-error">{error}</p>}
      <button className="button button-primary" disabled={busy}>{busy ? 'Opening…' : isRegistering ? 'Create account' : 'Enter my rooms'}</button>
    </form>
    <div className="auth-switches"><button className="auth-secondary-action" onClick={() => { setIsRegistering(!isRegistering); setError(''); setTotpSetup(null); setTotpCode('') }}>
      {isRegistering ? 'Already have a room? Sign in' : 'New here? Create an account'}
    </button>
    {!isRegistering && <Link className="auth-secondary-action" to="/recovery" onClick={onClose}>Forgot the password? Use recovery</Link>}</div>
  </Modal>
}

function csrfHeaders() {
  if (typeof document === 'undefined') return {} as Record<string, string>
  const token = document.cookie.split('; ').find((item) => item.startsWith('story_loom_csrf='))?.split('=')[1] ?? ''
  const headers: Record<string, string> = {}
  if (token) headers['x-csrf-token'] = decodeURIComponent(token)
  return headers
}

export default function StoryLoomApp({ initialChapterId }: { initialChapterId?: string }) {
  const [mode, setMode] = useState<ViewMode>('room')
  const [photos, setPhotos] = useState<Photo[]>(demoPhotos)
  const [selectedId, setSelectedId] = useState<string | null>(demoPhotos[0]?.id ?? null)
  const [user, setUser] = useState<User | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showFinishes, setShowFinishes] = useState(false)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterSubtitle, setChapterSubtitle] = useState('')
  const [cleanMetadata, setCleanMetadata] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(demoPhotos[0] ?? null)
  const [tier, setTier] = useState<'free' | 'memory' | 'studio'>('free')
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('night')
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [finishes, setFinishes] = useState<string[]>([])
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [draggedPendingId, setDraggedPendingId] = useState<string | null>(null)
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const backgroundRef = useRef<HTMLInputElement>(null)
  const activeModeLabel = useMemo(() => ({ room: 'Curated wall', float: 'Slow orbit', walk: 'First-person walk' }[mode]), [mode])
  const allowedBackgroundModes = useMemo<BackgroundMode[]>(() => tier === 'free' ? ['morning', 'night', 'afternoon'] : ['morning', 'night', 'twilight', 'afternoon', 'sunrise'], [tier])

  useEffect(() => {
    void fetch('/api/auth/me').then(async (response) => {
      if (!response.ok) return
      const result = await response.json() as { user?: User | null }
      if (result.user) { setUser(result.user); await Promise.all([loadChapters(), loadTier()]) }
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!user || !initialChapterId) return
    void fetch(`/api/chapters/${initialChapterId}`).then(async (response) => {
      if (!response.ok) return
      const result = await response.json() as { chapter?: Chapter; media?: Array<{ id: string; filename: string; caption?: string | null; url: string; content_type?: string; duration_seconds?: number | null }> }
      if (!result.chapter) return
      const loaded = (result.media ?? []).map((item) => ({ id: item.id, title: item.filename, caption: item.caption || (item.content_type === 'video/mp4' ? 'A moving moment from this chapter.' : 'A moment from this chapter.'), url: item.url, contentType: item.content_type, durationSeconds: item.duration_seconds }))
      setActiveChapter(result.chapter)
      setBackgroundMode(result.chapter.background_mode ?? 'night')
      setBackgroundUrl(result.chapter.background_url ?? null)
      setFinishes(result.chapter.finishes ?? [])
      setPhotos(loaded.length ? loaded : [{ id: 'empty', title: 'A room waiting for a moment', caption: 'Add a photo to begin.' }])
      setSelectedId(loaded[0]?.id ?? 'empty')
      setSelectedPhoto(loaded[0] ?? null)
    }).catch(() => setNotice('That room could not be opened.'))
  }, [initialChapterId, user])

  async function loadChapters() {
    const response = await fetch('/api/chapters')
    if (!response.ok) return
    const result = await response.json() as { chapters?: Chapter[] }
    setChapters(result.chapters ?? [])
  }

  async function loadTier() {
    const response = await fetch('/api/billing/status')
    if (!response.ok) return
    const result = await response.json() as { subscription?: { tier?: string } }
    const next = result.subscription?.tier
    setTier(next === 'studio' || next === 'memory' ? next : 'free')
  }

  async function openChapter(chapter: Chapter) {
    setLoading(true); setNotice('')
    const response = await fetch(`/api/chapters/${chapter.id}`)
    const result = await response.json() as { chapter?: Chapter; media?: Array<{ id: string; filename: string; caption?: string | null; url: string; content_type?: string; duration_seconds?: number | null }> }
    setLoading(false)
    if (!response.ok || !result.chapter) { setNotice('That room could not be opened.'); return }
    const loaded = (result.media ?? []).map((item) => ({ id: item.id, title: item.filename, caption: item.caption || (item.content_type === 'video/mp4' ? 'A moving moment from this chapter.' : 'A moment from this chapter.'), url: item.url, contentType: item.content_type, durationSeconds: item.duration_seconds }))
    setActiveChapter(result.chapter); setBackgroundMode(result.chapter.background_mode ?? 'night'); setBackgroundUrl(result.chapter.background_url ?? null); setFinishes(result.chapter.finishes ?? []); setPhotos(loaded.length ? loaded : [{ id: 'empty', title: 'A room waiting for a moment', caption: 'Add a photo to begin.' }]); setSelectedId(loaded[0]?.id ?? 'empty'); setSelectedPhoto(loaded[0] ?? null)
  }

  async function createChapter(event: React.FormEvent) {
    event.preventDefault(); setLoading(true)
    const response = await fetch('/api/chapters', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ title: chapterTitle, subtitle: chapterSubtitle }) })
    const result = await response.json() as { chapter?: Chapter; error?: string }
    setLoading(false)
    if (!response.ok || !result.chapter) { setNotice(result.error ?? 'Could not create that room.'); return }
    setChapters((current) => [result.chapter as Chapter, ...current]); setShowCreate(false); setChapterTitle(''); setChapterSubtitle(''); await openChapter(result.chapter)
  }

  function stageFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!activeChapter || files.length === 0) return
    const allowed = new Set(['image/png', 'image/webp', 'image/gif', 'video/mp4'])
    const accepted = files.slice(0, 20).filter((file) => allowed.has(file.type) && file.size <= (file.type === 'video/mp4' ? 25 : 5) * 1024 * 1024)
    if (accepted.length !== files.length) setNotice('Some files were skipped. Use PNG, WebP, GIF (5 MB) or MP4 (25 MB, 30 seconds).')
    setPendingUploads(accepted.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) })))
    setUploadProgress(0)
    event.target.value = ''
  }

  function closeUploadPreview() {
    pendingUploads.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setPendingUploads([]); setUploadProgress(0)
  }

  function movePending(fromId: string, toId: string) {
    setPendingUploads((current) => {
      const from = current.findIndex((item) => item.id === fromId); const to = current.findIndex((item) => item.id === toId)
      if (from < 0 || to < 0 || from === to) return current
      const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next
    })
  }

  async function confirmUploads() {
    if (!activeChapter || pendingUploads.length === 0) return
    setLoading(true); setNotice('')
    for (let index = 0; index < pendingUploads.length; index += 1) {
      const file = pendingUploads[index].file
      const form = new FormData(); form.set('chapterId', activeChapter.id); form.set('file', file); form.set('cleanMetadata', String(cleanMetadata))
      const response = await fetch('/api/media', { method: 'POST', headers: csrfHeaders(), body: form })
      if (!response.ok) { const result = await response.json() as { error?: string }; setNotice(result.error ?? 'One photo could not be added.'); break }
      setUploadProgress(index + 1)
    }
    closeUploadPreview(); setLoading(false); await openChapter(activeChapter)
  }

  async function savePhotoOrder(next: Photo[]) {
    if (!activeChapter || next.some((photo) => photo.id === 'empty')) return
    const previous = photos
    setPhotos(next); setSelectedPhoto(next.find((photo) => photo.id === selectedId) ?? next[0] ?? null)
    const response = await fetch(`/api/chapters/${activeChapter.id}/media/order`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ mediaIds: next.map((photo) => photo.id) }) })
    if (!response.ok) { setPhotos(previous); setSelectedPhoto(previous.find((photo) => photo.id === selectedId) ?? previous[0] ?? null); const result = await response.json() as { error?: string }; setNotice(result.error ?? 'That order could not be saved.') }
    else setNotice('Memory order saved across Room, Orbit and Walk.')
  }

  function movePhoto(fromId: string, toId: string) {
    const from = photos.findIndex((photo) => photo.id === fromId); const to = photos.findIndex((photo) => photo.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...photos]; const [item] = next.splice(from, 1); next.splice(to, 0, item); void savePhotoOrder(next)
  }

  async function checkoutFinish(product: string) {
    if (!activeChapter) return
    setLoading(true); setNotice('')
    const response = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ product, chapterId: activeChapter.id }) })
    const result = await response.json() as { url?: string; error?: string }
    setLoading(false)
    if (result.url) window.location.assign(result.url)
    else setNotice(result.error ?? 'Checkout is not ready yet.')
  }

  async function changeBackgroundMode(next: BackgroundMode) {
    if (!allowedBackgroundModes.includes(next)) return
    const previous = backgroundMode
    setBackgroundMode(next)
    if (!activeChapter || !user) return
    const response = await fetch(`/api/chapters/${activeChapter.id}/background`, { method: 'PUT', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ mode: next }) })
    if (!response.ok) { setBackgroundMode(previous); const result = await response.json() as { error?: string }; setNotice(result.error ?? 'That atmosphere could not be saved.') }
  }

  async function uploadBackground(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !activeChapter || tier !== 'studio') return
    setLoading(true); setNotice('')
    const form = new FormData(); form.set('file', file)
    const response = await fetch(`/api/chapters/${activeChapter.id}/background`, { method: 'POST', headers: csrfHeaders(), body: form })
    const result = await response.json() as { url?: string; error?: string }
    setLoading(false); event.target.value = ''
    if (!response.ok || !result.url) { setNotice(result.error ?? 'That background could not be placed.'); return }
    setBackgroundUrl(result.url); setNotice('Background replaced. The previous image was removed.')
  }

  async function clearBackground() {
    if (!activeChapter) return
    setLoading(true)
    const response = await fetch(`/api/chapters/${activeChapter.id}/background`, { method: 'DELETE', headers: csrfHeaders() })
    setLoading(false)
    if (!response.ok) { setNotice('That background could not be removed.'); return }
    setBackgroundUrl(null); setBackgroundMode('night')
  }

  async function signOut() { await fetch('/api/auth/logout', { method: 'POST', headers: csrfHeaders() }); setUser(null); setTier('free'); setChapters([]); setActiveChapter(null); setBackgroundMode('night'); setBackgroundUrl(null); setFinishes([]); setPhotos(demoPhotos); setSelectedId(demoPhotos[0]?.id ?? null); setNotice('Back to the little demo room.') }

  const selectedPhotoChanged = useCallback((id: string) => { setSelectedId(id); setSelectedPhoto(photos.find((photo) => photo.id === id) ?? null) }, [photos])

  return <div className="loom-app">
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuthed={(nextUser) => { setUser(nextUser); void Promise.all([loadChapters(), loadTier()]) }} />}
    {showCreate && <Modal onClose={() => setShowCreate(false)}>
      <div className="modal-eyebrow">New chapter</div><h2>Give the room a feeling</h2><p className="modal-copy">A simple title is enough. You can let the photos do the remembering.</p>
      <form onSubmit={createChapter} className="stack-form"><label>Chapter title<input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} placeholder="A weekend by the sea" required /></label><label>Small note<input value={chapterSubtitle} onChange={(event) => setChapterSubtitle(event.target.value)} placeholder="The kind of day I want to keep" /></label><button className="button button-primary" disabled={loading}>{loading ? 'Making room…' : 'Create chapter'}</button></form>
    </Modal>}
    {pendingUploads.length > 0 && <Modal onClose={() => { if (!loading) closeUploadPreview() }}>
      <div className="modal-eyebrow">Arrange before upload</div><h2>Set the chapter rhythm.</h2><p className="modal-copy">Drag the memories into order. This same order appears in Room, Orbit and Walk. {cleanMetadata ? 'Image metadata will be cleaned.' : 'Image metadata cleaning is off.'}</p>
      <div className="upload-preview-list">{pendingUploads.map((item, index) => <div key={item.id} className="upload-preview-item" draggable={!loading} onDragStart={() => setDraggedPendingId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedPendingId) movePending(draggedPendingId, item.id); setDraggedPendingId(null) }}>
        {item.file.type === 'video/mp4' ? <video src={item.previewUrl} muted /> : <img src={item.previewUrl} alt="" />}<span><small>{String(index + 1).padStart(2, '0')}</small><strong>{item.file.name}</strong><em>{(item.file.size / 1024 / 1024).toFixed(1)} MB</em></span><div><button type="button" aria-label={`Move ${item.file.name} earlier`} disabled={loading || index === 0} onClick={() => movePending(item.id, pendingUploads[index - 1].id)}>←</button><button type="button" aria-label={`Move ${item.file.name} later`} disabled={loading || index === pendingUploads.length - 1} onClick={() => movePending(item.id, pendingUploads[index + 1].id)}>→</button></div>
      </div>)}</div>
      {loading && <p className="upload-progress">Placing {uploadProgress} of {pendingUploads.length}…</p>}<div className="modal-actions"><button type="button" className="button button-ghost" disabled={loading} onClick={closeUploadPreview}>Cancel</button><button type="button" className="button button-primary" disabled={loading} onClick={() => void confirmUploads()}>{loading ? 'Placing…' : `Upload ${pendingUploads.length} memories`}</button></div>
    </Modal>}
    {showFinishes && activeChapter && <Modal onClose={() => setShowFinishes(false)}><div className="modal-eyebrow">Permanent chapter finish</div><h2>Give this room its atmosphere.</h2><p className="modal-copy">One payment attaches the finish to “{activeChapter.title}”. Returning to the chapter never costs again.</p><div className="finish-picker">{chapterFinishes.map(([code, name, price, copy]) => <button key={code} type="button" onClick={() => void checkoutFinish(code)} disabled={loading}><span><strong>{name}</strong><small>{copy}</small></span><em>{price}</em></button>)}</div>{notice && <p className="notice">{notice}</p>}</Modal>}
    <AppHeader authenticated={Boolean(user)} username={user?.username} onSignIn={user ? undefined : () => setShowAuth(true)} onSignOut={user ? () => void signOut() : undefined} />
    <main>
      <section className="hero-section page-wrap">
        <div className="hero-copy">
          <div className="eyebrow">Your life, on its own red carpet</div>
          <h1>Keep the glow<br /><em>of every chapter.</em></h1>
          <p>Turn the moments you already have into a room you can return to. No arranging files. No learning a tool. Just bring the light in.</p>
          <div className="hero-actions"><button className="button button-primary" onClick={() => user ? setShowCreate(true) : setShowAuth(true)}>Start a chapter <span>↗</span></button><a className="quiet-link" href="#room">Walk through the example <span>↓</span></a></div>
        </div>
        <div className="hero-note"><span>01</span><p>Some memories<br />deserve a little<br /><strong>more atmosphere.</strong></p></div>
      </section>

      <section id="room" className="room-section page-wrap">
        <div className="room-heading"><div><div className="eyebrow">The room is open</div><h2>{activeChapter?.title ?? 'A little light from the way home'}</h2><p>{activeChapter?.subtitle ?? 'A demo chapter, made for wandering.'}</p></div><div className="room-meta"><span>{photos.length} scenes</span><span className="meta-divider">·</span><span>{activeModeLabel}</span></div></div>
        <div className="room-stage"><GalleryCanvas photos={photos} mode={mode} backgroundMode={backgroundMode} backgroundUrl={backgroundUrl} finishes={finishes} selectedId={selectedId} onSelect={selectedPhotoChanged} /><div className="stage-glow" /><div className="stage-caption"><span className="caption-line" /> <span>{mode === 'walk' ? 'WASD / arrows to walk · drag to look' : 'Select a frame to linger'}</span></div></div>
        <div className="room-controls"><div><div className="mode-switch" aria-label="Gallery view mode">{(['room', 'float', 'walk'] as ViewMode[]).map((item) => <button type="button" key={item} className={mode === item ? 'is-active' : ''} onClick={() => setMode(item)}>{item === 'room' ? 'Room wall' : item === 'float' ? 'Orbit' : 'Walk inside'}</button>)}</div><p className="mode-help">{mode === 'room' ? 'See the whole chapter as a composed exhibition wall.' : mode === 'float' ? 'Let memories circle slowly in a weightless constellation.' : 'Move through a corridor with WASD or arrow keys; drag to look around.'}</p></div><div className="room-tools">{activeChapter && <><div className="atmosphere-controls"><label>Room light<select value={backgroundMode} onChange={(event) => void changeBackgroundMode(event.target.value as BackgroundMode)}>{allowedBackgroundModes.map((item) => <option key={item} value={item}>{backgroundLabels[item]}</option>)}</select></label>{tier === 'studio' && <><input ref={backgroundRef} type="file" accept=".png,.webp,.gif,image/png,image/webp,image/gif" hidden onChange={(event) => void uploadBackground(event)} /><button type="button" className="button button-ghost" onClick={() => backgroundRef.current?.click()} disabled={loading}>{backgroundUrl ? 'Replace room image' : 'Use room image'}</button>{backgroundUrl && <button type="button" className="text-button" onClick={() => void clearBackground()} disabled={loading}>Use gradient</button>}</>}</div><label className="clean-toggle"><input type="checkbox" checked={cleanMetadata} onChange={(event) => setCleanMetadata(event.target.checked)} /> Clean image metadata</label><input ref={uploadRef} type="file" accept=".png,.webp,.gif,.mp4,image/png,image/webp,image/gif,video/mp4" multiple hidden onChange={stageFiles} /><button type="button" className="button button-cream" onClick={() => uploadRef.current?.click()} disabled={loading}>{loading ? 'Placing…' : '+ Add memories'}</button><button type="button" className="button button-ghost" onClick={() => setShowFinishes(true)}>Add atmosphere</button></>}{notice && <span className="notice">{notice}</span>}</div></div>
      </section>

      <section className="story-section page-wrap"><div className="story-intro"><div className="eyebrow">One room, many ways back</div><h2>A gallery that waits<br />for your next mood.</h2></div><div className="story-grid"><article><span className="story-number">01</span><h3>Collect gently</h3><p>Drop in a few photos. Story Loom makes the room, the rhythm, and the little pause between each scene.</p></article><article><span className="story-number">02</span><h3>Wander slowly</h3><p>Choose a calm orbit or walk the walls. The gallery is made to be visited, not completed.</p></article><article><span className="story-number">03</span><h3>Keep it yours</h3><p>Your chapters live behind your account. There is no public feed asking you to perform your memories.</p></article></div></section>

      {user && <section className="chapters-section page-wrap"><div className="room-heading"><div><div className="eyebrow">Your rooms</div><h2>Return whenever you like.</h2></div><button className="button button-primary" onClick={() => setShowCreate(true)}>+ New chapter</button></div>{chapters.length === 0 ? <div className="empty-state">Your first chapter is one small upload away.</div> : <div className="chapter-list">{chapters.map((chapter) => <Link key={chapter.id} className={`chapter-row ${activeChapter?.id === chapter.id ? 'is-active' : ''}`} to="/chapters/$chapterId" params={{ chapterId: chapter.id }}><span><strong>{chapter.title}</strong><small>{chapter.subtitle}</small></span><span>Open ↗</span></Link>)}</div>}</section>}

      {selectedPhoto && <section className="linger-wrap page-wrap"><div className="linger-section"><div className="linger-mark">✦</div><div><div className="eyebrow">A moment to linger</div><h2>{selectedPhoto.title}</h2><p>{selectedPhoto.caption}</p></div><span className="linger-count">{String(Math.max(photos.findIndex((photo) => photo.id === selectedPhoto.id) + 1, 1)).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}</span></div><div className="memory-ribbon" aria-label="All memories in this chapter">{photos.map((photo, index) => <div key={photo.id} className={`ribbon-card ${photo.id === selectedPhoto.id ? 'is-active' : ''}`} draggable={Boolean(activeChapter && photo.id !== 'empty')} onDragStart={() => setDraggedPhotoId(photo.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedPhotoId) movePhoto(draggedPhotoId, photo.id); setDraggedPhotoId(null) }}><button type="button" className="ribbon-select" onClick={() => selectedPhotoChanged(photo.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{photo.title}</strong></button>{activeChapter && photo.id !== 'empty' && <div className="ribbon-order"><button type="button" disabled={index === 0} aria-label={`Move ${photo.title} earlier`} onClick={() => movePhoto(photo.id, photos[index - 1].id)}>←</button><button type="button" disabled={index === photos.length - 1} aria-label={`Move ${photo.title} later`} onClick={() => movePhoto(photo.id, photos[index + 1].id)}>→</button></div>}</div>)}</div></section>}
    </main>
    <footer className="loom-footer page-wrap"><span>story loom · made for the moments that stay</span><span>v1 · your private gallery</span></footer>
  </div>
}
