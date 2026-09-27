import { isGalleryMediaKey, orderGalleryMedia } from "./gallery-catalog";

const CONTENT_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	mp4: "video/mp4",
};

function mediaContentType(key: string): string {
	return CONTENT_TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function titleFromKey(key: string): string {
	const filename = key.split("/").pop() ?? "Memory";
	return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Memory";
}

async function listAllDemoMedia(bucket: R2Bucket): Promise<R2Object[]> {
	const objects: R2Object[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix: "demo/", limit: 1000, cursor });
		objects.push(...page.objects.filter((object) => isGalleryMediaKey(object.key)));
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return objects;
}

export async function galleryMediaResponse(request: Request, bucket: R2Bucket): Promise<Response> {
	if (request.method !== "GET") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
	}

	const url = new URL(request.url);
	const from = Math.max(0, Math.min(100_000, Number.parseInt(url.searchParams.get("from") ?? "0", 10) || 0));
	const count = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("count") ?? "20", 10) || 20));
	const requestedSeed = url.searchParams.get("shuffle");
	const seed = requestedSeed && requestedSeed.length <= 80 ? requestedSeed : undefined;
	const objects = await listAllDemoMedia(bucket);
	const objectByKey = new Map(objects.map((object) => [object.key, object]));
	const uploadedKeys = objects
		.slice()
		.sort((left, right) => left.uploaded.getTime() - right.uploaded.getTime()
			|| left.key.localeCompare(right.key, "en", { numeric: true, sensitivity: "base" }))
		.map((object) => object.key);
	const keys = seed ? orderGalleryMedia(uploadedKeys, seed) : uploadedKeys;
	const items = keys.slice(from, from + count).map((key, index) => {
		const isVideo = key.toLowerCase().endsWith(".mp4");
		const filename = key.split("/").pop() ?? key;
		const posterKey = isVideo ? `demo/posters/${filename.replace(/\.mp4$/i, ".jpg")}` : key;
		const description = objectByKey.get(key)?.customMetadata?.description?.trim().slice(0, 2000) ?? "";
		return {
			image_id: from + index,
			key,
			file: filename,
			title: titleFromKey(filename),
			description,
			isVideo,
			url: `/media/${encodeURIComponent(key)}`,
			posterUrl: `/media/${encodeURIComponent(posterKey)}`,
		};
	});

	return Response.json(
		{ items, total: keys.length, from, count, order: seed ? "shuffled" : "stable" },
		{ headers: { "cache-control": "public, max-age=30, s-maxage=300", "x-content-type-options": "nosniff" } },
	);
}

function isSafeDemoObjectKey(key: string): boolean {
	if (!key.startsWith("demo/") || key.includes("\\") || key.includes("..")) return false;
	const segments = key.split("/");
	if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
	return isGalleryMediaKey(key) || /^demo\/posters\/[A-Za-z0-9._-]+\.jpg$/i.test(key);
}

function headersForObject(object: R2Object, key: string): Headers {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("content-type", mediaContentType(key));
	headers.set("etag", object.httpEtag);
	headers.set("x-content-type-options", "nosniff");
	headers.set("cache-control", "public, max-age=300, s-maxage=86400, immutable");
	headers.set("accept-ranges", "bytes");
	return headers;
}

export async function demoMediaResponse(request: Request, bucket: R2Bucket): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
	}

	let key: string;
	try {
		key = decodeURIComponent(new URL(request.url).pathname.slice("/media/".length));
	} catch {
		return new Response("Not Found", { status: 404 });
	}
	if (!isSafeDemoObjectKey(key)) return new Response("Not Found", { status: 404 });

	if (request.method === "HEAD") {
		const object = await bucket.head(key);
		if (!object) return new Response("Not Found", { status: 404 });
		const headers = headersForObject(object, key);
		headers.set("content-length", String(object.size));
		return new Response(null, { status: 200, headers });
	}

	const object = await bucket.get(key, { range: request.headers });
	if (!object) return new Response("Not Found", { status: 404 });
	const headers = headersForObject(object, key);
	let status = 200;
	if (object.range) {
		const range = object.range;
		const offset = "offset" in range && typeof range.offset === "number"
			? range.offset
			: "suffix" in range ? Math.max(0, object.size - range.suffix) : 0;
		const returnedLength = "length" in range && typeof range.length === "number"
			? range.length
			: Math.max(0, object.size - offset);
		headers.set("content-range", `bytes ${offset}-${offset + returnedLength - 1}/${object.size}`);
		headers.set("content-length", String(returnedLength));
		status = 206;
	} else {
		headers.set("content-length", String(object.size));
	}
	return new Response(object.body, { status, headers });
}
