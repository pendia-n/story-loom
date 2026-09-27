import { sniffAndCleanImage, sniffMp4, type AcceptedMedia } from "./media-clean";
import {
	 authenticate, assertSameOrigin, chapterAccessCookie, clearCsrfCookie, clearRecoveryCookie, clearSessionCookie,
	cookieValue, csrfCookie, hasCsrf, hashSecret, jsonResponse, mintSession, randomToken,
	mintRecoveryToken, recoveryCookie, scopedChapterToken, sessionCookie, verifyChapterToken, verifyRecoveryToken, verifySecret,
} from "./security";
import type { ShaloomEnv, UserRow } from "./security";

type ChapterRow = { id: string; user_id: string; title: string; is_private: number; share_code_hash: string | null; capacity_tier: Exclude<Tier, "free"> | null; created_at: number; updated_at: number };
type MediaRow = { id: string; chapter_id: string; user_id: string; r2_key: string; original_name: string; mime_type: AcceptedMedia; size_bytes: number; description: string; sort_order: number; created_at: number };
type Tier = "free" | "standard" | "zealous";
type Caps = { chapters: number; images: number; videos: number; maxBytes: number; imageTypes: string[]; videoTypes: string[] };

const encoder = new TextEncoder();
const DAY = 24 * 60 * 60 * 1000;
const AUTH_WINDOW = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 10;
const BASE_CAPS: Record<Tier, Caps> = {
	free: { chapters: 1, images: 8, videos: 0, maxBytes: 5 * 1024 * 1024, imageTypes: ["image/png", "image/jpeg"], videoTypes: [] },
	standard: { chapters: 8, images: 50, videos: 2, maxBytes: 10 * 1024 * 1024, imageTypes: ["image/png", "image/jpeg", "image/gif"], videoTypes: ["video/mp4"] },
	zealous: { chapters: 40, images: 100, videos: 7, maxBytes: 20 * 1024 * 1024, imageTypes: ["image/png", "image/jpeg", "image/gif"], videoTypes: ["video/mp4"] },
};
const allowedMethods = "GET, HEAD, POST, PUT, DELETE, OPTIONS";

function fail(message: string, status = 400): Response { return jsonResponse({ error: message }, status); }
function safeName(name: string): string { return name.normalize("NFKC").replace(/[\\/\0\r\n]/g, "_").slice(0, 180) || "memory"; }
function normalizeUsername(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const username = value.trim();
	return /^[A-Za-z0-9._-]{3,24}$/.test(username) ? username : null;
}
function isTier(value: unknown): value is Tier { return value === "free" || value === "standard" || value === "zealous"; }
function userPublic(user: UserRow) {
	return { id: user.id, username: user.username, plan: user.plan, recoveryEnabled: Boolean(user.recovery_hash), subscriptionStatus: user.subscription_status };
}
function addHeaders(response: Response, additions: HeadersInit): Response {
	const headers = new Headers(response.headers);
	new Headers(additions).forEach((value, key) => headers.append(key, value));
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function sessionCookieName(chapterId: string) { return `sl_ch_${chapterId}`; }
function isOriginOkay(request: Request): boolean { return assertSameOrigin(request); }
function requiresCsrf(method: string): boolean { return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()); }
function isValidPrivateCode(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9]{8}$/.test(value); }

async function jsonBody<T>(request: Request): Promise<T | null> {
	try { return await request.json() as T; } catch { return null; }
}

async function enforceMutation(request: Request, user: UserRow | null, csrfExempt = false): Promise<Response | null> {
	if (!isOriginOkay(request)) return fail("Request origin was not accepted.", 403);
	if (!csrfExempt && user && requiresCsrf(request.method) && !hasCsrf(request)) return fail("Please refresh the page and try again.", 403);
	return null;
}

async function passwordChangedTooRecently(user: UserRow): Promise<boolean> {
	return user.password_changed_at !== null && Date.now() - user.password_changed_at < DAY;
}

async function authAttemptAllowed(request: Request, env: ShaloomEnv, action: string, username: string): Promise<boolean> {
	const address = request.headers.get("cf-connecting-ip") ?? "unknown";
	const material = new TextEncoder().encode(`${action}:${address}:${username.toLowerCase()}`);
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
	const rateKey = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	const now = Date.now();
	await env.DB.prepare("INSERT INTO login_rate_limits (rate_key, window_start, attempt_count) VALUES (?, ?, 1) ON CONFLICT(rate_key) DO UPDATE SET window_start = CASE WHEN login_rate_limits.window_start < ? THEN excluded.window_start ELSE login_rate_limits.window_start END, attempt_count = CASE WHEN login_rate_limits.window_start < ? THEN 1 ELSE login_rate_limits.attempt_count + 1 END")
		.bind(rateKey, now, now - AUTH_WINDOW, now - AUTH_WINDOW).run();
	const row = await env.DB.prepare("SELECT attempt_count FROM login_rate_limits WHERE rate_key = ?").bind(rateKey).first<{ attempt_count: number }>();
	return Number(row?.attempt_count ?? 0) <= AUTH_MAX_ATTEMPTS;
}

async function currentTier(user: UserRow): Promise<Tier> { return isTier(user.plan) ? user.plan : "free"; }

async function chapterCapacity(env: ShaloomEnv, user: UserRow): Promise<number> {
	const tier = await currentTier(user);
	const base = BASE_CAPS[tier].chapters;
	const added = await env.DB.prepare("SELECT COALESCE(SUM(slots), 0) AS total FROM chapter_slots WHERE user_id = ?")
		.bind(user.id).first<{ total: number }>();
	return base + Number(added?.total ?? 0);
}

async function availableChapterSlotTier(env: ShaloomEnv, userId: string): Promise<Exclude<Tier, "free"> | null> {
	const [slots, assigned] = await Promise.all([
		env.DB.prepare("SELECT tier, SUM(slots) AS total, MIN(created_at) AS first_purchase FROM chapter_slots WHERE user_id = ? GROUP BY tier ORDER BY first_purchase ASC")
			.bind(userId).all<{ tier: Exclude<Tier, "free">; total: number }>(),
		env.DB.prepare("SELECT capacity_tier AS tier, COUNT(*) AS used FROM chapters WHERE user_id = ? AND capacity_tier IS NOT NULL GROUP BY capacity_tier")
			.bind(userId).all<{ tier: Exclude<Tier, "free">; used: number }>(),
	]);
	const usedByTier = new Map((assigned.results ?? []).map((row) => [row.tier, Number(row.used)]));
	return (slots.results ?? []).find((row) => Number(row.total) > (usedByTier.get(row.tier) ?? 0))?.tier ?? null;
}

