import test from "node:test";
import assert from "node:assert/strict";
import { sniffAndCleanImage } from "../workers/media-clean.ts";

const ascii = (value: string) => new TextEncoder().encode(value);
const join = (...parts: Uint8Array[]) => {
	const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
	let offset = 0;
	for (const part of parts) { bytes.set(part, offset); offset += part.length; }
	return bytes;
};
const contains = (bytes: Uint8Array, needle: string) => new TextDecoder().decode(bytes).includes(needle);
const includesBytes = (bytes: Uint8Array, needle: number[]) => bytes.some((_, start) => needle.every((value, index) => bytes[start + index] === value));

function pngChunk(type: string, data: Uint8Array = new Uint8Array()) {
	const header = new Uint8Array(8 + data.length + 4);
	new DataView(header.buffer).setUint32(0, data.length);
	header.set(ascii(type), 4);
	header.set(data, 8);
	return header;
}

function jpegSegment(marker: number, payload: string | Uint8Array) {
	const data = typeof payload === "string" ? ascii(payload) : payload;
	const result = new Uint8Array(data.length + 4);
	result.set([0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff]);
	result.set(data, 4);
	return result;
}

test("PNG cleansing removes textual, EXIF, and unknown ancillary chunks while retaining rendering chunks", () => {
	const input = join(
		new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
		pngChunk("IHDR", new Uint8Array(13)),
		pngChunk("tRNS", ascii("alpha")),
		pngChunk("eXIf", ascii("GPS-PRIVATE")),
		pngChunk("iTXt", ascii("COMMENT-PRIVATE")),
		pngChunk("vpAg", ascii("VENDOR-PRIVATE")),
		pngChunk("IDAT", ascii("pixels")),
		pngChunk("IEND"),
	);
	const result = sniffAndCleanImage(input, "png");
	assert.equal(result.mime, "image/png");
	assert.equal(contains(result.bytes, "GPS-PRIVATE"), false);
	assert.equal(contains(result.bytes, "COMMENT-PRIVATE"), false);
	assert.equal(contains(result.bytes, "VENDOR-PRIVATE"), false);
	assert.equal(contains(result.bytes, "tRNS"), true);
	assert.equal(contains(result.bytes, "pixels"), true);
});

test("JPEG cleansing removes APP and comment metadata before and between progressive scans", () => {
	const input = join(
		new Uint8Array([0xff, 0xd8]),
		jpegSegment(0xe3, "PRIVATE-APP3"),
		jpegSegment(0xdb, "DQT"),
		jpegSegment(0xda, "SCAN-HEADER-1"),
		new Uint8Array([0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33]),
		jpegSegment(0xef, "PRIVATE-APP15"),
		jpegSegment(0xfe, "PRIVATE-COMMENT"),
		jpegSegment(0xda, "SCAN-HEADER-2"),
		new Uint8Array([0x44, 0x55, 0xff, 0xd9, 0x50, 0x41, 0x44]),
	);
	const result = sniffAndCleanImage(input, "jpg");
	assert.equal(result.mime, "image/jpeg");
	assert.equal(contains(result.bytes, "PRIVATE-APP3"), false);
	assert.equal(contains(result.bytes, "PRIVATE-APP15"), false);
	assert.equal(contains(result.bytes, "PRIVATE-COMMENT"), false);
	assert.equal(contains(result.bytes, "SCAN-HEADER-1"), true);
	assert.equal(contains(result.bytes, "SCAN-HEADER-2"), true);
	assert.equal(result.bytes.at(-1), 0xd9, "bytes after EOI are discarded");
	assert.equal(includesBytes(result.bytes, [0xff, 0x00]), true, "JPEG entropy byte stuffing is preserved");
});

test("JPEG cleansing preserves scan data following an in-scan line-count marker", () => {
	const input = join(
		new Uint8Array([0xff, 0xd8]),
		jpegSegment(0xda, "SCAN-HEADER"),
		new Uint8Array([0x11, 0x22]),
		jpegSegment(0xdc, new Uint8Array([0, 1])),
		new Uint8Array([0x33, 0x44, 0xff, 0xd9]),
	);
	const result = sniffAndCleanImage(input, "jpg");
	assert.equal(includesBytes(result.bytes, [0xff, 0xdc]), true);
	assert.equal(includesBytes(result.bytes, [0x33, 0x44]), true);
	assert.equal(result.bytes.at(-1), 0xd9);
});

test("GIF cleansing removes comments and unknown application metadata but preserves animation controls", () => {
	const header = new Uint8Array(13);
	header.set(ascii("GIF89a"));
	header[6] = 1;
	header[8] = 1;
	const comment = join(new Uint8Array([0x21, 0xfe, 3]), ascii("PII"), new Uint8Array([0]));
	const privateApp = join(new Uint8Array([0x21, 0xff, 11]), ascii("CUSTOMAPP01"), new Uint8Array([3]), ascii("GPS"), new Uint8Array([0]));
	const loop = join(new Uint8Array([0x21, 0xff, 11]), ascii("NETSCAPE2.0"), new Uint8Array([3, 1, 0, 0, 0]));
	const graphicControl = new Uint8Array([0x21, 0xf9, 4, 0, 2, 0, 0, 0]);
	const image = new Uint8Array([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b]);
	const result = sniffAndCleanImage(join(header, comment, privateApp, loop, graphicControl, image), "gif");
	assert.equal(result.mime, "image/gif");
	assert.equal(contains(result.bytes, "PII"), false);
	assert.equal(contains(result.bytes, "CUSTOMAPP001"), false);
	assert.equal(contains(result.bytes, "GPS"), false);
	assert.equal(contains(result.bytes, "NETSCAPE2.0"), true);
	assert.equal(contains(result.bytes, "\u0002\u0000\u0000"), true, "graphic-control frame timing is preserved");
	assert.equal(result.bytes.at(-1), 0x3b);
});

test("malformed image chunks are rejected rather than stored as cleansed media", () => {
	assert.throws(() => sniffAndCleanImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]), "png"));
	assert.throws(() => sniffAndCleanImage(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2]), "jpg"));
});
