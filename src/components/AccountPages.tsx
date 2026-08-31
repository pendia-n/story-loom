import QRCode from 'qrcode'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import ThemeToggle from './ThemeToggle'

type User = { id: string; username: string }
type SecurityStatus = { totpEnabled: boolean; questionsEnabled: boolean; questions: string[] }

function csrfHeaders() {
  if (typeof document === 'undefined') return {} as Record<string, string>
  const token = document.cookie.split('; ').find((item) => item.startsWith('story_loom_csrf='))?.split('=')[1] ?? ''
  const headers: Record<string, string> = {}
  if (token) headers['x-csrf-token'] = decodeURIComponent(token)
  return headers
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="loom-app"><header className="loom-header"><Link className="wordmark" to="/"><span className="wordmark-mark">✦</span> story loom</Link><nav className="app-tabs" aria-label="Story Loom sections"><Link to="/app">Rooms</Link><Link to="/profile">Profile</Link><Link to="/security">Security</Link><Link to="/pricing">Plans</Link></nav><div className="header-actions"><ThemeToggle /></div></header>{children}<footer className="loom-footer page-wrap"><span>story loom · made for the moments that stay</span><span>v1 · private by default</span></footer></div>
}

async function getUser() {
  const response = await fetch('/api/auth/me')
  if (!response.ok) return null
  const result = await response.json() as { user?: User | null }
  return result.user ?? null
}

export function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [billing, setBilling] = useState<{ subscription?: { tier?: string; status?: string }; purchases?: Array<{ product_code: string }> } | null>(null)
  useEffect(() => { void getUser().then((next) => { setUser(next); if (next) void fetch('/api/billing/status').then((response) => response.ok ? response.json() : null).then((value) => setBilling(value as { subscription?: { tier?: string; status?: string }; purchases?: Array<{ product_code: string }> } | null)).catch(() => undefined) }) }, [])
  return <Page><main className="account-page page-wrap"><div className="eyebrow">Your profile</div><h1>Keep the room yours.</h1>{!user ? <p className="account-copy">Sign in to see your account.</p> : <div className="account-grid"><section className="account-card"><span className="card-label">Username</span><h2>@{user.username}</h2><p>Your gallery is private unless you deliberately create a share.</p><Link className="button button-primary" to="/security">Open security</Link></section><section className="account-card"><span className="card-label">Plan</span><h2>{billing?.subscription?.tier ?? 'free'}</h2><p>{billing?.subscription?.status ?? 'No active subscription'} · {billing?.purchases?.length ?? 0} one-time effects</p><Link className="button button-cream" to="/pricing">View plans</Link></section></div>}</main></Page>
}