async function mediaCapacity(env: ShaloomEnv, user: UserRow, chapterId: string): Promise<{ images: number; videos: number; maxBytes: number; plan: Tier; mediaTier: Tier; imageTypes: string[]; videoTypes: string[] }> {
	const accountTier = await currentTier(user);
	const chapter = await env.DB.prepare("SELECT capacity_tier FROM chapters WHERE id = ? AND user_id = ?").bind(chapterId, user.id).first<{ capacity_tier: Exclude<Tier, "free"> | null }>();
	const tierRank: Record<Tier, number> = { free: 0, standard: 1, zealous: 2 };
	const plan = tierRank[accountTier] >= tierRank[chapter?.capacity_tier ?? "free"] ? accountTier : chapter!.capacity_tier!;
	const base = BASE_CAPS[plan];
	// Paid media packs are retained as entitlements. A pack expands capacity only
	// while the matching paid tier (or a higher tier) is active; on Free, the base
	// Free limit governs new uploads, while existing files are never removed.
	const rows = await env.DB.prepare("SELECT tier, image_slots, video_slots FROM chapter_media_addons WHERE user_id = ? AND chapter_id = ?")
		.bind(user.id, chapterId).all<{ tier: Tier; image_slots: number; video_slots: number }>();
	let extraImages = 0;
	let extraVideos = 0;
	for (const row of rows.results ?? []) {
		if (plan === "standard" && row.tier === "standard" || plan === "zealous") {
			extraImages += row.image_slots;
			extraVideos += row.video_slots;
		}
	}
	return { images: base.images + extraImages, videos: base.videos + extraVideos, maxBytes: base.maxBytes, plan: accountTier, mediaTier: plan, imageTypes: base.imageTypes, videoTypes: base.videoTypes };
}

async function chapterForUser(env: ShaloomEnv, chapterId: string, userId: string): Promise<ChapterRow | null> {
	return env.DB.prepare("SELECT * FROM chapters WHERE id = ? AND user_id = ?").bind(chapterId, userId).first<ChapterRow>();
}

async function canReadChapter(request: Request, env: ShaloomEnv, user: UserRow, chapter: ChapterRow): Promise<boolean> {
	if (!chapter.is_private || chapter.user_id === user.id) return true;
	return verifyChapterToken(env, cookieValue(request, sessionCookieName(chapter.id)), user.id, chapter.id);
}

function mediaView(row: MediaRow) {
	return { id: row.id, name: row.original_name, type: row.mime_type, size: row.size_bytes, description: row.description,
		sortOrder: row.sort_order, createdAt: row.created_at, url: `/api/media/${encodeURIComponent(row.id)}` };
}

