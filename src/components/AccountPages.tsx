import QRCode from 'qrcode'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import AppHeader from './AppHeader'
import { SECURITY_QUESTIONS } from '../lib/security-questions'

type User = { id: string; username: string }
type SecurityStatus = { totpEnabled: boolean; questionsEnabled: boolean; questions: string[] }

const tiers = [
  { code: 'free', name: 'Keepsake', price: '$0', cadence: 'forever', features: ['1 chapter', '12 images + 1 short video / chapter', '3 Quiet Editor moments / month', 'Room wall, Orbit, and Walk · 3 room lights'] },
  { code: 'memory', name: 'Memory', price: '$5', cadence: 'per month · $48/year', features: ['12 chapters', '60 images + 3 short videos / chapter', '30 Quiet Editor moments / month', 'All five gradient room lights'] },
  { code: 'studio', name: 'Studio', price: '$12', cadence: 'per month · $108/year', features: ['50 chapters', '120 images + 8 short videos / chapter', '150 Quiet Editor moments / month', 'All five lights + replaceable custom background'] },
]

const studioAddons = [
  ['studio-chapter', '+1 chapter', '$5', 'Studio only · opens one more chapter'],
  ['studio-images-50', '+50 images / chapter', '$3', 'Studio only · added to every chapter'],
  ['studio-videos-15', '+15 short videos / chapter', '$2.50', 'Studio only · added to every chapter'],
  ['studio-editor-100', '+100 Quiet Editor moments', '$1', 'Studio only · added to this month’s allowance'],
]

const aiMenu = [
  ['Title polish', 'text → text'], ['Caption polish', 'text → text'], ['Memory thread', 'text → text'],
  ['Mood palette', 'image → text'], ['Scene ordering', 'images → structure'], ['Cover choice', 'images → ranking'],
  ['Chapter narration', 'images + text → story'], ['Accessible alt text', 'image → text'], ['Future postcard', 'images + text → letter'],
]

function csrfHeaders() {
  if (typeof document === 'undefined') return {} as Record<string, string>
  const token = document.cookie.split('; ').find((item) => item.startsWith('story_loom_csrf='))?.split('=')[1] ?? ''
  return token ? { 'x-csrf-token': decodeURIComponent(token) } : {}
}

function Page({ children, authenticated = false }: { children: React.ReactNode; authenticated?: boolean }) {
  return <div className="loom-app">
    <AppHeader authenticated={authenticated} />
    {children}
    <footer className="loom-footer page-wrap"><span>story loom · made for the moments that stay</span><span>private by default · no charge to look back</span></footer>
  </div>
}

async function getUser() {
  const response = await fetch('/api/auth/me')
  if (!response.ok) return null
  return ((await response.json()) as { user?: User | null }).user ?? null
}

export function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const [billing, setBilling] = useState<{ subscription?: { tier?: string; status?: string }; purchases?: Array<{ product_code: string }> } | null>(null)
  useEffect(() => { void getUser().then((next) => {
    setChecked(true); setUser(next)
    if (!next) return window.location.replace('/app')
    void fetch('/api/billing/status').then((response) => response.ok ? response.json() : null).then((value) => setBilling(value as typeof billing)).catch(() => undefined)
  }) }, [])
  return <Page authenticated={Boolean(user)}><main className="account-page page-wrap">
    {!checked || !user ? <p className="account-copy">Opening your profile…</p> : <>
      <div className="eyebrow">Your profile</div><h1>Keep the room yours.</h1>
      <div className="account-grid">
        <section className="account-card"><span className="card-label">Username</span><h2>@{user.username}</h2><p>Your gallery is private unless you deliberately create a share.</p><Link className="button button-primary" to="/security">Open security</Link></section>
        <section className="account-card"><span className="card-label">Plan</span><h2>{billing?.subscription?.tier ?? 'Keepsake'}</h2><p>{billing?.subscription?.status ?? 'Free plan'} · {billing?.purchases?.length ?? 0} permanent add-ons</p><Link className="button button-cream" to="/pricing">View pricing</Link></section>
      </div>
    </>}
  </main></Page>
}

