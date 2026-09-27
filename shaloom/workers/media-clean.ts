export type AcceptedMedia = "image/png" | "image/jpeg" | "image/gif" | "video/mp4";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
	return prefix.every((value, index) => bytes[index] === value);
}

function readU32(bytes: Uint8Array, offset: number): number {
	return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function join(parts: Uint8Array[]): Uint8Array {
	const size = parts.reduce((total, part) => total + part.length, 0);
	const out = new Uint8Array(size);
	let offset = 0;
	for (const part of parts) { out.set(part, offset); offset += part.length; }
	return out;
}

function stripPngMetadata(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 33 || !startsWith(bytes, PNG_SIGNATURE)) throw new Error("Image data is not a valid PNG.");
	// Keep chunks that affect pixel interpretation or animation. Drop every other
	// ancillary chunk, including private/vendor chunks not known to this app.
	const visualAncillary = new Set(["tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "hIST", "acTL", "fcTL", "fdAT"]);
	const parts: Uint8Array[] = [bytes.slice(0, 8)];
	let offset = 8;
	let sawHeader = false;
	let sawImageData = false;
	let foundEnd = false;
	while (offset + 12 <= bytes.length) {
		const length = readU32(bytes, offset);
		const end = offset + 12 + length;
		if (end > bytes.length) throw new Error("PNG has an invalid chunk length.");
		const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
		if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("PNG has an invalid chunk type.");
		if (!sawHeader) {
			if (type !== "IHDR" || length !== 13) throw new Error("PNG is missing a valid image header.");
			sawHeader = true;
		} else if (type === "IHDR") throw new Error("PNG contains more than one image header.");
		if (type === "IDAT") sawImageData = true;
		const isCritical = type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90;
		if (isCritical || visualAncillary.has(type)) parts.push(bytes.slice(offset, end));
		offset = end;
		if (type === "IEND") {
			if (length !== 0) throw new Error("PNG has an invalid end marker.");
			foundEnd = true;
			break;
		}
	}
	if (!sawHeader || !sawImageData || !foundEnd) throw new Error("PNG is missing required image data or its end marker.");
	return join(parts);
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Image data is not a valid JPEG.");
	const parts: Uint8Array[] = [bytes.slice(0, 2)];
	let offset = 2;
	let scanningPixels = false;
	let resumeScanAfterDnl = false;
	let sawScan = false;
	while (offset < bytes.length) {
		if (scanningPixels) {
			let markerStart = -1;
			let cursor = offset;
			while (cursor < bytes.length) {
				if (bytes[cursor] !== 0xff) { cursor++; continue; }
				const candidateStart = cursor;
				while (cursor < bytes.length && bytes[cursor] === 0xff) cursor++;
				if (cursor >= bytes.length) break;
				const code = bytes[cursor];
				if (code === 0x00 || code === 0x01 || (code >= 0xd0 && code <= 0xd7)) { cursor++; continue; }
				resumeScanAfterDnl = code === 0xdc;
				markerStart = candidateStart;
				break;
			}
			if (markerStart < 0) throw new Error("JPEG is missing its end marker.");
			parts.push(bytes.slice(offset, markerStart));
			offset = markerStart;
			scanningPixels = false;
		}
		if (bytes[offset] !== 0xff) throw new Error("JPEG marker stream is invalid.");
		const markerStart = offset;
		while (offset < bytes.length && bytes[offset] === 0xff) offset++;
		if (offset >= bytes.length) throw new Error("JPEG marker is truncated.");
		const marker = bytes[offset++];
		if (marker === 0xd9) {
			if (!sawScan) throw new Error("JPEG is missing its image data.");
			parts.push(bytes.slice(markerStart, offset));
			return join(parts);
		}
		if (marker === 0xd8) throw new Error("JPEG contains an unexpected nested start marker.");
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			parts.push(bytes.slice(markerStart, offset));
			continue;
		}
		if (offset + 2 > bytes.length) throw new Error("JPEG segment is truncated.");
		const length = (bytes[offset] << 8) | bytes[offset + 1];
		if (length < 2 || offset + length > bytes.length) throw new Error("JPEG segment length is invalid.");
		const end = offset + length;
		const metadataMarker = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
		if (!metadataMarker) parts.push(bytes.slice(markerStart, end));
		offset = end;
		if (marker === 0xda) {
			if (length < 6) throw new Error("JPEG scan header is invalid.");
			sawScan = true;
			scanningPixels = true;
		} else if (marker === 0xdc && resumeScanAfterDnl) {
			// Define-Number-of-Lines may legally occur inside entropy-coded scan data.
			scanningPixels = true;
			resumeScanAfterDnl = false;
		}
	}
	throw new Error("JPEG is missing its end marker.");
}

function skipGifSubBlocks(bytes: Uint8Array, start: number): number {
	let offset = start;
	while (offset < bytes.length) {
		const length = bytes[offset++];
		if (length === 0) return offset;
		if (offset + length > bytes.length) throw new Error("GIF extension is truncated.");
		offset += length;
	}
	throw new Error("GIF extension is missing its terminator.");
}

function stripGifMetadata(bytes: Uint8Array): Uint8Array {
	const signature = new TextDecoder().decode(bytes.slice(0, 6));
	if ((signature !== "GIF87a" && signature !== "GIF89a") || bytes.length < 14) throw new Error("Image data is not a valid GIF.");
	const parts: Uint8Array[] = [bytes.slice(0, 13)];
	let offset = 13;
	const packed = bytes[10];
	if (packed & 0x80) {
		const tableBytes = 3 * (2 ** ((packed & 0x07) + 1));
		if (offset + tableBytes > bytes.length) throw new Error("GIF color table is truncated.");
		parts.push(bytes.slice(offset, offset + tableBytes));
		offset += tableBytes;
	}
	while (offset < bytes.length) {
		const start = offset;
		const marker = bytes[offset++];
		if (marker === 0x3b) { parts.push(bytes.slice(start, offset)); return join(parts); }
		if (marker === 0x21) {
			if (offset >= bytes.length) throw new Error("GIF extension is truncated.");
			const label = bytes[offset++];
			if (label === 0xf9) {
				if (offset + 6 > bytes.length) throw new Error("GIF control extension is truncated.");
				parts.push(bytes.slice(start, offset + 6));
				offset += 6;
				continue;
			}
			if (label === 0xff) {
				if (offset >= bytes.length) throw new Error("GIF application extension is truncated.");
				const blockLength = bytes[offset++];
				if (offset + blockLength > bytes.length) throw new Error("GIF application header is truncated.");
				const identifier = new TextDecoder().decode(bytes.slice(offset, offset + blockLength));
				const end = skipGifSubBlocks(bytes, offset + blockLength);
				// The Netscape loop extension controls animation playback, not identity.
				if (identifier.startsWith("NETSCAPE2.0") || identifier.startsWith("ANIMEXTS1.0")) parts.push(bytes.slice(start, end));
				offset = end;
				continue;
			}
			if (label === 0xfe) { offset = skipGifSubBlocks(bytes, offset); continue; }
			if (label === 0x01) {
				if (offset >= bytes.length) throw new Error("GIF text extension is truncated.");
				const headerLength = bytes[offset++];
				const end = skipGifSubBlocks(bytes, offset + headerLength);
				parts.push(bytes.slice(start, end));
				offset = end;
				continue;
			}
			// Unknown extension payloads can contain private application metadata.
			// The image, graphic-control, plain-text, and standard loop blocks above
			// are retained because they affect visible output or animation behavior.
			offset = skipGifSubBlocks(bytes, offset);
			continue;
		}
		if (marker === 0x2c) {
			if (offset + 9 > bytes.length) throw new Error("GIF image descriptor is truncated.");
			const localPacked = bytes[offset + 8];
			offset += 9;
			if (localPacked & 0x80) {
				const tableBytes = 3 * (2 ** ((localPacked & 0x07) + 1));
				if (offset + tableBytes > bytes.length) throw new Error("GIF local color table is truncated.");
				offset += tableBytes;
			}
			if (offset >= bytes.length) throw new Error("GIF image data is truncated.");
			offset++; // LZW minimum code size
			offset = skipGifSubBlocks(bytes, offset);
			parts.push(bytes.slice(start, offset));
			continue;
		}
		throw new Error("GIF block marker is invalid.");
	}
	throw new Error("GIF is missing its trailer.");
}

export function sniffAndCleanImage(input: Uint8Array, extension: string): { bytes: Uint8Array; mime: AcceptedMedia } {
	const ext = extension.toLowerCase();
	if (ext === "png" && startsWith(input, PNG_SIGNATURE)) return { bytes: stripPngMetadata(input), mime: "image/png" };
	if ((ext === "jpg" || ext === "jpeg") && input[0] === 0xff && input[1] === 0xd8) return { bytes: stripJpegMetadata(input), mime: "image/jpeg" };
	if (ext === "gif" && ["GIF87a", "GIF89a"].includes(new TextDecoder().decode(input.slice(0, 6)))) return { bytes: stripGifMetadata(input), mime: "image/gif" };
	throw new Error("The file extension and image content do not match a supported PNG, JPG, or GIF.");
}

export function sniffMp4(input: Uint8Array): boolean {
	return input.length >= 12 && new TextDecoder().decode(input.slice(4, 8)) === "ftyp";
}