function stableShuffleRank(seed: string, value: string): number {
	let hash = 2166136261;
	for (const character of `${seed}:${value}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
	return hash >>> 0;
}

async function mediaRows(env: ShaloomEnv, chapterId: string, plan: Tier, shuffleSeed?: string): Promise<MediaRow[]> {
	const result = await env.DB.prepare("SELECT * FROM media WHERE chapter_id = ? ORDER BY sort_order ASC, created_at ASC, id ASC").bind(chapterId).all<MediaRow>();
	const rows = result.results ?? [];
	if (plan !== "free") return rows;
	return rows.map((row) => ({ row, sort: stableShuffleRank(shuffleSeed || crypto.randomUUID(), row.id) }))
		.sort((a, b) => a.sort - b.sort || a.row.id.localeCompare(b.row.id)).map(({ row }) => row);
}

async function accessibleChapter(request: Request, env: ShaloomEnv, chapterId: string, user: UserRow): Promise<ChapterRow | null> {
	const chapter = await env.DB.prepare("SELECT * FROM chapters WHERE id = ?").bind(chapterId).first<ChapterRow>();
	if (!chapter || !(await canReadChapter(request, env, user, chapter))) return null;
	return chapter;
}

async function apiMe(request: Request, env: ShaloomEnv): Promise<Response> {
	const user = await authenticate(request, env);
	if (!user) return jsonResponse({ user: null });
	const cap = BASE_CAPS[await currentTier(user)];
	return jsonResponse({ user: userPublic(user), limits: cap, chapterCapacity: await chapterCapacity(env, user) });
}

async function apiRegister(request: Request, env: ShaloomEnv): Promise<Response> {
	if (!isOriginOkay(request)) return fail("Request origin was not accepted.", 403);
	const body = await jsonBody<{ username?: unknown; password?: unknown; recoveryPasscode?: unknown }>(request);
	const username = normalizeUsername(body?.username);
	const password = typeof body?.password === "string" ? body.password : "";
	const passcode = body?.recoveryPasscode;
	if (!username) return fail("Username must be 3–24 letters, numbers, periods, underscores, or hyphens.");
	if (password.length < 12 || password.length > 128) return fail("Password must be 12–128 characters.");
	if (passcode !== undefined && passcode !== "" && (typeof passcode !== "string" || passcode.length < 8 || passcode.length > 128)) return fail("Recovery passcode must be 8–128 characters.");
	const usernameKey = username.toLowerCase();
	const existing = await env.DB.prepare("SELECT id FROM users WHERE username_key = ?").bind(usernameKey).first();
	if (existing) return fail("That username is already in use.", 409);
	const userId = crypto.randomUUID();
	const now = Date.now();
	const passwordHash = await hashSecret(password);
	const recoveryHash = typeof passcode === "string" && passcode ? await hashSecret(passcode) : null;
	try {
		await env.DB.prepare("INSERT INTO users (id, username, username_key, password_hash, recovery_hash, plan, token_version, created_at) VALUES (?, ?, ?, ?, ?, 'free', 1, ?)")
			.bind(userId, username, usernameKey, passwordHash, recoveryHash, now).run();
	} catch { return fail("That username is already in use.", 409); }
	const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<UserRow>();
	if (!user) return fail("Account could not be created.", 500);
	const csrf = randomToken(24);
	return addHeaders(jsonResponse({ user: userPublic(user) }, 201), [
		["set-cookie", sessionCookie(await mintSession(env, user))], ["set-cookie", csrfCookie(csrf)],
	]);
}

async function apiLogin(request: Request, env: ShaloomEnv): Promise<Response> {
	if (!isOriginOkay(request)) return fail("Request origin was not accepted.", 403);
	const body = await jsonBody<{ username?: unknown; password?: unknown }>(request);
	const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
	const password = typeof body?.password === "string" ? body.password : "";
	if (!username || !password) return fail("Username or password was not recognized.", 401);
	if (!await authAttemptAllowed(request, env, "login", username)) return fail("Too many sign-in attempts. Wait 15 minutes and try again.", 429);
	const user = await env.DB.prepare("SELECT * FROM users WHERE username_key = ?").bind(username).first<UserRow>();
	if (!user || !(await verifySecret(password, user.password_hash))) return fail("Username or password was not recognized.", 401);
	const csrf = randomToken(24);
	return addHeaders(jsonResponse({ user: userPublic(user) }), [
		["set-cookie", sessionCookie(await mintSession(env, user))], ["set-cookie", csrfCookie(csrf)],
	]);
}

async function apiLogout(request: Request, env: ShaloomEnv): Promise<Response> {
	const user = await authenticate(request, env);
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	if (user) await env.DB.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").bind(user.id).run();
	return addHeaders(jsonResponse({ ok: true }), [["set-cookie", clearSessionCookie()], ["set-cookie", clearCsrfCookie()]]);
}

async function apiRecoveryVerify(request: Request, env: ShaloomEnv): Promise<Response> {
	if (!isOriginOkay(request)) return fail("Request origin was not accepted.", 403);
	const body = await jsonBody<{ username?: unknown; passcode?: unknown }>(request);
	const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
	const passcode = typeof body?.passcode === "string" ? body.passcode : "";
	if (!username || !await authAttemptAllowed(request, env, "recovery", username)) return fail("Recovery could not be verified. If you made too many attempts, wait 15 minutes and try again.", 429);
	const user = await env.DB.prepare("SELECT * FROM users WHERE username_key = ?").bind(username).first<UserRow>();
	if (!user || !user.recovery_hash || !(await verifySecret(passcode, user.recovery_hash))) return fail("Recovery could not be verified.", 400);
	if (await passwordChangedTooRecently(user)) return fail("Only one password reset is allowed per 24 hours.", 429);
	return addHeaders(jsonResponse({ ok: true, message: "Passcode verified. Choose a new password." }), [["set-cookie", recoveryCookie(await mintRecoveryToken(env, user))]]);
}

async function apiRecoveryComplete(request: Request, env: ShaloomEnv): Promise<Response> {
	if (!isOriginOkay(request)) return fail("Request origin was not accepted.", 403);
	const body = await jsonBody<{ newPassword?: unknown }>(request);
	const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
	if (newPassword.length < 12 || newPassword.length > 128) return fail("New password must be 12–128 characters.");
	const token = await verifyRecoveryToken(env, cookieValue(request, "storyloom_recovery"));
	if (!token) return fail("Recovery timed out. Start again with your username and passcode.", 401);
	const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(token.userId).first<UserRow>();
	if (!user || user.token_version !== token.tokenVersion) return fail("Recovery timed out. Start again with your username and passcode.", 401);
	if (await passwordChangedTooRecently(user)) return fail("Only one password reset is allowed per 24 hours.", 429);
	await env.DB.prepare("UPDATE users SET password_hash = ?, password_changed_at = ?, token_version = token_version + 1 WHERE id = ?")
		.bind(await hashSecret(newPassword), Date.now(), user.id).run();
	return addHeaders(jsonResponse({ ok: true, message: "Password updated. Sign in with the new password." }), [
		["set-cookie", clearSessionCookie()], ["set-cookie", clearCsrfCookie()], ["set-cookie", clearRecoveryCookie()],
	]);
}

async function apiPasswordChange(request: Request, env: ShaloomEnv, user: UserRow): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	if (await passwordChangedTooRecently(user)) return fail("Only one password change is allowed per 24 hours.", 429);
	const body = await jsonBody<{ newPassword?: unknown }>(request);
	const password = typeof body?.newPassword === "string" ? body.newPassword : "";
	if (password.length < 12 || password.length > 128) return fail("New password must be 12–128 characters.");
	await env.DB.prepare("UPDATE users SET password_hash = ?, password_changed_at = ?, token_version = token_version + 1 WHERE id = ?")
		.bind(await hashSecret(password), Date.now(), user.id).run();
	return addHeaders(jsonResponse({ ok: true, message: "Password updated. Sign in again." }), [["set-cookie", clearSessionCookie()]]);
}

async function apiSetRecovery(request: Request, env: ShaloomEnv, user: UserRow): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	const body = await jsonBody<{ passcode?: unknown }>(request);
	const passcode = typeof body?.passcode === "string" ? body.passcode : "";
	if (passcode.length < 8 || passcode.length > 128) return fail("Recovery passcode must be 8–128 characters.");
	await env.DB.prepare("UPDATE users SET recovery_hash = ? WHERE id = ?").bind(await hashSecret(passcode), user.id).run();
	return jsonResponse({ ok: true, recoveryEnabled: true });
}

async function apiChangeUsername(request: Request, env: ShaloomEnv, user: UserRow): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	const body = await jsonBody<{ username?: unknown }>(request);
	const username = normalizeUsername(body?.username);
	if (!username) return fail("Username must be 3–24 letters, numbers, periods, underscores, or hyphens.");
	const usernameKey = username.toLowerCase();
	const existing = await env.DB.prepare("SELECT id FROM users WHERE username_key = ?").bind(usernameKey).first<{ id: string }>();
	if (existing && existing.id !== user.id) return fail("That username is already in use.", 409);
	try {
		await env.DB.prepare("UPDATE users SET username = ?, username_key = ? WHERE id = ?")
			.bind(username, usernameKey, user.id).run();
	} catch { return fail("That username is already in use.", 409); }
	return jsonResponse({ user: userPublic({ ...user, username, username_key: usernameKey }) });
}

async function apiChapters(request: Request, env: ShaloomEnv, user: UserRow): Promise<Response> {
	if (request.method === "GET") {
		const result = await env.DB.prepare("SELECT c.*, COUNT(m.id) AS media_count FROM chapters c LEFT JOIN media m ON m.chapter_id = c.id WHERE c.user_id = ? GROUP BY c.id ORDER BY c.created_at ASC")
			.bind(user.id).all<ChapterRow & { media_count: number }>();
		return jsonResponse({ chapters: result.results ?? [], capacity: await chapterCapacity(env, user) });
	}
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	if (request.method !== "POST") return fail("Method not allowed.", 405);
	const body = await jsonBody<{ title?: unknown }>(request);
	const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
	if (!title) return fail("Give this chapter a title.");
	const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM chapters WHERE user_id = ?").bind(user.id).first<{ total: number }>();
	const limit = await chapterCapacity(env, user);
	if (Number(count?.total ?? 0) >= limit) return fail(`Chapter limit reached (${limit}). Upgrade or purchase chapter slots to add another.`, 409);
	const baseChapterLimit = BASE_CAPS[await currentTier(user)].chapters;
	const capacityTier = Number(count?.total ?? 0) >= baseChapterLimit ? await availableChapterSlotTier(env, user.id) : null;
	if (Number(count?.total ?? 0) >= baseChapterLimit && !capacityTier) return fail("No purchased chapter spaces remain.", 409);
	const id = crypto.randomUUID();
	const now = Date.now();
	await env.DB.prepare("INSERT INTO chapters (id, user_id, title, is_private, capacity_tier, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)")
		.bind(id, user.id, title, capacityTier, now, now).run();
	return jsonResponse({ id, title, isPrivate: false }, 201);
}

async function apiSpark(env: ShaloomEnv): Promise<Response> {
	const result = await env.DB.prepare("SELECT c.id, c.title, c.created_at, u.username, COUNT(m.id) AS media_count FROM chapters c JOIN users u ON u.id = c.user_id LEFT JOIN media m ON m.chapter_id = c.id WHERE c.is_private = 0 GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100").all();
	return jsonResponse({ chapters: result.results ?? [] });
}

async function apiChapterGallery(request: Request, env: ShaloomEnv, user: UserRow, chapterId: string): Promise<Response> {
	const chapter = await accessibleChapter(request, env, chapterId, user);
	if (!chapter) return fail("Chapter was not found or access was not granted.", 404);
	const url = new URL(request.url);
	const rows = await mediaRows(env, chapterId, await currentTier(user), url.searchParams.get("shuffle") ?? undefined);
	const from = Math.max(0, Math.min(100_000, Number.parseInt(url.searchParams.get("from") ?? "0", 10) || 0));
	const count = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("count") ?? "20", 10) || 20));
	const items = rows.slice(from, from + count).map((row, index) => ({
		image_id: from + index,
		key: row.id,
		file: row.original_name,
		title: row.original_name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
		description: row.description,
		isVideo: row.mime_type === "video/mp4",
		url: `/api/media/${encodeURIComponent(row.id)}`,
		posterUrl: `/api/media/${encodeURIComponent(row.id)}`,
	}));
	return jsonResponse({ items, total: rows.length, from, count, order: await currentTier(user) === "free" ? "shuffled" : "planned" });
}

async function apiChapter(request: Request, env: ShaloomEnv, user: UserRow, chapterId: string): Promise<Response> {
	const chapter = await accessibleChapter(request, env, chapterId, user);
	if (!chapter) return fail("Chapter was not found or access was not granted.", 404);
	if (request.method === "GET") {
		const [media, caps] = await Promise.all([mediaRows(env, chapterId, await currentTier(user)), mediaCapacity(env, user, chapterId)]);
		return jsonResponse({ chapter: { id: chapter.id, title: chapter.title, isPrivate: Boolean(chapter.is_private), owner: chapter.user_id === user.id,
			canEdit: chapter.user_id === user.id, createdAt: chapter.created_at }, media: media.map(mediaView), limits: caps });
	}
	if (chapter.user_id !== user.id) return fail("Only the chapter owner can change it.", 403);
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	if (request.method === "DELETE") {
		const media = await env.DB.prepare("SELECT r2_key FROM media WHERE chapter_id = ?").bind(chapter.id).all<{ r2_key: string }>();
		if (media.results?.length) await env.MEDIA.delete(media.results.map((row) => row.r2_key));
		await env.DB.prepare("DELETE FROM chapters WHERE id = ? AND user_id = ?").bind(chapter.id, user.id).run();
		return jsonResponse({ ok: true });
	}
	if (request.method !== "PUT") return fail("Method not allowed.", 405);
	const body = await jsonBody<{ title?: unknown; isPrivate?: unknown; shareCode?: unknown }>(request);
	const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : chapter.title;
	const isPrivate = Boolean(body?.isPrivate);
	let codeHash = chapter.share_code_hash;
	if (isPrivate && user.plan === "free") return fail("Private chapters are available on Standard and Zealous.", 403);
	if (isPrivate && (!chapter.is_private || body?.shareCode !== undefined)) {
		if (!isValidPrivateCode(body?.shareCode)) return fail("Private chapter code must be exactly 8 letters or numbers.");
		codeHash = await hashSecret(body.shareCode);
	}
	if (!isPrivate) codeHash = null;
	await env.DB.prepare("UPDATE chapters SET title = ?, is_private = ?, share_code_hash = ?, updated_at = ? WHERE id = ? AND user_id = ?")
		.bind(title || "Untitled chapter", isPrivate ? 1 : 0, codeHash, Date.now(), chapter.id, user.id).run();
	return jsonResponse({ ok: true, title: title || "Untitled chapter", isPrivate });
}

async function apiChapterAccess(request: Request, env: ShaloomEnv, user: UserRow, chapterId: string): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	const chapter = await env.DB.prepare("SELECT * FROM chapters WHERE id = ?").bind(chapterId).first<ChapterRow>();
	if (!chapter) return fail("Chapter not found.", 404);
	if (!chapter.is_private || chapter.user_id === user.id) return jsonResponse({ ok: true });
	const body = await jsonBody<{ code?: unknown }>(request);
	if (!await authAttemptAllowed(request, env, "chapter-access", chapter.id)) return fail("Too many attempts. Wait 15 minutes before trying this chapter code again.", 429);
	if (!isValidPrivateCode(body?.code) || !chapter.share_code_hash || !(await verifySecret(body.code, chapter.share_code_hash))) return fail("That chapter code was not accepted.", 403);
	const token = await scopedChapterToken(env, user.id, chapterId);
	return addHeaders(jsonResponse({ ok: true }), [["set-cookie", chapterAccessCookie(chapterId, token)]]);
}

async function apiUpload(request: Request, env: ShaloomEnv, user: UserRow, chapterId: string): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	if (request.method !== "POST") return fail("Method not allowed.", 405);
	const chapter = await chapterForUser(env, chapterId, user.id);
	if (!chapter) return fail("Chapter not found.", 404);
	const form = await request.formData();
	const file = form.get("file");
	if (!(file instanceof File)) return fail("Choose a media file first.");
	const descriptionRaw = form.get("description");
	const description = typeof descriptionRaw === "string" ? descriptionRaw.trim().slice(0, 2000) : "";
	const name = safeName(file.name);
	const extension = name.split(".").pop()?.toLowerCase() ?? "";
	const caps = await mediaCapacity(env, user, chapterId);
	if (file.size <= 0 || file.size > caps.maxBytes) return fail(`This plan allows files up to ${Math.floor(caps.maxBytes / 1024 / 1024)} MB.`, 413);
	const imageCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM media WHERE chapter_id = ? AND mime_type != 'video/mp4'").bind(chapterId).first<{ total: number }>();
	const videoCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM media WHERE chapter_id = ? AND mime_type = 'video/mp4'").bind(chapterId).first<{ total: number }>();
	const input = new Uint8Array(await file.arrayBuffer());
	let bytes: Uint8Array<ArrayBufferLike> = input;
	let mime: AcceptedMedia;
	let cleaned = 0;
	if (["png", "jpg", "gif"].includes(extension)) {
		if (!caps.imageTypes.includes(extension === "jpg" ? "image/jpeg" : `image/${extension}`)) return fail("This image format is not available on your current plan.", 415);
		let result;
		try { result = sniffAndCleanImage(input, extension); } catch (error) { return fail(error instanceof Error ? error.message : "Image could not be checked.", 415); }
		bytes = result.bytes;
		mime = result.mime;
		cleaned = 1;
		if (Number(imageCount?.total ?? 0) >= caps.images) return fail(`Image limit reached (${caps.images}). Remove an image or add a media pack / upgrade.`, 409);
	} else if (extension === "mp4") {
		if (!caps.videoTypes.includes("video/mp4")) return fail("Video uploads are not available on your current plan.", 415);
		if (!sniffMp4(input)) return fail("The file does not contain valid MP4 media.", 415);
		mime = "video/mp4";
		if (Number(videoCount?.total ?? 0) >= caps.videos) return fail(`Video limit reached (${caps.videos}). Remove a video or add a media pack / upgrade.`, 409);
	} else return fail("Only PNG, JPG, GIF, and MP4 files are accepted. Use the .jpg extension for JPEG images.", 415);
	const mediaId = crypto.randomUUID();
	const key = `users/${user.id}/chapters/${chapterId}/${mediaId}.${extension}`;
	await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
	const order = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) AS last FROM media WHERE chapter_id = ?").bind(chapterId).first<{ last: number }>();
	try {
		await env.DB.prepare("INSERT INTO media (id, chapter_id, user_id, r2_key, original_name, mime_type, size_bytes, description, sort_order, metadata_cleaned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
			.bind(mediaId, chapterId, user.id, key, name, mime, bytes.length, description, Number(order?.last ?? -1) + 1, cleaned, Date.now()).run();
	} catch (error) {
		await env.MEDIA.delete(key);
		throw error;
	}
	return jsonResponse({ media: { id: mediaId, name, type: mime, size: bytes.length, description, metadataCleaned: Boolean(cleaned), url: `/api/media/${mediaId}` } }, 201);
}

async function apiMedia(request: Request, env: ShaloomEnv, user: UserRow, mediaId: string): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") return fail("Method not allowed.", 405);
	const media = await env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(mediaId).first<MediaRow>();
	if (!media) return fail("Media not found.", 404);
	const chapter = await accessibleChapter(request, env, media.chapter_id, user);
	if (!chapter) return fail("Media not found or access was not granted.", 404);
	if (request.method === "HEAD") {
		const object = await env.MEDIA.head(media.r2_key);
		if (!object) return fail("Media file not found.", 404);
		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set("content-type", media.mime_type);
		headers.set("content-disposition", "inline");
		headers.set("cache-control", "private, no-store");
		headers.set("x-content-type-options", "nosniff");
		headers.set("accept-ranges", "bytes");
		headers.set("content-length", String(object.size));
		return new Response(null, { headers });
	}
	const object = await env.MEDIA.get(media.r2_key, { range: request.headers });
	if (!object) return fail("Media file not found.", 404);
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("content-type", media.mime_type);
	headers.set("content-disposition", "inline");
	headers.set("cache-control", "private, no-store");
	headers.set("x-content-type-options", "nosniff");
	headers.set("accept-ranges", "bytes");
	headers.set("content-length", String(object.size));
	if (object.range) {
		const range = object.range;
		const start = "suffix" in range ? Math.max(0, object.size - range.suffix) : (range.offset ?? 0);
		const length = "length" in range ? (range.length ?? object.size - start) : object.size - start;
		headers.set("content-range", `bytes ${start}-${start + length - 1}/${object.size}`);
		headers.set("content-length", String(length));
		return new Response(object.body, { status: 206, headers });
	}
	return new Response(object.body, { headers });
}

async function apiDeleteMedia(request: Request, env: ShaloomEnv, user: UserRow, mediaId: string): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	const media = await env.DB.prepare("SELECT * FROM media WHERE id = ? AND user_id = ?").bind(mediaId, user.id).first<MediaRow>();
	if (!media) return fail("Media not found.", 404);
	await env.MEDIA.delete(media.r2_key);
	await env.DB.prepare("DELETE FROM media WHERE id = ? AND user_id = ?").bind(mediaId, user.id).run();
	return jsonResponse({ ok: true });
}

async function apiUpdateMedia(request: Request, env: ShaloomEnv, user: UserRow, mediaId: string): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	const body = await jsonBody<{ description?: unknown }>(request);
	if (typeof body?.description !== "string") return fail("Add a description to save.");
	const description = body.description.trim().slice(0, 2000);
	const result = await env.DB.prepare("UPDATE media SET description = ? WHERE id = ? AND user_id = ?").bind(description, mediaId, user.id).run();
	if (!result.meta.changes) return fail("Media item was not found.", 404);
	return jsonResponse({ ok: true, description });
}

async function apiMediaOrder(request: Request, env: ShaloomEnv, user: UserRow, chapterId: string): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	if (user.plan === "free") return fail("Planned sorting is available on Standard and Zealous.", 403);
	const body = await jsonBody<{ mediaIds?: unknown }>(request);
	if (!Array.isArray(body?.mediaIds) || body.mediaIds.some((id) => typeof id !== "string")) return fail("Invalid media order.");
	const existing = await env.DB.prepare("SELECT id FROM media WHERE chapter_id = ? AND user_id = ? ORDER BY id").bind(chapterId, user.id).all<{ id: string }>();
	const requested = body.mediaIds as string[];
	if (requested.length !== (existing.results?.length ?? 0) || new Set(requested).size !== requested.length || requested.some((id) => !existing.results?.some((row) => row.id === id))) return fail("The list must contain every chapter item exactly once.");
	await env.DB.batch(requested.map((id, index) => env.DB.prepare("UPDATE media SET sort_order = ? WHERE id = ? AND chapter_id = ? AND user_id = ?").bind(index, id, chapterId, user.id)));
	return jsonResponse({ ok: true });
}

function stripeApiKey(env: ShaloomEnv): string | null { return env.STRIPE_API_KEY || null; }
async function stripeRequest(env: ShaloomEnv, path: string, method = "GET", form?: URLSearchParams, idempotencyKey?: string): Promise<any> {
	const key = stripeApiKey(env);
	if (!key) throw new Error("Stripe is not configured yet.");
	const headers = new Headers({ Authorization: `Basic ${btoa(`${key}:`)}` });
	if (form) headers.set("content-type", "application/x-www-form-urlencoded");
	if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
	const response = await fetch(`https://api.stripe.com/v1${path}`, { method, headers, body: form?.toString() });
	const data = await response.json().catch(() => ({})) as { error?: { message?: string }; [key: string]: any };
	if (!response.ok) throw new Error(data.error?.message || `Stripe request failed (${response.status}).`);
	return data;
}

function priceFor(env: ShaloomEnv, kind: string, tier: Tier): string | null {
	if (kind === "subscription" && tier === "standard") return env.STRIPE_PRICE_STANDARD_MONTHLY ?? null;
	if (kind === "subscription" && tier === "zealous") return env.STRIPE_PRICE_ZEALOUS_MONTHLY ?? null;
	if (kind === "chapter_slots" && tier === "standard") return env.STRIPE_PRICE_STANDARD_CHAPTERS ?? null;
	if (kind === "chapter_slots" && tier === "zealous") return env.STRIPE_PRICE_ZEALOUS_CHAPTERS ?? null;
	if (kind === "media_addon" && tier === "standard") return env.STRIPE_PRICE_STANDARD_MEDIA ?? null;
	if (kind === "media_addon" && tier === "zealous") return env.STRIPE_PRICE_ZEALOUS_MEDIA ?? null;
	return null;
}

async function apiCheckout(request: Request, env: ShaloomEnv, user: UserRow): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	const body = await jsonBody<{ kind?: unknown; tier?: unknown; chapterId?: unknown }>(request);
	const kind = typeof body?.kind === "string" ? body.kind : "";
	const tier = body?.tier;
	if (!isTier(tier) || tier === "free" || !["subscription", "chapter_slots", "media_addon"].includes(kind)) return fail("Choose a valid plan or add-on.");
	const upgrading = kind === "subscription" && Boolean(user.stripe_subscription_id);
	if (upgrading && (user.plan !== "standard" || tier !== "zealous" || !user.stripe_customer_id)) return fail("Only an active Standard membership can upgrade to Zealous.", 409);
	if (kind === "media_addon") {
		if (typeof body?.chapterId !== "string" || !(await chapterForUser(env, body.chapterId, user.id))) return fail("Choose one of your chapters for this media pack.", 404);
		if (user.plan !== tier) return fail("The media pack must match your current paid tier.", 409);
	}
	if (kind === "chapter_slots" && user.plan !== tier) return fail("The chapter pack must match your current paid tier.", 409);
	const price = priceFor(env, kind, tier);
	if (!price) return fail("Stripe price IDs are not configured yet. Create the Stripe prices and add their IDs to the Worker settings.", 503);
	const productKey = `${kind}_${tier}`;
	const form = new URLSearchParams();
	form.set("mode", kind === "subscription" ? "subscription" : "payment");
	form.set("line_items[0][price]", price);
	form.set("line_items[0][quantity]", "1");
	form.set("client_reference_id", user.id);
	form.set("success_url", `${new URL(request.url).origin}/billing?checkout=success`);
	form.set("cancel_url", `${new URL(request.url).origin}/pricing?checkout=cancelled`);
	form.set("metadata[account_id]", user.id);
	form.set("metadata[kind]", upgrading ? "upgrade" : kind);
	form.set("metadata[tier]", tier);
	if (upgrading) {
		form.set("customer", user.stripe_customer_id!);
		form.set("metadata[replaces_subscription_id]", user.stripe_subscription_id!);
	}
	if (typeof body?.chapterId === "string") form.set("metadata[chapter_id]", body.chapterId);
	if (kind === "subscription") {
		form.set("subscription_data[metadata][account_id]", user.id);
		form.set("subscription_data[metadata][tier]", tier);
	}
	try {
		const session = await stripeRequest(env, "/checkout/sessions", "POST", form, `checkout-${user.id}-${productKey}-${crypto.randomUUID()}`);
		return jsonResponse({ url: session.url });
	} catch (error) {
		return fail("Stripe could not start checkout. Check the configured price ID and billing settings, then try again.", 502);
	}
}