export function SecurityPage() {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null)
  const [code, setCode] = useState(''); const [password, setPassword] = useState('')
  const [question1, setQuestion1] = useState(''); const [answer1, setAnswer1] = useState('')
  const [question2, setQuestion2] = useState(''); const [answer2, setAnswer2] = useState('')
  const [notice, setNotice] = useState('')
  async function refresh() {
    const next = await getUser(); setChecked(true); setUser(next)
    if (!next) return window.location.replace('/recovery')
    const response = await fetch('/api/security/status')
    if (response.ok) {
      const result = await response.json() as SecurityStatus
      setStatus(result)
      setQuestion1(result.questions[0] ?? SECURITY_QUESTIONS[0])
      setQuestion2(result.questions[1] ?? SECURITY_QUESTIONS[1])
    }
  }
  useEffect(() => { void refresh() }, [])
  async function startTotp() {
    const response = await fetch('/api/security/totp/setup', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() } })
    const result = await response.json() as { secret?: string; uri?: string; error?: string }
    if (!response.ok || !result.secret || !result.uri) return setNotice(result.error ?? 'Could not start authenticator setup.')
    setSetup({ secret: result.secret, uri: result.uri, qr: await QRCode.toDataURL(result.uri, { width: 220, margin: 1 }) })
  }
  async function enableTotp(event: React.FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/security/totp/enable', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ code }) })
    const result = await response.json() as { error?: string }
    setNotice(response.ok ? 'Authenticator recovery is on.' : result.error ?? 'Could not enable authenticator.')
    if (response.ok) { setSetup(null); setCode(''); await refresh() }
  }
  async function disableTotp() {
    const response = await fetch('/api/security/totp/disable', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ code }) })
    const result = await response.json() as { error?: string }
    setNotice(response.ok ? 'Authenticator recovery is off.' : result.error ?? 'Could not disable authenticator.')
    if (response.ok) { setCode(''); await refresh() }
  }
  async function saveQuestion(event: React.FormEvent, slot: 1 | 2) {
    event.preventDefault()
    const response = await fetch('/api/security/questions', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ slot, question: slot === 1 ? question1 : question2, answer: slot === 1 ? answer1 : answer2 }) })
    const result = await response.json() as { error?: string }
    setNotice(response.ok ? `Recovery question ${slot} is saved independently.` : result.error ?? 'Could not save that question.')
    if (response.ok) { if (slot === 1) setAnswer1(''); else setAnswer2(''); await refresh() }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/security/password', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ password }) })
    const result = await response.json() as { error?: string }
    setNotice(response.ok ? 'Password changed.' : result.error ?? 'Could not change password.')
    if (response.ok) setPassword('')
  }
  if (!checked || !user) return <Page><main className="account-page page-wrap"><p className="account-copy">Checking your session…</p></main></Page>
  return <Page authenticated><main className="account-page page-wrap">
    <div className="eyebrow">Security</div><h1>Choose your way back in.</h1>
    <div className="security-stack">
      <section className="account-card"><span className="card-label">Authenticator recovery</span><h2>{status?.totpEnabled ? 'Connected' : 'Off by default'}</h2><p>Scan a private QR code, then prove the connection with one six-digit code.</p>
        {!status?.totpEnabled && !setup && <button className="button button-primary" onClick={() => void startTotp()}>Set up TOTP</button>}
        {setup && <div className="totp-setup"><img src={setup.qr} alt="Authenticator setup QR code" /><p>Manual key: <code>{setup.secret}</code></p><form className="inline-form" onSubmit={(event) => void enableTotp(event)}><input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" placeholder="Six-digit code" required /><button className="button button-primary">Verify and enable</button></form></div>}
        {status?.totpEnabled && <div className="inline-form"><input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" placeholder="Current code to disable" /><button className="button button-ghost" onClick={() => void disableTotp()}>Disable TOTP</button></div>}
      </section>
      <section className="account-card"><span className="card-label">Two-question recovery</span><h2>{status?.questionsEnabled ? 'Connected' : 'Optional'}</h2><p>Choose from 15 prompts. Each question and answer can be changed independently; the two answers must differ.</p><div className="independent-questions"><form className="stack-form" onSubmit={(event) => void saveQuestion(event, 1)}><label>Question one<select value={question1} onChange={(event) => setQuestion1(event.target.value)}>{SECURITY_QUESTIONS.map((question) => <option value={question} key={question}>{question}</option>)}</select></label><label>New answer one<input value={answer1} onChange={(event) => setAnswer1(event.target.value)} minLength={3} placeholder={status?.questions[0] ? 'Leave blank to keep the current answer' : 'Required for a new question'} /></label><button className="button button-cream">Save question one</button></form><form className="stack-form" onSubmit={(event) => void saveQuestion(event, 2)}><label>Question two<select value={question2} onChange={(event) => setQuestion2(event.target.value)}>{SECURITY_QUESTIONS.map((question) => <option value={question} key={question}>{question}</option>)}</select></label><label>New answer two<input value={answer2} onChange={(event) => setAnswer2(event.target.value)} minLength={3} placeholder={status?.questions[1] ? 'Leave blank to keep the current answer' : 'Required for a new question'} /></label><button className="button button-cream">Save question two</button></form></div></section>
      <section className="account-card"><span className="card-label">Password</span><h2>Change it directly</h2><p>A signed-in account does not need to repeat TOTP or recovery answers.</p><form className="inline-form" onSubmit={(event) => void changePassword(event)}><input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New strong password, 12+ characters" required /><button className="button button-primary">Change password</button></form></section>
      {notice && <p className="notice">{notice}</p>}
    </div>
  </main></Page>
}

export function PricingPage() {
  const [notice, setNotice] = useState('')
  async function checkout(product: string) {
    const response = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ product }) })
    const result = await response.json() as { url?: string; error?: string }
    if (result.url) window.location.assign(result.url); else setNotice(result.error ?? 'Checkout is not ready yet.')
  }
  return <Page><main className="account-page page-wrap">
    <div className="eyebrow">Pricing</div><h1>Pay for room, not remembrance.</h1>
    <p className="account-copy">Every tier can return to saved chapters without a meter running. One deliberate Quiet Editor request uses one included request, regardless of which editor action you choose. The Studio capacity add-ons below are optional, clearly scoped, and never required to look back.</p>
    <div className="pricing-grid">{tiers.map((tier) => <section className={`account-card ${tier.code === 'memory' ? 'featured-card' : ''}`} key={tier.code}>
      <span className="card-label">{tier.name}</span><h2 className="price-line">{tier.price} <small>{tier.cadence}</small></h2>
      <ul className="feature-list">{tier.features.map((feature) => <li key={feature}>{feature}</li>)}<li>Metadata cleansing included</li></ul>
      {tier.code === 'free' ? <Link className="button button-ghost" to="/app">Start free</Link> : <button className="button button-primary" onClick={() => void checkout(tier.code)}>Choose {tier.name}</button>}
    </section>)}</div>
    <section className="price-section"><div className="eyebrow">Permanent atmosphere</div><h2>One purchase. One chapter. Keep it.</h2>
      <div className="addon-grid">
        <article><strong>Golden Hour · $1.99</strong><span>Warm moving light and dust.</span><small className="addon-context">Choose it from inside an open chapter.</small></article>
        <article><strong>Rain Window · $1.99</strong><span>Slow rain and soft glass reflections.</span></article>
        <article><strong>Stardust Ceiling · $2.99</strong><span>A quiet constellation above the room.</span></article>
        <article><strong>Premiere Night · $3.99</strong><span>Cinema lighting and title sequence.</span></article>
      </div>
    </section>
    <section className="price-section"><div className="eyebrow">Studio capacity, only when needed</div><h2>More room without a surprise meter.</h2>
      <div className="addon-grid studio-addon-grid">{studioAddons.map(([code, name, price, copy]) => <article key={code}><strong>{name}</strong><span>{copy}</span><small className="addon-context">{price} one time</small><button type="button" className="button button-ghost" onClick={() => void checkout(code)}>Buy add-on</button></article>)}</div>
    </section>
    <section className="price-section"><div className="eyebrow">Quiet Editor menu</div><h2>Nine choices, called only when you ask.</h2>
      <p className="account-copy">One deliberate Quiet Editor action uses one included monthly request, regardless of which action you choose.</p>
      <div className="ai-menu">{aiMenu.map(([name, kind]) => <div key={name}><strong>{name}</strong><span>{kind}</span><em>1 request</em></div>)}</div>
    </section>
    {notice && <p className="notice">{notice}</p>}
  </main></Page>
}

