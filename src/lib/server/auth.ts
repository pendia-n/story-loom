import { env as workerEnv } from 'cloudflare:workers'

export type StoryLoomEnv = {
  DB?: D1Database
  MEDIA?: R2Bucket
  SESSION_SECRET?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_MODEL?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_MEMORY?: string
  STRIPE_PRICE_STUDIO?: string
  STRIPE_PRICE_GOLDEN_HOUR?: string
  APP_URL?: string
}

export type AuthUser = {
  id: string
  username: string
  created_at: string
  totp_enabled?: number
  has_security_questions?: number
}

const SESSION_COOKIE = 'story_loom_session'
const CSRF_COOKIE = 'story_loom_csrf'
const SESSION_DAYS = 363
const PASSWORD_ITERATIONS = 120_000
const RECOVERY_MINUTES = 10

function getEnv() {
  return workerEnv as unknown as StoryLoomEnv
}

export function getRuntimeEnv() {
  return getEnv()
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function sha256(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource))
}

function safeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

async function digestPassword(password: string, salt?: Uint8Array) {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16))
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password) as unknown as BufferSource, 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: actualSalt as unknown as BufferSource, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' },
    material, 256,
  )
  return `${bytesToBase64Url(actualSalt)}.${bytesToBase64Url(new Uint8Array(bits))}`
}

async function verifyPassword(password: string, encoded: string) {
  const [saltValue, hashValue] = encoded.split('.')
  if (!saltValue || !hashValue) return false
  try {
    const result = await digestPassword(password, base64UrlToBytes(saltValue))
    return safeEqual(base64UrlToBytes(result.split('.')[1]), base64UrlToBytes(hashValue))
  } catch {
    return false
  }
}

function parseCookies(request: Request) {
  const cookieHeader = request.headers.get('Cookie') ?? ''
  return Object.fromEntries(cookieHeader.split(';').map((part) => part.trim().split('='))
    .filter(([key, value]) => key && value).map(([key, ...value]) => [key, value.join('=')])) as Record<string, string>
}

export function getCsrfToken(request: Request) {
  return parseCookies(request)[CSRF_COOKIE] ?? ''
}

function cookie(name: string, value: string, maxAge: number, httpOnly: boolean) {
  return `${name}=${value}; Path=/; ${httpOnly ? 'HttpOnly; ' : ''}SameSite=Lax; Max-Age=${maxAge}`
}

export function withSecureCookie(request: Request, value: string) {
  return request.url.startsWith('https://') ? `${value}; Secure` : value
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin')
  const referer = request.headers.get('Referer')
  if (!origin && !referer) return true
  try {
    const expected = new URL(request.url).origin
    return origin ? new URL(origin).origin === expected : new URL(referer as string).origin === expected
  } catch {
    return false
  }
}

export function requireSameOrigin(request: Request) {
  return sameOrigin(request)
}

export async function createSession(userId: string) {
  const sessionToken = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const csrfToken = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + SESSION_DAYS * 86_400
  await getDatabase().prepare(
    'INSERT INTO sessions (token_hash, user_id, csrf_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)',
  ).bind(bytesToBase64Url(await sha256(sessionToken)), userId, bytesToBase64Url(await sha256(csrfToken)), now, expiresAt).run()
  return {
    sessionCookie: cookie(SESSION_COOKIE, sessionToken, SESSION_DAYS * 86_400, true),
    csrfCookie: cookie(CSRF_COOKIE, csrfToken, SESSION_DAYS * 86_400, false),
  }
}

export function clearSessionCookies() {
  return [cookie(SESSION_COOKIE, '', 0, true), cookie(CSRF_COOKIE, '', 0, false)]
}

