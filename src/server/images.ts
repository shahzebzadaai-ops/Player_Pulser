export function sniffImage(buffer: Buffer): { mime: "image/webp" | "image/avif" | "image/png" | "image/jpeg" } | null {
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp" };
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return { mime: "image/jpeg" };
  if (buffer.length > 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return { mime: "image/avif" };
  }
  return null;
}

export function imageSize(buffer: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mime === "image/jpeg") return jpegSize(buffer);
  if (mime === "image/webp") return webpSize(buffer);
  if (mime === "image/avif") return avifSize(buffer);
  return null;
}

function jpegSize(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + size;
  }
  return null;
}

function webpSize(buffer: Buffer): { width: number; height: number } | null {
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21] ?? 0;
    const b2 = buffer[22] ?? 0;
    const b3 = buffer[23] ?? 0;
    const b4 = buffer[24] ?? 0;
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return { width, height };
  }
  return null;
}

function avifSize(buffer: Buffer): { width: number; height: number } | null {
  const marker = Buffer.from("ispe");
  const idx = buffer.indexOf(marker);
  if (idx < 0 || idx + 16 > buffer.length) return null;
  const width = buffer.readUInt32BE(idx + 8);
  const height = buffer.readUInt32BE(idx + 12);
  if (width < 1 || height < 1 || width > 20000 || height > 20000) return null;
  return { width, height };
}
