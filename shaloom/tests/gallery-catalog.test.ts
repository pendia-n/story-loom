import test from "node:test";
import assert from "node:assert/strict";
import { isGalleryMediaKey, orderGalleryMedia } from "../workers/gallery-catalog.ts";

test("gallery catalogue includes supported demo media and excludes generated covers", () => {
	assert.equal(isGalleryMediaKey("demo/3.png"), true);
	assert.equal(isGalleryMediaKey("demo/10.jpg"), true);
	assert.equal(isGalleryMediaKey("demo/clip.mp4"), true);
	assert.equal(isGalleryMediaKey("demo/posters/clip.webp"), false);
	assert.equal(isGalleryMediaKey("other/3.png"), false);
	assert.equal(isGalleryMediaKey("demo/icon.svg"), false);
});

test("media order is stable and naturally sorted unless an explicit shuffle seed is given", () => {
	const keys = ["demo/10.png", "demo/2.png", "demo/1.png"];
	assert.deepEqual(orderGalleryMedia(keys), ["demo/1.png", "demo/2.png", "demo/10.png"]);
	assert.deepEqual(orderGalleryMedia(keys), orderGalleryMedia(keys));
	assert.notDeepEqual(orderGalleryMedia(keys, "preview-seed"), orderGalleryMedia(keys));
	assert.deepEqual(orderGalleryMedia(keys, "preview-seed"), orderGalleryMedia(keys, "preview-seed"));
});