async function currentSession(request: Request) {
  const token = parseCookies(request)[SESSION_COOKIE]
  if (!token) return null
  const tokenHash = bytesToBase64Url(await sha256(token))
  return getDatabase().prepare(
    `SELECT s.token_hash, s.user_id, s.csrf_hash, u.id, u.username, u.created_at, u.totp_enabled,
      CASE WHEN u.security_question_1 IS NOT NULL AND u.security_question_2 IS NOT NULL THEN 1 ELSE 0 END AS has_security_questions
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
  ).bind(tokenHash, Math.floor(Date.now() / 1000)).first<{
    token_hash: string; user_id: string; csrf_hash: string; id: string; username: string; created_at: string
    totp_enabled: number; has_security_questions: number
  }>()
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const session = await currentSession(request)
  if (!session) return null
  return {
    id: session.id, username: session.username, created_at: session.created_at,
    totp_enabled: session.totp_enabled, has_security_questions: session.has_security_questions,
  }
}

export async function requireCsrf(request: Request) {
  if (!sameOrigin(request)) return false
  const token = request.headers.get('x-csrf-token') ?? ''
  const csrfCookie = getCsrfToken(request)
  if (!token || !csrfCookie || token !== csrfCookie) return false
  const session = await currentSession(request)
  if (!session) return false
  return safeEqual(await sha256(token), base64UrlToBytes(session.csrf_hash))
}

export async function deleteCurrentSession(request: Request) {
  const token = parseCookies(request)[SESSION_COOKIE]
  if (!token) return
  await getDatabase().prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(bytesToBase64Url(await sha256(token))).run()
}

export async function revokeUserSessions(userId: string) {
  await getDatabase().prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId).run()
}

export async function registerUser(username: string, password: string) {
  const id = crypto.randomUUID()
  const passwordHash = await digestPassword(password)
  await getDatabase().prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(id, username, passwordHash, new Date().toISOString()).run()
  return { id, username }
}

export async function loginUser(username: string, password: string) {
  const user = await getDatabase().prepare('SELECT id, username, password_hash FROM users WHERE username = ?1')
    .bind(username).first<{ id: string; username: string; password_hash: string }>()
  if (!user || !(await verifyPassword(password, user.password_hash))) return null
  return { id: user.id, username: user.username }
}

export async function changePassword(userId: string, password: string) {
  await getDatabase().prepare('UPDATE users SET password_hash = ?1 WHERE id = ?2').bind(await digestPassword(password), userId).run()
}

export async function getRecoveryUser(username: string) {
  return getDatabase().prepare(
    'SELECT id, username, totp_enabled, security_question_1, security_question_2, security_answer_1_hash, security_answer_2_hash, totp_secret FROM users WHERE username = ?1',
  ).bind(username).first<{
    id: string; username: string; totp_enabled: number; security_question_1: string | null; security_question_2: string | null
    security_answer_1_hash: string | null; security_answer_2_hash: string | null; totp_secret: string | null
  }>()
}

export async function createRecoveryChallenge(userId: string, method: 'totp' | 'security') {
  const id = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const now = Math.floor(Date.now() / 1000)
  await getDatabase().prepare(
    'INSERT INTO recovery_challenges (id_hash, user_id, method, expires_at, attempts, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)',
  ).bind(bytesToBase64Url(await sha256(id)), userId, method, now + RECOVERY_MINUTES * 60, now).run()
  return id
}

export async function getRecoveryChallenge(id: string) {
  return getDatabase().prepare(
    'SELECT id_hash, user_id, method, expires_at, attempts, reset_hash, verified_at FROM recovery_challenges WHERE id_hash = ?1 AND expires_at > ?2',
  ).bind(bytesToBase64Url(await sha256(id)), Math.floor(Date.now() / 1000)).first<{
    id_hash: string; user_id: string; method: 'totp' | 'security'; expires_at: number; attempts: number
    reset_hash: string | null; verified_at: number | null
  }>()
}

export async function incrementRecoveryAttempts(idHash: string) {
  await getDatabase().prepare('UPDATE recovery_challenges SET attempts = attempts + 1 WHERE id_hash = ?1').bind(idHash).run()
}

export async function createRecoveryReset(idHash: string) {
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  await getDatabase().prepare('UPDATE recovery_challenges SET reset_hash = ?1, verified_at = ?2 WHERE id_hash = ?3')
    .bind(bytesToBase64Url(await sha256(token)), Math.floor(Date.now() / 1000), idHash).run()
  return token
}

export async function consumeRecoveryReset(token: string) {
  const resetHash = bytesToBase64Url(await sha256(token))
  const row = await getDatabase().prepare(
    'SELECT id_hash, user_id FROM recovery_challenges WHERE reset_hash = ?1 AND verified_at IS NOT NULL AND verified_at > ?2 AND expires_at > ?2',
  ).bind(resetHash, Math.floor(Date.now() / 1000) - RECOVERY_MINUTES * 60).first<{ id_hash: string; user_id: string }>()
  if (!row) return null
  await getDatabase().prepare('DELETE FROM recovery_challenges WHERE id_hash = ?1').bind(row.id_hash).run()
  return row.user_id
}

export async function hashRecoveryAnswer(answer: string) {
  return digestPassword(answer.trim().toLocaleLowerCase())
}

export async function verifyRecoveryAnswer(answer: string, hash: string) {
  return verifyPassword(answer.trim().toLocaleLowerCase(), hash)
}

function base32Encode(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let value = 0
  let bits = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let buffer = 0
  let bits = 0
  const output: number[] = []
  for (const character of value.toUpperCase().replaceAll('=', '')) {
    const index = alphabet.indexOf(character)
    if (index < 0) continue
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(output)
}

export function makeTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)))
}

export function makeTotpUri(username: string, secret: string) {
  return `otpauth://totp/Story%20Loom:${encodeURIComponent(username)}?secret=${secret}&issuer=Story%20Loom&algorithm=SHA1&digits=6&period=30`
}

export async function verifyTotp(secret: string, code: string, now = Date.now()) {
  const cleaned = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  const secretBytes = base32Decode(secret)
  const counter = Math.floor(now / 1000 / 30)
  for (const offset of [-1, 0, 1]) {
    const bytes = new ArrayBuffer(8)
    const view = new DataView(bytes)
    const current = counter + offset
    view.setUint32(0, Math.floor(current / 0x1_0000_0000))
    view.setUint32(4, current >>> 0)
    const key = await crypto.subtle.importKey('raw', secretBytes as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes))
    const index = digest[digest.length - 1] & 0x0f
    const number = ((digest[index] & 0x7f) << 24) | (digest[index + 1] << 16) | (digest[index + 2] << 8) | digest[index + 3]
    if (String(number % 1_000_000).padStart(6, '0') === cleaned) return true
  }
  return false
}

export function getDatabase() {
  const db = getEnv().DB
  if (!db) throw new Error('D1 is not configured')
  return db
}

export function getMediaBucket() {
  const media = getEnv().MEDIA
  if (!media) throw new Error('R2 is not configured')
  return media
}

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init?.headers ?? {}) },
  })
}

export function appendCookies(response: Response, request: Request, cookies: string[]) {
  for (const value of cookies) response.headers.append('set-cookie', withSecureCookie(request, value))
  return response
}

export function recoveryMinutes() {
  return RECOVERY_MINUTES
}
