export interface ShaloomEnv {
	DB: D1Database;
	MEDIA: R2Bucket;
	JWT_KEY: string;
	STRIPE_API_KEY?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	STRIPE_PRICE_STANDARD_MONTHLY?: string;
	STRIPE_PRICE_ZEALOUS_MONTHLY?: string;
	STRIPE_PRICE_STANDARD_CHAPTERS?: string;
	STRIPE_PRICE_ZEALOUS_CHAPTERS?: string;
	STRIPE_PRICE_STANDARD_MEDIA?: string;
	STRIPE_PRICE_ZEALOUS_MEDIA?: string;
}

export interface UserRow {
	id: string;
	username: string;
	username_key: string;
	password_hash: string;
	recovery_hash: string | null;
	plan: "free" | "standard" | "zealous";
	token_version: number;
	password_changed_at: number | null;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	subscription_status: string | null;
	subscription_period_end: number | null;
	created_at: number;
}

interface JwtPayload { sub: string; ver: number; iat: number; exp: number; }

const encoder = new TextEncoder();
const SESSION_SECONDS = 91 * 24 * 60 * 60;
const COOKIE_NAME = "storyloom_session";
const CSRF_COOKIE = "sl_csrf";
const RECOVERY_COOKIE = "storyloom_recovery";

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function jwtKeyBytes(env: ShaloomEnv) {
	if (!/^[a-f\d]{64}$/i.test(env.JWT_KEY ?? "")) throw new Error("JWT_KEY must be a 32-byte hex secret.");
	return Uint8Array.from(env.JWT_KEY.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

async function hmac(env: ShaloomEnv, value: string): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", jwtKeyBytes(env), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function signJwt(env: ShaloomEnv, payload: JwtPayload): Promise<string> {
	const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const unsigned = `${header}.${body}`;
	return `${unsigned}.${toBase64Url(await hmac(env, unsigned))}`;
}

async function verifyJwt(env: ShaloomEnv, token: string): Promise<JwtPayload | null> {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;
		const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0]))) as { alg?: string; typ?: string };
		if (header.alg !== "HS256" || header.typ !== "JWT") return null;
		const expected = await hmac(env, `${parts[0]}.${parts[1]}`);
		const actual = fromBase64Url(parts[2]);
		if (expected.length !== actual.length) return null;
		let diff = 0;
		for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
		if (diff !== 0) return null;
		const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1]))) as JwtPayload;
		if (!payload.sub || !Number.isInteger(payload.ver) || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
		return payload;
	} catch {
		return null;
	}
}

export function cookieValue(request: Request, name: string): string | null {
	const cookie = request.headers.get("cookie") ?? "";
	for (const part of cookie.split(";")) {
		const index = part.indexOf("=");
		if (index < 0 || part.slice(0, index).trim() !== name) continue;
		return decodeURIComponent(part.slice(index + 1).trim());
	}
	return null;
}

export function sessionCookie(token: string): string {
	return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function csrfCookie(token: string): string {
	return `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; SameSite=Lax`;
}

export function clearCsrfCookie(): string {
	return `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
}

export function recoveryCookie(token: string): string {
	return `${RECOVERY_COOKIE}=${encodeURIComponent(token)}; Path=/api/auth/recover; Max-Age=600; HttpOnly; Secure; SameSite=Strict`;
}

export function clearRecoveryCookie(): string {
	return `${RECOVERY_COOKIE}=; Path=/api/auth/recover; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function mintRecoveryToken(env: ShaloomEnv, user: UserRow): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	return signJwt(env, { sub: `recovery:${user.id}`, ver: user.token_version, iat: now, exp: now + 600 });
}

export async function verifyRecoveryToken(env: ShaloomEnv, token: string | null): Promise<{ userId: string; tokenVersion: number } | null> {
	if (!token) return null;
	const claims = await verifyJwt(env, token);
	if (!claims || !claims.sub.startsWith("recovery:")) return null;
	return { userId: claims.sub.slice("recovery:".length), tokenVersion: claims.ver };
}

export async function authenticate(request: Request, env: ShaloomEnv): Promise<UserRow | null> {
	const token = cookieValue(request, COOKIE_NAME);
	if (!token) return null;
	const claims = await verifyJwt(env, token);
	if (!claims) return null;
	const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(claims.sub).first<UserRow>();
	if (!user || user.token_version !== claims.ver) return null;
	return user;
}

export async function mintSession(env: ShaloomEnv, user: UserRow): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	return signJwt(env, { sub: user.id, ver: user.token_version, iat: now, exp: now + SESSION_SECONDS });
}

export function assertSameOrigin(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (origin && origin !== new URL(request.url).origin) return false;
	return request.headers.get("sec-fetch-site") !== "cross-site";
}

export function hasCsrf(request: Request): boolean {
	const cookie = cookieValue(request, CSRF_COOKIE);
	const header = request.headers.get("x-csrf-token");
	return Boolean(cookie && header && cookie.length === header.length && constantTimeTextEqual(cookie, header));
}

export function constantTimeTextEqual(left: string, right: string): boolean {
	const a = encoder.encode(left);
	const b = encoder.encode(right);
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
	return difference === 0;
}

function randomBytes(length: number) {
	return crypto.getRandomValues(new Uint8Array(length));
}

export function randomToken(length = 32): string {
	return toBase64Url(randomBytes(length));
}

export async function hashSecret(value: string): Promise<string> {
	const salt = randomBytes(16);
	const iterations = 100_000;
	const digest = await deriveChainedPbkdf2(encoder.encode(value), salt, iterations);
	return `pbkdf2x3$${iterations}$${toBase64Url(salt)}$${toBase64Url(digest)}`;
}

async function deriveChainedPbkdf2(input: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	let bytes = new Uint8Array(input);
	const roundSalt = new Uint8Array(salt);
	for (let round = 0; round < 3; round++) {
		const key = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveBits"]);
		bytes = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: roundSalt, iterations }, key, 256));
	}
	return bytes;
}

export async function verifySecret(value: string, encoded: string): Promise<boolean> {
	try {
		const [algorithm, iterationText, saltText, digestText] = encoded.split("$");
		const iterations = Number(iterationText);
		if (algorithm !== "pbkdf2x3" || iterations !== 100_000) return false;
		const digest = await deriveChainedPbkdf2(encoder.encode(value), fromBase64Url(saltText), iterations);
		return constantTimeBytesEqual(digest, fromBase64Url(digestText));
	} catch {
		return false;
	}
}

function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
	return difference === 0;
}

export async function scopedChapterToken(env: ShaloomEnv, userId: string, chapterId: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	return signJwt(env, { sub: `${userId}:${chapterId}`, ver: 0, iat: now, exp: now + 30 * 60 });
}

export async function verifyChapterToken(env: ShaloomEnv, token: string | null, userId: string, chapterId: string): Promise<boolean> {
	if (!token) return false;
	const claims = await verifyJwt(env, token);
	return Boolean(claims && claims.ver === 0 && claims.sub === `${userId}:${chapterId}`);
}

export function chapterAccessCookie(chapterId: string, token: string): string {
	return `sl_ch_${chapterId}=${encodeURIComponent(token)}; Path=/api/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`;
}

export function parseJsonRequest<T>(request: Request): Promise<T> {
	return request.json() as Promise<T>;
}

export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit): Response {
	const result = new Headers(headers);
	result.set("content-type", "application/json; charset=utf-8");
	result.set("cache-control", "no-store");
	result.set("x-content-type-options", "nosniff");
	return Response.json(data, { status, headers: result });
}
