import test from "node:test";
import assert from "node:assert/strict";
import { authPagePath, safeReturnTo } from "../app/auth-navigation.ts";
import { galleryLoginRedirect } from "../workers/gallery-access.ts";
import { mintSession, signJwt, type ShaloomEnv, type UserRow } from "../workers/security.ts";

test("shared gallery destination survives login, signup, and recovery links", () => {
	const destination = "/gallery/chapter-123?shuffle=visit#artwork";
	for (const page of ["/login", "/signup", "/recover"] as const) {
		const url = new URL(authPagePath(page, destination), "https://shaloom.space");
		assert.equal(url.pathname, page);
		assert.equal(safeReturnTo(url.searchParams.get("returnTo")), destination);
	}
	assert.equal(authPagePath("/login"), "/login");
	assert.equal(safeReturnTo(null), "/gallery");
});

test("return links cannot leave the app or loop through auth pages", () => {
	for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/login?returnTo=/login", "/signup", "/recover", "/api/auth/logout", "/%2f%2fevil.example", "/gallery/id\n", "/gallery/../login", "javascript:alert(1)", "/gallery/" + "x".repeat(2048)]) {
		assert.equal(safeReturnTo(value), "/gallery", value);
		assert.equal(new URL(authPagePath("/login", value), "https://shaloom.space").searchParams.get("returnTo"), "/gallery");
	}
});

test("opening a shared gallery without a session redirects to login before media loads", async () => {
	const response = await galleryLoginRedirect(new Request("https://shaloom.space/gallery/chapter-123"), "chapter-123", {} as ShaloomEnv);
	assert.equal(response?.status, 302);
	assert.equal(response.headers.get("Location"), "/login?returnTo=%2Fgallery%2Fchapter-123");
	assert.equal(response.headers.get("Cache-Control"), "private, no-store");
	assert.equal(response.headers.get("Vary"), "Cookie");
	assert.equal(await galleryLoginRedirect(new Request("https://shaloom.space/demo"), undefined, {} as ShaloomEnv), null);
});

test("a valid session opens a shared gallery; expired or revoked sessions redirect", async () => {
	const user = { id: "viewer", token_version: 0 } as UserRow;
	const env = { JWT_KEY: "ab".repeat(32), DB: { prepare: () => ({ bind: () => ({ first: async () => user }) }) } } as unknown as ShaloomEnv;
	const token = await mintSession(env, user);
	const request = new Request("https://shaloom.space/gallery/chapter-123", { headers: { Cookie: `storyloom_session=${token}` } });
	assert.equal(await galleryLoginRedirect(request, "chapter-123", env), null);
	const expired = await signJwt(env, { sub: user.id, ver: 0, iat: 1, exp: 2 });
	assert.equal((await galleryLoginRedirect(new Request(request.url, { headers: { Cookie: `storyloom_session=${expired}` } }), "chapter-123", env))?.status, 302);
	user.token_version = 1;
	assert.equal((await galleryLoginRedirect(request, "chapter-123", env))?.status, 302);
	assert.equal((await galleryLoginRedirect(new Request(request.url, { headers: { Cookie: "storyloom_session=invalid" } }), "chapter-123", env))?.status, 302);
});
