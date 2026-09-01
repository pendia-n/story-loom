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
