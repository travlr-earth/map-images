// PNG export with a pHYs (physical pixel density) chunk spliced in — the
// browser's own encoder emits no DPI metadata, and print services read it.

const PNG_SIGNATURE_LEN = 8;
const CHUNK_HEADER_LEN = 8; // 4-byte length + 4-byte type
const CHUNK_CRC_LEN = 4;
const IHDR_PAYLOAD_LEN = 13;

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[i] = value >>> 0;
  }
  return crcTable;
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let acc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    acc = (table[(acc ^ data[i]) & 0xff] ^ (acc >>> 8)) >>> 0;
  }
  return (acc ^ 0xffffffff) >>> 0;
}

/** Frames a payload as a complete PNG chunk: length, type, data, CRC. */
function wrapChunk(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(CHUNK_HEADER_LEN + payload.length + CHUNK_CRC_LEN);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, payload.length);
  chunk.set(typeBytes, 4);
  chunk.set(payload, CHUNK_HEADER_LEN);

  // CRC covers the type code and the payload, not the length field.
  const crcInput = new Uint8Array(typeBytes.length + payload.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(payload, typeBytes.length);
  view.setUint32(CHUNK_HEADER_LEN + payload.length, crc32(crcInput));

  return chunk;
}

function makePhysChunk(dpi: number): Uint8Array {
  const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254));
  const payload = new Uint8Array(9);
  const view = new DataView(payload.buffer);
  view.setUint32(0, pixelsPerMeter); // x axis
  view.setUint32(4, pixelsPerMeter); // y axis
  payload[8] = 1; // unit specifier: meter
  return wrapChunk("pHYs", payload);
}

/**
 * Inserts a pHYs chunk immediately after IHDR. Returns the input untouched
 * when the dpi is unusable or the bytes don't look like a well-formed PNG.
 */
function withDpiMetadata(png: Uint8Array, dpi: number): Uint8Array {
  if (!Number.isFinite(dpi) || dpi <= 0) return png;

  const minLength =
    PNG_SIGNATURE_LEN + CHUNK_HEADER_LEN + IHDR_PAYLOAD_LEN + CHUNK_CRC_LEN;
  if (png.length < minLength) return png;

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ihdrLength = view.getUint32(PNG_SIGNATURE_LEN);
  const splitAt =
    PNG_SIGNATURE_LEN + CHUNK_HEADER_LEN + ihdrLength + CHUNK_CRC_LEN;
  if (splitAt > png.length) return png;

  const phys = makePhysChunk(dpi);
  const merged = new Uint8Array(png.length + phys.length);
  merged.set(png.subarray(0, splitAt), 0);
  merged.set(phys, splitAt);
  merged.set(png.subarray(splitAt), splitAt + phys.length);
  return merged;
}

export async function createPngBlob(
  canvas: HTMLCanvasElement,
  dpi: number = 300,
): Promise<Blob> {
  const encoded = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas produced no PNG data.")),
      "image/png",
    );
  });

  const bytes = new Uint8Array(await encoded.arrayBuffer());
  const stamped = withDpiMetadata(bytes, dpi);
  return new Blob([stamped.buffer as ArrayBuffer], { type: "image/png" });
}
