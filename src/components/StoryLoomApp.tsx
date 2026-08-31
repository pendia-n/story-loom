import * as THREE from 'three'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ThemeToggle from './ThemeToggle'

type ViewMode = 'room' | 'float' | 'walk'

type Photo = {
  id: string
  title: string
  caption: string
  url?: string
  filename?: string
  contentType?: string
  durationSeconds?: number | null
}

type Chapter = {
  id: string
  title: string
  subtitle: string
  created_at?: string
  updated_at?: string
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

function GalleryCanvas({ photos, mode, selectedId, onSelect }: {
  photos: Photo[]
  mode: ViewMode
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef(selectedId)
  selectionRef.current = selectedId

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#091b17')
    scene.fog = new THREE.Fog('#091b17', 10, 30)
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 100)
    camera.position.set(0, 2.15, 8.7)
    camera.lookAt(0, 2, 0)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    mount.appendChild(renderer.domElement)

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
    scene.add(new THREE.HemisphereLight('#f2d5a0', '#0b211c', 1.55))
    const keyLight = new THREE.PointLight('#f6c989', 35, 22, 2)
    keyLight.position.set(0, 8, 2)
    scene.add(keyLight)
    const fillLight = new THREE.PointLight('#6db8b2', 18, 18, 2)
    fillLight.position.set(-6, 3, 3)
    scene.add(fillLight)

    const galleryGroup = new THREE.Group()
    room.add(galleryGroup)
    const interactive: THREE.Object3D[] = []
    const textureLoader = new THREE.TextureLoader()
    const ownedTextures = new Set<THREE.Texture>()
    const videos: HTMLVideoElement[] = []
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
      } else {
        frame.position.set(side * 4.6, 2.8, 5.7 - lane * 3.7)
        frame.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2
      }
      if (photo.url && photo.contentType === 'video/mp4') {
        const video = document.createElement('video')
        video.src = photo.url
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.preload = 'metadata'
        void video.play().catch(() => undefined)
        const videoTexture = new THREE.VideoTexture(video)
        videoTexture.colorSpace = THREE.SRGBColorSpace
        ownedTextures.add(videoTexture)
        videos.push(video)
        ;(plane.material as THREE.MeshStandardMaterial).map = videoTexture
        ;(plane.material as THREE.MeshStandardMaterial).needsUpdate = true
        texture.dispose()
      } else if (photo.url) {
        textureLoader.load(photo.url, (loaded) => {
          loaded.colorSpace = THREE.SRGBColorSpace
          ownedTextures.add(loaded)
          ;(plane.material as THREE.MeshStandardMaterial).map = loaded
          ;(plane.material as THREE.MeshStandardMaterial).needsUpdate = true
          texture.dispose()
        })
      }
      galleryGroup.add(frame)
    })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const keys = new Set<string>()
    const drag = { active: false, x: 0, yaw: 0 }
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
      if (hit?.object.userData.itemId) onSelect(String(hit.object.userData.itemId))
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('click', onClick)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

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
      if (mode === 'float') galleryGroup.rotation.y = elapsed * 0.075
      if (mode === 'walk') {
        const speed = 0.055
        const direction = new THREE.Vector3()
        if (keys.has('w') || keys.has('arrowup')) direction.z -= speed
        if (keys.has('s') || keys.has('arrowdown')) direction.z += speed
        if (keys.has('a') || keys.has('arrowleft')) direction.x -= speed
        if (keys.has('d') || keys.has('arrowright')) direction.x += speed
        camera.position.x = THREE.MathUtils.clamp(camera.position.x + direction.x, -3.6, 3.6)
        camera.position.z = THREE.MathUtils.clamp(camera.position.z + direction.z, -5.4, 7.4)
        camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, drag.yaw, 0.08)
      } else {
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.025)
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, 8.7, 0.025)
        camera.lookAt(0, 2.5, 0)
      }
      interactive.forEach((object) => {
        const isSelected = object.userData.itemId === selectionRef.current
        const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial
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
  }, [mode, onSelect, photos])

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
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const response = await fetch(isRegistering ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
    })
    const result = await response.json() as { user?: User; error?: string }
    setBusy(false)
    if (!response.ok || !result.user) { setError(result.error ?? 'Could not sign in.'); return }
    onAuthed(result.user); onClose()
  }
  return <Modal onClose={onClose}>
    <div className="modal-eyebrow">Your private rooms</div>
    <h2>{isRegistering ? 'Make a little room' : 'Welcome back'}</h2>
    <p className="modal-copy">Your chapters stay yours. Sign in when you want to save a new one.</p>
    <form onSubmit={submit} className="stack-form">
      <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegistering ? 'new-password' : 'current-password'} required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="button button-primary" disabled={busy}>{busy ? 'Opening…' : isRegistering ? 'Create account' : 'Enter my rooms'}</button>
    </form>
    <button className="text-button" onClick={() => { setIsRegistering(!isRegistering); setError('') }}>
      {isRegistering ? 'Already have a room? Sign in' : 'New here? Create an account'}
    </button>
    {!isRegistering && <Link className="text-button" to="/recovery" onClick={onClose}>Forgot the password? Use recovery</Link>}
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
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterSubtitle, setChapterSubtitle] = useState('')
  const [cleanMetadata, setCleanMetadata] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(demoPhotos[0] ?? null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const activeModeLabel = useMemo(() => ({ room: 'Gallery room', float: 'Slow orbit', walk: 'Walk view' }[mode]), [mode])

  useEffect(() => {
    void fetch('/api/auth/me').then(async (response) => {
      if (!response.ok) return
      const result = await response.json() as { user?: User | null }
      if (result.user) { setUser(result.user); await loadChapters() }
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!user || !initialChapterId) return
    void fetch(`/api/chapters/${initialChapterId}`).then(async (response) => {
      if (!response.ok) return
      const result = await response.json() as { chapter?: Chapter; media?: Array<{ id: string; filename: string; url: string; content_type?: string; duration_seconds?: number | null }> }
      if (!result.chapter) return
      const loaded = (result.media ?? []).map((item) => ({ id: item.id, title: item.filename, caption: item.content_type === 'video/mp4' ? 'A moving moment from this chapter.' : 'A moment from this chapter.', url: item.url, contentType: item.content_type, durationSeconds: item.duration_seconds }))
      setActiveChapter(result.chapter)
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

  async function openChapter(chapter: Chapter) {
    setLoading(true); setNotice('')
    const response = await fetch(`/api/chapters/${chapter.id}`)
    const result = await response.json() as { chapter?: Chapter; media?: Array<{ id: string; filename: string; url: string; content_type?: string; duration_seconds?: number | null }> }
    setLoading(false)
    if (!response.ok || !result.chapter) { setNotice('That room could not be opened.'); return }
    const loaded = (result.media ?? []).map((item) => ({ id: item.id, title: item.filename, caption: item.content_type === 'video/mp4' ? 'A moving moment from this chapter.' : 'A moment from this chapter.', url: item.url, contentType: item.content_type, durationSeconds: item.duration_seconds }))
    setActiveChapter(result.chapter); setPhotos(loaded.length ? loaded : [{ id: 'empty', title: 'A room waiting for a moment', caption: 'Add a photo to begin.' }]); setSelectedId(loaded[0]?.id ?? 'empty'); setSelectedPhoto(loaded[0] ?? null)
  }

  async function createChapter(event: React.FormEvent) {
    event.preventDefault(); setLoading(true)
    const response = await fetch('/api/chapters', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ title: chapterTitle, subtitle: chapterSubtitle }) })
    const result = await response.json() as { chapter?: Chapter; error?: string }
    setLoading(false)
    if (!response.ok || !result.chapter) { setNotice(result.error ?? 'Could not create that room.'); return }
    setChapters((current) => [result.chapter as Chapter, ...current]); setShowCreate(false); setChapterTitle(''); setChapterSubtitle(''); await openChapter(result.chapter)
  }

  async function uploadFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!activeChapter || files.length === 0) return
    setLoading(true); setNotice('')
    for (const file of files) {
      const form = new FormData(); form.set('chapterId', activeChapter.id); form.set('file', file); form.set('cleanMetadata', String(cleanMetadata))
      const response = await fetch('/api/media', { method: 'POST', headers: csrfHeaders(), body: form })
      if (!response.ok) { const result = await response.json() as { error?: string }; setNotice(result.error ?? 'One photo could not be added.'); break }
    }
    setLoading(false); if (uploadRef.current) uploadRef.current.value = ''; await openChapter(activeChapter)
  }

  async function signOut() { await fetch('/api/auth/logout', { method: 'POST', headers: csrfHeaders() }); setUser(null); setChapters([]); setActiveChapter(null); setPhotos(demoPhotos); setSelectedId(demoPhotos[0]?.id ?? null); setNotice('Back to the little demo room.') }

  const selectedPhotoChanged = useCallback((id: string) => { setSelectedId(id); setSelectedPhoto(photos.find((photo) => photo.id === id) ?? null) }, [photos])

  return <div className="loom-app">
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuthed={(nextUser) => { setUser(nextUser); void loadChapters() }} />}
    {showCreate && <Modal onClose={() => setShowCreate(false)}>
      <div className="modal-eyebrow">New chapter</div><h2>Give the room a feeling</h2><p className="modal-copy">A simple title is enough. You can let the photos do the remembering.</p>
      <form onSubmit={createChapter} className="stack-form"><label>Chapter title<input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} placeholder="A weekend by the sea" required /></label><label>Small note<input value={chapterSubtitle} onChange={(event) => setChapterSubtitle(event.target.value)} placeholder="The kind of day I want to keep" /></label><button className="button button-primary" disabled={loading}>{loading ? 'Making room…' : 'Create chapter'}</button></form>
    </Modal>}
    <header className="loom-header">
      <a className="wordmark" href="/" aria-label="Story Loom home"><span className="wordmark-mark">✦</span> story loom</a>
      <nav className="app-tabs" aria-label="Story Loom sections"><Link to="/app">Rooms</Link>{user && <><Link to="/profile">Profile</Link><Link to="/security">Security</Link><Link to="/pricing">Plans</Link></>}</nav>
      <div className="header-actions">
        <span className="header-status"><span className="status-dot" /> {user ? `@${user.username}` : 'A quiet place for your life'}</span>
        <ThemeToggle />
        {user ? <button className="button button-ghost" onClick={() => void signOut()}>Sign out</button> : <button className="button button-ghost" onClick={() => setShowAuth(true)}>Sign in</button>}
      </div>
    </header>
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
        <div className="room-stage"><GalleryCanvas photos={photos} mode={mode} selectedId={selectedId} onSelect={selectedPhotoChanged} /><div className="stage-glow" /><div className="stage-caption"><span className="caption-line" /> <span>{mode === 'walk' ? 'WASD / arrows to walk · drag to look' : 'Select a frame to linger'}</span></div></div>
        <div className="room-controls"><div className="mode-switch" aria-label="Gallery view mode">{(['room', 'float', 'walk'] as ViewMode[]).map((item) => <button type="button" key={item} className={mode === item ? 'is-active' : ''} onClick={() => setMode(item)}>{item === 'room' ? 'Room' : item === 'float' ? 'Orbit' : 'Walk view'}</button>)}</div><div className="room-tools">{activeChapter && <><label className="clean-toggle"><input type="checkbox" checked={cleanMetadata} onChange={(event) => setCleanMetadata(event.target.checked)} /> Clean image metadata</label><input ref={uploadRef} type="file" accept=".png,.webp,.gif,.mp4,image/png,image/webp,image/gif,video/mp4" multiple hidden onChange={(event) => void uploadFiles(event)} /><button type="button" className="button button-cream" onClick={() => uploadRef.current?.click()} disabled={loading}>{loading ? 'Placing…' : '+ Add memories'}</button></>}{notice && <span className="notice">{notice}</span>}</div></div>
      </section>

      <section className="story-section page-wrap"><div className="story-intro"><div className="eyebrow">One room, many ways back</div><h2>A gallery that waits<br />for your next mood.</h2></div><div className="story-grid"><article><span className="story-number">01</span><h3>Collect gently</h3><p>Drop in a few photos. Story Loom makes the room, the rhythm, and the little pause between each scene.</p></article><article><span className="story-number">02</span><h3>Wander slowly</h3><p>Choose a calm orbit or walk the walls. The gallery is made to be visited, not completed.</p></article><article><span className="story-number">03</span><h3>Keep it yours</h3><p>Your chapters live behind your account. There is no public feed asking you to perform your memories.</p></article></div></section>

      {user && <section className="chapters-section page-wrap"><div className="room-heading"><div><div className="eyebrow">Your rooms</div><h2>Return whenever you like.</h2></div><button className="button button-primary" onClick={() => setShowCreate(true)}>+ New chapter</button></div>{chapters.length === 0 ? <div className="empty-state">Your first chapter is one small upload away.</div> : <div className="chapter-list">{chapters.map((chapter) => <Link key={chapter.id} className={`chapter-row ${activeChapter?.id === chapter.id ? 'is-active' : ''}`} to="/chapters/$chapterId" params={{ chapterId: chapter.id }}><span><strong>{chapter.title}</strong><small>{chapter.subtitle}</small></span><span>Open ↗</span></Link>)}</div>}</section>}

      {selectedPhoto && <section className="linger-section page-wrap"><div className="linger-mark">✦</div><div><div className="eyebrow">A moment to linger</div><h2>{selectedPhoto.title}</h2><p>{selectedPhoto.caption}</p></div><span className="linger-count">{String(Math.max(photos.findIndex((photo) => photo.id === selectedPhoto.id) + 1, 1)).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}</span></section>}
    </main>
    <footer className="loom-footer page-wrap"><span>story loom · made for the moments that stay</span><span>v1 · your private gallery</span></footer>
  </div>
}
