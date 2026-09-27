import { createRequestHandler } from "react-router";
import { demoMediaResponse, galleryMediaResponse } from "./gallery-api";
import { handleLoomApi } from "./loom-api";
import type { ShaloomEnv } from "./security";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

function secureResponse(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("x-content-type-options", "nosniff");
	headers.set("x-frame-options", "DENY");
	headers.set("referrer-policy", "strict-origin-when-cross-origin");
	headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
	headers.set("cross-origin-opener-policy", "same-origin");
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const appEnv = env as Env & ShaloomEnv;
		try {
			const apiResponse = await handleLoomApi(request, appEnv);
			if (apiResponse) return secureResponse(apiResponse);
			if (url.pathname === "/api/gallery-media") return secureResponse(await galleryMediaResponse(request, appEnv.MEDIA));
			if (url.pathname.startsWith("/media/")) return secureResponse(await demoMediaResponse(request, appEnv.MEDIA));
			return secureResponse(await requestHandler(request));
		} catch {
			return secureResponse(new Response("The request could not be completed. Please try again.", {
				status: 500,
				headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
			}));
		}
	},
} satisfies ExportedHandler<Env>;