export function SecurityPage() {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [question1, setQuestion1] = useState('')
  const [answer1, setAnswer1] = useState('')
  const [question2, setQuestion2] = useState('')
  const [answer2, setAnswer2] = useState('')
  const [notice, setNotice] = useState('')
  async function refresh() { const next = await getUser(); setUser(next); if (next) { const response = await fetch('/api/security/status'); if (response.ok) setStatus(await response.json() as SecurityStatus) } }
  useEffect(() => { void refresh() }, [])
  async function startTotp() { const response = await fetch('/api/security/totp/setup', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() } }); const result = await response.json() as { secret?: string; uri?: string; error?: string }; if (!response.ok || !result.secret || !result.uri) { setNotice(result.error ?? 'Could not start authenticator setup.'); return }; setSetup({ secret: result.secret, uri: result.uri, qr: await QRCode.toDataURL(result.uri, { width: 220, margin: 1 }) }) }
  async function enableTotp(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/security/totp/enable', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ code }) }); const result = await response.json() as { error?: string }; setNotice(response.ok ? 'Authenticator recovery is on.' : result.error ?? 'Could not enable authenticator.'); if (response.ok) { setSetup(null); setCode(''); await refresh() } }
  async function disableTotp() { const response = await fetch('/api/security/totp/disable', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ code }) }); const result = await response.json() as { error?: string }; setNotice(response.ok ? 'Authenticator recovery is off.' : result.error ?? 'Could not disable authenticator.'); if (response.ok) { setCode(''); await refresh() } }
  async function saveQuestions(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/security/questions', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ question1, answer1, question2, answer2 }) }); const result = await response.json() as { error?: string }; setNotice(response.ok ? 'Your two recovery questions are saved.' : result.error ?? 'Could not save questions.'); if (response.ok) await refresh() }
  async function changePassword(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/security/password', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ password }) }); const result = await response.json() as { error?: string }; setNotice(response.ok ? 'Password changed.' : result.error ?? 'Could not change password.'); if (response.ok) setPassword('') }
  return <Page><main className="account-page page-wrap"><div className="eyebrow">Security</div><h1>Choose your way back in.</h1>{!user ? <p className="account-copy">Sign in to manage recovery, or use <Link className="inline-link" to="/recovery">recovery</Link> if you are locked out.</p> : <div className="security-stack"><section className="account-card"><span className="card-label">Authenticator recovery</span><h2>{status?.totpEnabled ? 'Connected' : 'Off by default'}</h2><p>Use an authenticator app without email. Scan a private QR code, then prove the connection with one six-digit code.</p>{!status?.totpEnabled && !setup && <button className="button button-primary" onClick={() => void startTotp()}>Set up TOTP</button>}{setup && <div className="totp-setup"><img src={setup.qr} alt="Authenticator setup QR code" /><p>Scan this code in your authenticator app. Manual key: <code>{setup.secret}</code></p><form className="inline-form" onSubmit={(event) => void enableTotp(event)}><input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" placeholder="Six-digit code" required /><button className="button button-primary">Verify and enable</button></form></div>}{status?.totpEnabled && <div className="inline-form"><input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" placeholder="Current code to disable" /><button className="button button-ghost" onClick={() => void disableTotp()}>Disable TOTP</button></div>}</section><section className="account-card"><span className="card-label">Two-question recovery</span><h2>{status?.questionsEnabled ? 'Connected' : 'Optional'}</h2><p>Answers are hashed and only compared against this account. The answers must be different.</p><form className="stack-form" onSubmit={(event) => void saveQuestions(event)}><label>Question one<input value={question1} onChange={(event) => setQuestion1(event.target.value)} placeholder="A place you remember clearly" required /></label><label>Answer one<input value={answer1} onChange={(event) => setAnswer1(event.target.value)} required /></label><label>Question two<input value={question2} onChange={(event) => setQuestion2(event.target.value)} placeholder="A small object you kept" required /></label><label>Answer two<input value={answer2} onChange={(event) => setAnswer2(event.target.value)} required /></label><button className="button button-cream">Save questions</button></form></section><section className="account-card"><span className="card-label">Password</span><h2>Change it directly</h2><p>When you are signed in, no username, TOTP code, or security answers are required.</p><form className="inline-form" onSubmit={(event) => void changePassword(event)}><input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password, 10+ characters" required /><button className="button button-primary">Change password</button></form></section>{notice && <p className="notice">{notice}</p>}</div>}</main></Page>
}

export function PricingPage() {
  const [notice, setNotice] = useState('')
  async function checkout(product: string) { const response = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ product }) }); const result = await response.json() as { url?: string; error?: string }; if (result.url) window.location.assign(result.url); else setNotice(result.error ?? 'Checkout is not ready yet.') }
  return <Page><main className="account-page page-wrap"><div className="eyebrow">Plans</div><h1>More atmosphere, when you want it.</h1><p className="account-copy">The private room works before payment. Paid plans add room capacity and finishing touches; they never charge for simply looking back.</p><div className="pricing-grid"><section className="account-card"><span className="card-label">Memory</span><h2>A larger shelf</h2><p>Recurring tier for more chapters, images, and saved scene settings.</p><button className="button button-primary" onClick={() => void checkout('memory')}>Choose Memory</button></section><section className="account-card featured-card"><span className="card-label">Studio</span><h2>The full room</h2><p>Recurring tier for generous storage, richer layouts, and future exports.</p><button className="button button-primary" onClick={() => void checkout('studio')}>Choose Studio</button></section><section className="account-card"><span className="card-label">Golden Hour</span><h2>One finishing touch</h2><p>One-time add-on for a special ambient effect on a chapter.</p><button className="button button-cream" onClick={() => void checkout('golden-hour')}>Add Golden Hour</button></section></div>{notice && <p className="notice">{notice}</p>}</main></Page>
}