async function apiDowngradeSubscription(request: Request, env: ShaloomEnv, user: UserRow): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	if (user.plan !== "zealous" || !user.stripe_subscription_id) return fail("Downgrading requires a current Zealous subscription.", 409);
	const standardPrice = env.STRIPE_PRICE_STANDARD_MONTHLY;
	const zealousPrice = env.STRIPE_PRICE_ZEALOUS_MONTHLY;
	if (!stripeApiKey(env) || !standardPrice || !zealousPrice) return fail("Stripe plan prices are not configured yet.", 503);
	try {
		const subscription = await stripeRequest(env, `/subscriptions/${encodeURIComponent(user.stripe_subscription_id)}`);
		const now = Math.floor(Date.now() / 1000);
		const start = Number(subscription.current_period_start);
		const end = Number(subscription.current_period_end);
		if (subscription.status !== "active" || subscription.cancel_at_period_end || !Number.isFinite(start) || !Number.isFinite(end) || end <= now || subscription.items?.data?.length !== 1 || subscription.items.data[0].price?.id !== zealousPrice) return fail("Downgrading is available only during an active Zealous billing period.", 409);
		let scheduleId = typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id;
		if (!scheduleId) {
			const schedule = await stripeRequest(env, "/subscription_schedules", "POST", new URLSearchParams({ from_subscription: subscription.id }), `downgrade-schedule-${subscription.id}`);
			scheduleId = schedule.id;
		}
		if (!scheduleId) return fail("Stripe did not return a subscription schedule.", 502);
		const schedule = await stripeRequest(env, `/subscription_schedules/${encodeURIComponent(scheduleId)}`);
		if (schedule.phases?.some((phase: any) => phase.metadata?.tier === "standard" && phase.start_date >= end)) return jsonResponse({ ok: true, message: "Downgrade already scheduled. Zealous lasts through the paid period; then Standard is free for one month." });
		const form = new URLSearchParams({ end_behavior: "release", proration_behavior: "none" });
		form.set("phases[0][start_date]", String(start));
		form.set("phases[0][end_date]", String(end));
		form.set("phases[0][items][0][price]", zealousPrice);
		form.set("phases[0][items][0][quantity]", "1");
		form.set("phases[0][metadata][account_id]", user.id);
		form.set("phases[0][metadata][tier]", "zealous");
		form.set("phases[1][start_date]", String(end));
		form.set("phases[1][duration][interval]", "month");
		form.set("phases[1][duration][interval_count]", "1");
		form.set("phases[1][items][0][price]", standardPrice);
		form.set("phases[1][items][0][quantity]", "1");
		form.set("phases[1][trial]", "true");
		form.set("phases[1][proration_behavior]", "none");
		form.set("phases[1][metadata][account_id]", user.id);
		form.set("phases[1][metadata][tier]", "standard");
		await stripeRequest(env, `/subscription_schedules/${encodeURIComponent(scheduleId)}`, "POST", form, `downgrade-phase-${subscription.id}`);
		return jsonResponse({ ok: true, message: "Downgrade scheduled. Zealous lasts through the paid period; then Standard is free for one month, with no refund of the price difference." });
	} catch (error) { return fail(error instanceof Error ? error.message : "Could not schedule the downgrade.", 502); }
}

