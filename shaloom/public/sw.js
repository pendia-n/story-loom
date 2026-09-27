const CACHE_NAME = "shaloom-static-v1";
const STATIC_ASSETS = [
	"/manifest.webmanifest",
	"/shaloom.svg",
	"/gallery-engine.js",
	"/gallery-res/wall.jpg",
	"/gallery-res/floor.jpg",
];

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith("shaloom-static-") && name !== CACHE_NAME).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (request.method !== "GET" || url.origin !== self.location.origin) return;
	// Never cache account data, chapter media, access checks, or user-specific HTML.
	if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/") || request.mode === "navigate") return;
	const staticAsset = /\.(?:css|js|svg|png|jpe?g|webp|woff2?|webmanifest)$/.test(url.pathname);
	if (!staticAsset) return;
	const fingerprinted = url.pathname.startsWith("/assets/") && /-[a-z\d]{8,}\./i.test(url.pathname);
	event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
		if (fingerprinted) {
			const cached = await cache.match(request);
			if (cached) return cached;
		}
		try {
			const response = await fetch(request);
			if (response.ok && response.type === "basic") await cache.put(request, response.clone());
			return response;
		} catch (error) {
			const cached = await cache.match(request);
			if (cached) return cached;
			throw error;
		}
	}));
});