export function AboutPage() {
  return <Page><main className="account-page page-wrap">
    <div className="eyebrow">About Story Loom</div><h1>Your life, given a room worth returning to.</h1>
    <p className="account-copy">Story Loom turns a camera roll into private chapters you can see as an exhibition wall, a slow orbit, or a place to walk through. The gallery itself is deterministic Three.js—not generated by a model—and remains useful with every editor feature switched off.</p>
    <div className="mechanism-flow">
      <article><span>01</span><h2>Bring a chapter</h2><p>PNG, GIF, WebP, and short MP4 moments. Image metadata can be removed before storage.</p></article>
      <article><span>02</span><h2>Compose the room</h2><p>Arrange, title, and revisit. No code, filename editing, or prompt is required.</p></article>
      <article><span>03</span><h2>Ask only when useful</h2><p>The Quiet Editor helps with captions, order, mood, accessibility, or narration after explicit consent.</p></article>
      <article><span>04</span><h2>Come back freely</h2><p>Subscriptions fund capacity. Permanent finishes fund delight. Looking back is never metered.</p></article>
    </div>
    <section className="price-section"><div className="eyebrow">How the business works</div><h2>One calm loop, two aligned revenues.</h2><div className="business-lanes"><article><strong>Subscription</strong><p>Storage, video, exports, and included editor requests.</p></article><article><strong>Permanent finishes</strong><p>One-time atmosphere attached to a chapter, not every viewing.</p></article></div></section>
    <Link className="button button-primary" to="/pricing">See exact limits and prices</Link>
  </main></Page>
}