async function apiCancelSubscription(request: Request, env: ShaloomEnv, user: UserRow): Promise<Response> {
	const mutation = await enforceMutation(request, user);
	if (mutation) return mutation;
	if (!user.stripe_subscription_id) return fail("No active subscription was found.", 409);
	if (!stripeApiKey(env)) return fail("Stripe is not configured yet.", 503);
	const subscriptionId = user.stripe_subscription_id;
	try {
		const subscription = await stripeRequest(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
		if (subscription.cancel_at_period_end) return jsonResponse({ ok: true, refund: false, cancelAtPeriodEnd: true });
		const invoiceId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id;
		let paidAt: number | null = null;
		let paymentIntent: string | null = null;
		if (invoiceId) {
			const invoice = await stripeRequest(env, `/invoices/${encodeURIComponent(invoiceId)}`);
			paidAt = Number(invoice.status_transitions?.paid_at ?? 0) || null;
			const payments = await stripeRequest(env, `/invoice_payments?invoice=${encodeURIComponent(invoiceId)}&limit=10`);
			for (const payment of payments.data ?? []) {
				const detail = payment.payment;
				if (detail?.type === "payment_intent") paymentIntent = typeof detail.payment_intent === "string" ? detail.payment_intent : detail.payment_intent?.id;
				if (paymentIntent) break;
			}
			paymentIntent ||= typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id ?? null;
		}
		const withinRefundWindow = paidAt !== null && Date.now() - paidAt * 1000 <= 72 * 60 * 60 * 1000;
		if (withinRefundWindow) {
			if (!paymentIntent) return fail("Stripe did not return a refundable payment for the latest subscription invoice. No cancellation was applied.", 409);
			const refundForm = new URLSearchParams({ payment_intent: paymentIntent, reason: "requested_by_customer" });
			await stripeRequest(env, "/refunds", "POST", refundForm, `subscription-cancel-refund-${subscriptionId}`);
			await stripeRequest(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`, "DELETE", new URLSearchParams());
			await env.DB.batch([
				env.DB.prepare("UPDATE users SET plan = 'free', subscription_status = 'canceled', stripe_subscription_id = NULL, subscription_period_end = NULL WHERE id = ?").bind(user.id),
				env.DB.prepare("UPDATE chapters SET is_private = 0, share_code_hash = NULL, updated_at = ? WHERE user_id = ?").bind(Date.now(), user.id),
			]);
			await env.DB.prepare("INSERT OR IGNORE INTO billing_actions (id, user_id, subscription_id, action, created_at) VALUES (?, ?, ?, 'refund_cancel', ?)")
				.bind(crypto.randomUUID(), user.id, subscriptionId, Date.now()).run();
			return jsonResponse({ ok: true, refund: true, cancelAtPeriodEnd: false, message: "Subscription canceled and the latest subscription payment was refunded." });
		}
		const form = new URLSearchParams({ cancel_at_period_end: "true" });
		await stripeRequest(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`, "POST", form, `subscription-cancel-period-${subscriptionId}`);
		await env.DB.prepare("UPDATE users SET subscription_status = 'cancel_at_period_end', subscription_period_end = ? WHERE id = ?")
			.bind(Number(subscription.current_period_end ?? 0) * 1000 || null, user.id).run();
		await env.DB.prepare("INSERT OR IGNORE INTO billing_actions (id, user_id, subscription_id, action, created_at) VALUES (?, ?, ?, 'cancel_at_period_end', ?)")
			.bind(crypto.randomUUID(), user.id, subscriptionId, Date.now()).run();
		return jsonResponse({ ok: true, refund: false, cancelAtPeriodEnd: true, message: "No refund was issued. Auto-renew is off and access continues through the paid period." });
	} catch (error) {
		return fail(error instanceof Error ? error.message : "Could not cancel the subscription.", 502);
	}
}

function hex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function verifyStripeSignature(body: string, header: string, secret: string): Promise<boolean> {
	const pieces = header.split(",").map((piece) => piece.split("=", 2));
	const timestamp = pieces.find(([key]) => key === "t")?.[1];
	const signatures = pieces.filter(([key]) => key === "v1").map(([, value]) => value);
	if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const expected = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`))));
	return signatures.some((signature) => signature.length === expected.length && constantText(expected, signature));
}
function constantText(a: string, b: string): boolean { let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; }

async function handleStripeWebhook(request: Request, env: ShaloomEnv): Promise<Response> {
	if (request.method !== "POST") return fail("Method not allowed.", 405);
	if (!env.STRIPE_WEBHOOK_SECRET) return fail("Stripe webhook is not configured yet.", 503);
	const raw = await request.text();
	if (!await verifyStripeSignature(raw, request.headers.get("stripe-signature") ?? "", env.STRIPE_WEBHOOK_SECRET)) return fail("Invalid Stripe signature.", 400);
	let event: any;
	try { event = JSON.parse(raw); } catch { return fail("Invalid webhook body.", 400); }
	const object = event.data?.object;
	if (!event.id || !event.type || !object) return fail("Invalid Stripe event.", 400);
	if (await env.DB.prepare("SELECT event_id FROM stripe_events WHERE event_id = ?").bind(event.id).first()) return jsonResponse({ received: true, duplicate: true });
	const now = Date.now();
	if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
		if (object.payment_status !== "paid") return jsonResponse({ received: true, pending: true });
		const userId = object.metadata?.account_id || object.client_reference_id;
		const kind = object.metadata?.kind;
		const tier = object.metadata?.tier;
		if (!userId || !isTier(tier)) return jsonResponse({ received: true, ignored: true });
		if (kind === "upgrade" && tier === "zealous") {
			const oldId = object.metadata?.replaces_subscription_id;
			const newId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
			const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
			if (!oldId || !newId || !customerId) return fail("Upgrade session is incomplete.", 409);
			const current = await env.DB.prepare("SELECT stripe_subscription_id FROM users WHERE id = ?").bind(userId).first<{ stripe_subscription_id: string | null }>();
			if (current?.stripe_subscription_id !== oldId && current?.stripe_subscription_id !== newId) return fail("Upgrade does not match the current subscription.", 409);
			await env.DB.prepare("UPDATE users SET plan = 'zealous', stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = 'active', subscription_period_end = NULL WHERE id = ? AND stripe_subscription_id = ?")
				.bind(customerId, newId, userId, oldId).run();
			const oldSubscription = await stripeRequest(env, `/subscriptions/${encodeURIComponent(oldId)}`);
			if (oldSubscription.status !== "canceled") await stripeRequest(env, `/subscriptions/${encodeURIComponent(oldId)}`, "DELETE", new URLSearchParams({ prorate: "false", invoice_now: "false" }), `upgrade-retire-${oldId}-${newId}`);
			await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, ?)").bind(event.id, event.type, now).run();
			return jsonResponse({ received: true });
		}
		const statements: D1PreparedStatement[] = [env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, ?)").bind(event.id, event.type, now)];
		if (kind === "subscription" && (tier === "standard" || tier === "zealous")) {
			const subscriptionId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
			const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
			if (subscriptionId && customerId) statements.push(env.DB.prepare("UPDATE users SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = 'active' WHERE id = ?")
				.bind(tier, customerId, subscriptionId, userId));
		} else if (kind === "chapter_slots" && (tier === "standard" || tier === "zealous")) {
			const slots = tier === "standard" ? 10 : 20;
			statements.push(env.DB.prepare("INSERT OR IGNORE INTO chapter_slots (id, user_id, tier, slots, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
				.bind(crypto.randomUUID(), userId, tier, slots, object.id, now));
		} else if (kind === "media_addon" && (tier === "standard" || tier === "zealous") && typeof object.metadata?.chapter_id === "string") {
			const images = tier === "standard" ? 25 : 75;
			const videos = tier === "standard" ? 3 : 5;
			statements.push(env.DB.prepare("INSERT OR IGNORE INTO chapter_media_addons (id, user_id, chapter_id, tier, image_slots, video_slots, stripe_session_id, created_at) SELECT ?, ?, c.id, ?, ?, ?, ?, ? FROM chapters c WHERE c.id = ? AND c.user_id = ?")
				.bind(crypto.randomUUID(), userId, tier, images, videos, object.id, now, object.metadata.chapter_id, userId));
		}
		await env.DB.batch(statements);
	} else if (event.type === "customer.subscription.deleted") {
		const metadata = object.metadata ?? {};
		const userId = metadata.account_id;
		const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
		const current = await env.DB.prepare("SELECT id FROM users WHERE stripe_subscription_id = ? AND (id = ? OR stripe_customer_id = ?)").bind(object.id, userId ?? "", customerId ?? "").first<{ id: string }>();
		if (!current) {
			await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, ?)").bind(event.id, event.type, now).run();
			return jsonResponse({ received: true, retired: true });
		}
		await env.DB.batch([
			env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, ?)").bind(event.id, event.type, now),
			env.DB.prepare("UPDATE users SET plan = 'free', subscription_status = 'canceled', stripe_subscription_id = NULL, subscription_period_end = NULL WHERE (id = ? AND stripe_subscription_id = ?) OR (stripe_customer_id = ? AND stripe_subscription_id = ?)")
				.bind(userId ?? "", object.id, customerId ?? "", object.id),
			env.DB.prepare("UPDATE chapters SET is_private = 0, share_code_hash = NULL, updated_at = ? WHERE user_id = ?").bind(now, current.id),
		]);
	} else if (event.type === "customer.subscription.updated") {
		const tier = object.metadata?.tier;
		const userId = object.metadata?.account_id;
		const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
		const current = userId ? await env.DB.prepare("SELECT stripe_subscription_id FROM users WHERE id = ?").bind(userId).first<{ stripe_subscription_id: string | null }>() : null;
		if (userId && current?.stripe_subscription_id === object.id && (tier === "standard" || tier === "zealous")) {
			const active = object.status === "active" || object.status === "trialing" || object.cancel_at_period_end;
			const updates: D1PreparedStatement[] = [
				env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, ?)").bind(event.id, event.type, now),
				env.DB.prepare("UPDATE users SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?, subscription_period_end = ? WHERE id = ?")
					.bind(active ? tier : "free", customerId ?? null, object.id, object.status, Number(object.current_period_end ?? 0) * 1000 || null, userId),
			];
			if (!active) updates.push(env.DB.prepare("UPDATE chapters SET is_private = 0, share_code_hash = NULL, updated_at = ? WHERE user_id = ?").bind(now, userId));
			await env.DB.batch(updates);
		} else await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, ?)").bind(event.id, event.type, now).run();
	} else {
		await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, ?)").bind(event.id, event.type, now).run();
	}
	return jsonResponse({ received: true });
}

export async function handleLoomApi(request: Request, env: ShaloomEnv): Promise<Response | null> {
	const url = new URL(request.url);
	const path = url.pathname;
	if (!path.startsWith("/api/")) return null;
	// The demo gallery endpoint is served by the separate, read-only sample-media handler.
	if (path === "/api/gallery-media") return null;
	if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: allowedMethods, "access-control-allow-methods": allowedMethods, "access-control-allow-headers": "content-type,x-csrf-token", "cache-control": "no-store" } });
	if (path === "/api/stripe/webhook") return handleStripeWebhook(request, env);
	if (path === "/api/auth/csrf" && request.method === "GET") return addHeaders(jsonResponse({ ok: true }), [["set-cookie", csrfCookie(randomToken(24))]]);
	if (path === "/api/auth/username-available" && request.method === "GET") {
		const username = normalizeUsername(url.searchParams.get("username"));
		if (!username) return jsonResponse({ available: false, valid: false });
		const found = await env.DB.prepare("SELECT id FROM users WHERE username_key = ?").bind(username.toLowerCase()).first<{ id: string }>();
		const viewer = found ? await authenticate(request, env) : null;
		return jsonResponse({ available: !found || found.id === viewer?.id, valid: true });
	}
	if (path === "/api/auth/register" && request.method === "POST") return apiRegister(request, env);
	if (path === "/api/auth/login" && request.method === "POST") return apiLogin(request, env);
	if (path === "/api/auth/recover/verify" && request.method === "POST") return apiRecoveryVerify(request, env);
	if (path === "/api/auth/recover/complete" && request.method === "POST") return apiRecoveryComplete(request, env);
	const user = await authenticate(request, env);
	if (path === "/api/auth/me" && request.method === "GET") return apiMe(request, env);
	if (!user) return fail("Sign in to continue.", 401);
	if (path === "/api/auth/logout" && request.method === "POST") return apiLogout(request, env);
	if (path === "/api/auth/password" && request.method === "PUT") return apiPasswordChange(request, env, user);
	if (path === "/api/auth/recovery-passcode" && request.method === "PUT") return apiSetRecovery(request, env, user);
	if (path === "/api/auth/username" && request.method === "PUT") return apiChangeUsername(request, env, user);
	if (path === "/api/chapters" && ["GET", "POST"].includes(request.method)) return apiChapters(request, env, user);
	if (path === "/api/billing/checkout" && request.method === "POST") return apiCheckout(request, env, user);
	if (path === "/api/billing/downgrade" && request.method === "POST") return apiDowngradeSubscription(request, env, user);
	if (path === "/api/billing/cancel" && request.method === "POST") return apiCancelSubscription(request, env, user);
	if (path === "/api/spark" && request.method === "GET") return apiSpark(env);
	const accessMatch = path.match(/^\/api\/chapters\/([\w-]+)\/access$/);
	if (accessMatch && request.method === "POST") return apiChapterAccess(request, env, user, accessMatch[1]);
	const chapterGalleryMatch = path.match(/^\/api\/chapters\/([\w-]+)\/gallery-media$/);
	if (chapterGalleryMatch && request.method === "GET") return apiChapterGallery(request, env, user, chapterGalleryMatch[1]);
	const uploadMatch = path.match(/^\/api\/chapters\/([\w-]+)\/media$/);
	if (uploadMatch && request.method === "POST") return apiUpload(request, env, user, uploadMatch[1]);
	const orderMatch = path.match(/^\/api\/chapters\/([\w-]+)\/media\/order$/);
	if (orderMatch && request.method === "PUT") return apiMediaOrder(request, env, user, orderMatch[1]);
	const chapterMatch = path.match(/^\/api\/chapters\/([\w-]+)$/);
	if (chapterMatch && ["GET", "PUT", "DELETE"].includes(request.method)) return apiChapter(request, env, user, chapterMatch[1]);
	const mediaDeleteMatch = path.match(/^\/api\/media\/([\w-]+)$/);
	if (mediaDeleteMatch && request.method === "DELETE") return apiDeleteMedia(request, env, user, mediaDeleteMatch[1]);
	const mediaUpdateMatch = path.match(/^\/api\/media\/([\w-]+)$/);
	if (mediaUpdateMatch && request.method === "PUT") return apiUpdateMedia(request, env, user, mediaUpdateMatch[1]);
	const mediaMatch = path.match(/^\/api\/media\/([\w-]+)$/);
	if (mediaMatch && ["GET", "HEAD"].includes(request.method)) return apiMedia(request, env, user, mediaMatch[1]);
	return fail("API route not found.", 404);
}
