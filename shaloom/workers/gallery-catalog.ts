const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export function isGalleryMediaKey(key: string): boolean {
	if (!key.startsWith("demo/") || key.includes("\\") || key.includes("..")) return false;
	if (key.startsWith("demo/posters/")) return false;
	const extension = key.split(".").pop()?.toLowerCase();
	return extension === "mp4" || (extension !== undefined && IMAGE_EXTENSIONS.has(extension));
}

function hashSeed(seed: string): number {
	let hash = 2166136261;
	for (let index = 0; index < seed.length; index++) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function orderGalleryMedia(keys: string[], shuffleSeed?: string): string[] {
	const ordered = keys.filter(isGalleryMediaKey).sort((left, right) =>
		left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }),
	);
	if (!shuffleSeed || ordered.length < 2) return ordered;

	let state = hashSeed(shuffleSeed);
	for (let index = ordered.length - 1; index > 0; index--) {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		const random = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
		const swapIndex = Math.floor(random * (index + 1));
		[ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
	}
	return ordered;
}