export function RecoveryPage() {
  const [username, setUsername] = useState('')
  const [methods, setMethods] = useState<{ totp: boolean; security: boolean } | null>(null)
  const [questions, setQuestions] = useState<string[]>([])
  const [method, setMethod] = useState<'totp' | 'security' | null>(null)
  const [recoveryId, setRecoveryId] = useState('')
  const [code, setCode] = useState('')
  const [answer1, setAnswer1] = useState('')
  const [answer2, setAnswer2] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  async function discover(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/auth/recovery/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username }) }); const result = await response.json() as { methods?: { totp: boolean; security: boolean }; questions?: string[]; error?: string }; if (!response.ok || !result.methods) { setNotice(result.error ?? 'No recovery path is available.'); return }; setMethods(result.methods); setQuestions(result.questions ?? []); setNotice('Choose one recovery method.') }
  async function choose(nextMethod: 'totp' | 'security') { const response = await fetch('/api/auth/recovery/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, method: nextMethod }) }); const result = await response.json() as { recoveryId?: string; error?: string }; if (!response.ok || !result.recoveryId) { setNotice(result.error ?? 'Could not start recovery.'); return }; setMethod(nextMethod); setRecoveryId(result.recoveryId); setNotice('Complete the proof below.') }
  async function verify(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/auth/recovery/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recoveryId, code, answer1, answer2 }) }); const result = await response.json() as { resetToken?: string; error?: string }; if (!response.ok || !result.resetToken) { setNotice(result.error ?? 'That proof did not match.'); return }; setResetToken(result.resetToken); setNotice('Proof accepted. Choose a new password.') }
  async function reset(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/auth/recovery/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resetToken, password }) }); const result = await response.json() as { error?: string }; setNotice(response.ok ? 'Password changed. Your new room is open.' : result.error ?? 'Could not change password.'); if (response.ok) window.location.assign('/app') }
  return <Page><main className="account-page page-wrap"><div className="eyebrow">Recovery</div><h1>Find your way back.</h1><p className="account-copy">Recovery only works when the username is correct and you previously enabled TOTP or two questions. There is no email recovery.</p>{!methods && !resetToken && <form className="recovery-card stack-form" onSubmit={(event) => void discover(event)}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><button className="button button-primary">Find recovery options</button></form>}{methods && !method && !resetToken && <section className="account-card"><h2>Choose your proof</h2>{methods.totp && <button className="button button-primary" onClick={() => void choose('totp')}>Use authenticator code</button>}{methods.security && <button className="button button-cream" onClick={() => void choose('security')}>Use two questions</button>}{!methods.totp && !methods.security && <p>No recovery method was enabled for this username.</p>}</section>}{method && !resetToken && <form className="recovery-card stack-form" onSubmit={(event) => void verify(event)}>{method === 'totp' ? <label>Authenticator code<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" required /></label> : <><label>{questions[0] ?? 'First answer'}<input value={answer1} onChange={(event) => setAnswer1(event.target.value)} required /></label><label>{questions[1] ?? 'Second answer'}<input value={answer2} onChange={(event) => setAnswer2(event.target.value)} required /></label></>}<button className="button button-primary">Verify recovery</button></form>}{resetToken && <form className="recovery-card stack-form" onSubmit={(event) => void reset(event)}><label>New password<input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="button button-primary">Set new password</button></form>}{notice && <p className="notice">{notice}</p>}</main></Page>
}

export function BillingSuccessPage() {
  return <Page><main className="account-page page-wrap"><div className="eyebrow">Payment received</div><h1>Your room is being prepared.</h1><p className="account-copy">Stripe has returned you to Story Loom. Entitlements are finalized by the signed webhook, so refresh your profile in a moment.</p><Link className="button button-primary" to="/profile">Back to profile</Link></main></Page>
}
