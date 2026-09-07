function concat(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function cleansePng(bytes: Uint8Array) {
  if (!startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return null
  const kept: Uint8Array[] = [bytes.subarray(0, 8)]
  let offset = 8
  let removed = false
  let ended = false
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset)
    const length = view.getUint32(0)
    const end = offset + 12 + length
    if (end > bytes.length) return null
    const type = ascii(bytes, offset + 4, 4)
    if (!['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'].includes(type)) kept.push(bytes.subarray(offset, end))
    else removed = true
    offset = end
    if (type === 'IEND') { ended = true; break }
  }
  if (!ended) return null
  return { bytes: concat(kept), cleaned: removed || offset < bytes.length }
}

function cleanseWebp(bytes: Uint8Array) {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null
  const chunks: Uint8Array[] = []
  let offset = 12
  let removed = false
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4)
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true)
    const end = offset + 8 + length + (length % 2)
    if (end > bytes.length) return null
    if (type === 'EXIF' || type === 'XMP ' || type === 'ICCP') removed = true
    else chunks.push(bytes.subarray(offset, end))
    offset = end
  }
  if (offset !== bytes.length) return null
  const body = concat(chunks)
  const header = new Uint8Array(12)
  header.set([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])
  new DataView(header.buffer).setUint32(4, body.length + 4, true)
  return { bytes: concat([header, body]), cleaned: removed }
}

function readGifSubBlocks(bytes: Uint8Array, offset: number) {
  let cursor = offset
  while (cursor < bytes.length) {
    const size = bytes[cursor]
    cursor += 1
    if (size === 0) return cursor
    cursor += size
    if (cursor > bytes.length) return null
  }
  return null
}

function cleanseGif(bytes: Uint8Array) {
  if (bytes.length < 13 || !['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return null
  const output: Uint8Array[] = [bytes.subarray(0, 13)]
  let offset = 13
  const packed = bytes[10]
  if (packed & 0x80) offset += 3 * (2 ** ((packed & 7) + 1))
  if (offset > bytes.length) return null
  output.push(bytes.subarray(13, offset))
  let removed = false
  while (offset < bytes.length) {
    const marker = bytes[offset]
    if (marker === 0x3b) {
      output.push(bytes.subarray(offset, offset + 1))
      return { bytes: concat(output), cleaned: removed }
    }
    if (marker === 0x2c) {
      if (offset + 10 > bytes.length) return null
      const packedImage = bytes[offset + 9]
      let end = offset + 10
      if (packedImage & 0x80) end += 3 * (2 ** ((packedImage & 7) + 1))
      if (end >= bytes.length) return null
      end += 1
      const afterBlocks = readGifSubBlocks(bytes, end)
      if (afterBlocks === null) return null
      output.push(bytes.subarray(offset, afterBlocks))
      offset = afterBlocks
      continue
    }
    if (marker !== 0x21 || offset + 2 > bytes.length) return null
    const label = bytes[offset + 1]
    const blockStart = offset
    const afterHeader = offset + 2
    if (label === 0xf9) {
      if (afterHeader >= bytes.length) return null
      const size = bytes[afterHeader]
      const end = afterHeader + 1 + size + 1
      if (end > bytes.length) return null
      output.push(bytes.subarray(blockStart, end))
      offset = end
      continue
    }
    if (label === 0xff) {
      if (afterHeader >= bytes.length) return null
      const size = bytes[afterHeader]
      const application = ascii(bytes, afterHeader + 1, size)
      const end = readGifSubBlocks(bytes, afterHeader + 1 + size)
      if (end === null) return null
      if (application === 'NETSCAPE2.0') output.push(bytes.subarray(blockStart, end))
      else removed = true
      offset = end
      continue
    }
    const end = readGifSubBlocks(bytes, afterHeader)
    if (end === null) return null
    removed = true
    offset = end
  }
  return null
}

export function cleanseImageMetadata(bytes: Uint8Array, contentType: string) {
  const result = contentType === 'image/png' ? cleansePng(bytes) : contentType === 'image/webp' ? cleanseWebp(bytes) : cleanseGif(bytes)
  return result ?? { bytes, cleaned: false }
}

export function isLikelyImage(bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/png') return startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10])
  if (contentType === 'image/webp') return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
  if (contentType === 'image/gif') return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))
  return false
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

export function inspectImage(bytes: Uint8Array, contentType: string) {
  if (!isLikelyImage(bytes, contentType)) return null
  if (contentType === 'image/png') {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20), frames: 1, durationSeconds: 0 }
  }
  if (contentType === 'image/gif') {
    if (bytes.length < 13) return null
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint16(6, true); const height = view.getUint16(8, true)
    let frames = 0; let durationCentiseconds = 0; let offset = 13
    if (bytes[10] & 0x80) offset += 3 * (2 ** ((bytes[10] & 7) + 1))
    while (offset < bytes.length) {
      if (bytes[offset] === 0x3b) break
      if (bytes[offset] === 0x2c) {
        frames += 1
        if (offset + 10 > bytes.length) return null
        let data = offset + 10
        if (bytes[offset + 9] & 0x80) data += 3 * (2 ** ((bytes[offset + 9] & 7) + 1))
        if (data >= bytes.length) return null
        offset = readGifSubBlocks(bytes, data + 1) ?? bytes.length
        continue
      }
      if (bytes[offset] !== 0x21 || offset + 2 >= bytes.length) return null
      const label = bytes[offset + 1]
      if (label === 0xf9 && offset + 8 <= bytes.length && bytes[offset + 2] === 4) {
        durationCentiseconds += bytes[offset + 4] | (bytes[offset + 5] << 8)
        offset += 8
      } else {
        const headerSize = bytes[offset + 2]
        offset = readGifSubBlocks(bytes, offset + 3 + headerSize) ?? bytes.length
      }
    }
    return frames ? { width, height, frames, durationSeconds: durationCentiseconds / 100 } : null
  }
  let width = 0; let height = 0; let frames = 0; let durationMs = 0; let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4)
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true)
    const payload = offset + 8; const end = payload + size + (size % 2)
    if (end > bytes.length) return null
    if (type === 'VP8X' && size >= 10) { width = uint24le(bytes, payload + 4) + 1; height = uint24le(bytes, payload + 7) + 1 }
    if (type === 'VP8 ' && size >= 10 && bytes[payload + 3] === 0x9d && bytes[payload + 4] === 0x01 && bytes[payload + 5] === 0x2a) {
      width ||= (bytes[payload + 6] | (bytes[payload + 7] << 8)) & 0x3fff
      height ||= (bytes[payload + 8] | (bytes[payload + 9] << 8)) & 0x3fff
    }
    if (type === 'VP8L' && size >= 5 && bytes[payload] === 0x2f) {
      const bits = (bytes[payload + 1] | (bytes[payload + 2] << 8) | (bytes[payload + 3] << 16) | (bytes[payload + 4] << 24)) >>> 0
      width ||= (bits & 0x3fff) + 1; height ||= ((bits >>> 14) & 0x3fff) + 1
    }
    if (type === 'ANMF' && size >= 16) { frames += 1; durationMs += uint24le(bytes, payload + 12) }
    offset = end
  }
  return width && height ? { width, height, frames: Math.max(frames, 1), durationSeconds: durationMs / 1000 } : null
}

