import { authPagePath } from "../app/auth-navigation.ts";
import { authenticate, type ShaloomEnv } from "./security.ts";

export async function galleryLoginRedirect(request: Request, chapterId: string | undefined, env: ShaloomEnv): Promise<Response | null> {
	// The standalone demo remains accessible without an account.
	if (!chapterId || await authenticate(request, env)) return null;
	const url = new URL(request.url);
	const returnTo = `/gallery/${encodeURIComponent(chapterId)}${url.search}`;
	return new Response(null, { status: 302, headers: {
		Location: authPagePath("/login", returnTo),
		"Cache-Control": "private, no-store",
		Vary: "Cookie",
	} });
}