export function FaqPage() {
  const items = [
    ['Is this an AI gallery?', 'No. The 3D room, wall, orbit, and walk views are rendered with Three.js. The Quiet Editor is optional and runs only after an explicit request.'],
    ['Which editor jobs inspect images?', 'Six of nine jobs can inspect only the images you explicitly select: mood, ordering, cover choice, narration, alt text, and future postcard. Title, caption, and memory thread remain text-only.'],
    ['What is the upload limit?', 'Images may be PNG, WebP, or GIF up to 5 MB. MP4 is allowed up to 25 MB and 30 seconds. SVG, JPEG/JPG, and AVIF are rejected.'],
    ['What does metadata cleansing do?', 'For images, supported metadata chunks are removed before R2 storage. MP4 is validated for size and duration but not rewritten.'],
    ['How do Room and Walk differ?', 'Room is a composed wall from a fixed editorial viewpoint. Walk places work along a corridor and gives first-person keyboard and drag movement. Orbit is a weightless constellation.'],
    ['Can I recover without email?', 'Yes, only if you remember the username and previously enabled TOTP or two different security answers. Recovery is for signed-out users; signed-in users change passwords in Security.'],
  ]
  return <Page><main className="account-page page-wrap"><div className="eyebrow">FAQ</div><h1>Clear answers, before you entrust a chapter.</h1><div className="faq-list">{items.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></main></Page>
}

export function RecoveryPage() {
  const [checked, setChecked] = useState(false); const [username, setUsername] = useState('')
  const [methods, setMethods] = useState<{ totp: boolean; security: boolean } | null>(null); const [questions, setQuestions] = useState<string[]>([])
  const [method, setMethod] = useState<'totp' | 'security' | null>(null); const [recoveryId, setRecoveryId] = useState('')
  const [code, setCode] = useState(''); const [answer1, setAnswer1] = useState(''); const [answer2, setAnswer2] = useState('')
  const [resetToken, setResetToken] = useState(''); const [password, setPassword] = useState(''); const [notice, setNotice] = useState('')
  useEffect(() => { void getUser().then((user) => { if (user) window.location.replace('/security'); else setChecked(true) }) }, [])
  async function discover(event: React.FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/auth/recovery/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username }) })
    const result = await response.json() as { methods?: { totp: boolean; security: boolean }; questions?: string[]; error?: string }
    if (!response.ok || !result.methods) return setNotice(result.error ?? 'No recovery path is available.')
    setMethods(result.methods); setQuestions(result.questions ?? []); setNotice('Choose one recovery method.')
  }
  async function choose(nextMethod: 'totp' | 'security') {
    const response = await fetch('/api/auth/recovery/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, method: nextMethod }) })
    const result = await response.json() as { recoveryId?: string; error?: string }
    if (!response.ok || !result.recoveryId) return setNotice(result.error ?? 'Could not start recovery.')
    setMethod(nextMethod); setRecoveryId(result.recoveryId); setNotice('Complete the proof below.')
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/auth/recovery/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recoveryId, code, answer1, answer2 }) })
    const result = await response.json() as { resetToken?: string; error?: string }
    if (!response.ok || !result.resetToken) return setNotice(result.error ?? 'That proof did not match.')
    setResetToken(result.resetToken); setNotice('Proof accepted. Choose a new password.')
  }
  async function reset(event: React.FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/auth/recovery/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resetToken, password }) })
    const result = await response.json() as { error?: string }
    setNotice(response.ok ? 'Password changed. Your room is open.' : result.error ?? 'Could not change password.')
    if (response.ok) window.location.assign('/app')
  }
  if (!checked) return <Page><main className="account-page page-wrap"><p className="account-copy">Checking your session…</p></main></Page>
  return <Page><main className="account-page page-wrap">
    <div className="eyebrow">Signed-out recovery</div><h1>Find your way back.</h1><p className="account-copy">A correct username plus previously enabled TOTP or two questions is required. There is no email recovery.</p>
    {!methods && !resetToken && <form className="recovery-card stack-form" onSubmit={(event) => void discover(event)}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><button className="button button-primary">Find recovery options</button></form>}
    {methods && !method && !resetToken && <section className="account-card recovery-card"><h2>Choose your proof</h2>{methods.totp && <button className="button button-primary" onClick={() => void choose('totp')}>Use authenticator</button>}{methods.security && <button className="button button-cream" onClick={() => void choose('security')}>Use two questions</button>}{!methods.totp && !methods.security && <p>No recovery method was enabled for this username.</p>}</section>}
    {method && !resetToken && <form className="recovery-card stack-form" onSubmit={(event) => void verify(event)}>{method === 'totp' ? <label>Authenticator code<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" required /></label> : <><label>{questions[0] ?? 'First answer'}<input value={answer1} onChange={(event) => setAnswer1(event.target.value)} required /></label><label>{questions[1] ?? 'Second answer'}<input value={answer2} onChange={(event) => setAnswer2(event.target.value)} required /></label></>}<button className="button button-primary">Verify recovery</button></form>}
    {resetToken && <form className="recovery-card stack-form" onSubmit={(event) => void reset(event)}><label>New password<input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="button button-primary">Set new password</button></form>}
    {notice && <p className="notice">{notice}</p>}
  </main></Page>
}

export function BillingSuccessPage() {
  return <Page><main className="account-page page-wrap"><div className="eyebrow">Payment received</div><h1>Your room is being prepared.</h1><p className="account-copy">Stripe has returned you to Story Loom. Entitlements are finalized by the signed webhook.</p><Link className="button button-primary" to="/profile">Back to profile</Link></main></Page>
}