export function isLikelyMp4(bytes: Uint8Array) {
  return bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp'
}

export function mp4DurationSeconds(bytes: Uint8Array) {
  if (!isLikelyMp4(bytes)) return null
  function findMovieHeader(start: number, end: number): number | null {
    let offset = start
    while (offset + 8 <= end) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, end - offset)
      let size = view.getUint32(0)
      const type = ascii(bytes, offset + 4, 4)
      let header = 8
      if (size === 1) {
        if (offset + 16 > end) return null
        size = Number(new DataView(bytes.buffer, bytes.byteOffset + offset + 8, 8).getBigUint64(0))
        header = 16
      } else if (size === 0) size = end - offset
      if (size < header || offset + size > end) return null
      if (type === 'mvhd') {
        const version = bytes[offset + header]
        const base = offset + header + 4
        if (version === 0 && base + 12 <= offset + size) {
          const timescale = new DataView(bytes.buffer, bytes.byteOffset + base + 4, 4).getUint32(0)
          const duration = new DataView(bytes.buffer, bytes.byteOffset + base + 8, 4).getUint32(0)
          return timescale ? duration / timescale : null
        }
        if (version === 1 && base + 24 <= offset + size) {
          const timescale = new DataView(bytes.buffer, bytes.byteOffset + base + 16, 4).getUint32(0)
          const duration = new DataView(bytes.buffer, bytes.byteOffset + base + 20, 8).getBigUint64(0)
          return timescale ? Number(duration) / timescale : null
        }
        return null
      }
      if (type === 'moov') {
        const nested = findMovieHeader(offset + header, offset + size)
        if (nested !== null) return nested
      }
      offset += size
    }
    return null
  }
  return findMovieHeader(0, bytes.length)
}
