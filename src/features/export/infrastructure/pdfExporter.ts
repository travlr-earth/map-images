import type { ExportOptions } from "../domain/types";

const CM_PER_INCH = 2.54;
const POINTS_PER_INCH = 72;

function cmToPoints(cm: number): number {
  return (cm / CM_PER_INCH) * POINTS_PER_INCH;
}

function positiveOr(value: number | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** PDF numeric literal, at most three decimals, no trailing zeros. */
function pdfNum(value: number): string {
  return String(Number(value.toFixed(3)));
}

function decodeBase64(data: string): Uint8Array {
  const raw = atob(data);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

/**
 * Tiny append-only PDF serializer: tracks byte offsets of each indirect
 * object as it is written so the cross-reference table can be emitted last.
 */
class PdfBuilder {
  private readonly parts: Uint8Array[] = [];
  private readonly encoder = new TextEncoder();
  private readonly offsets: number[] = [0];
  private size = 0;

  raw(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.size += bytes.length;
  }

  text(value: string): void {
    this.raw(this.encoder.encode(value));
  }

  object(id: number, dictionary: string, stream?: Uint8Array): void {
    this.offsets[id] = this.size;
    this.text(`${id} 0 obj\n${dictionary}\n`);
    if (stream) {
      this.text("stream\n");
      this.raw(stream);
      this.text("\nendstream\n");
    }
    this.text("endobj\n");
  }

  finish(objectCount: number): Blob {
    const xrefAt = this.size;
    this.text(`xref\n0 ${objectCount + 1}\n`);
    this.text("0000000000 65535 f \n");
    for (let id = 1; id <= objectCount; id += 1) {
      this.text(`${String(this.offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`);
    }
    this.text(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`);
    this.text(`startxref\n${xrefAt}\n%%EOF`);
    return new Blob(this.parts as BlobPart[], { type: "application/pdf" });
  }
}

/**
 * Wraps the canvas into a single-page PDF sized in centimeters. The raster
 * travels as a JPEG stream (DCTDecode) scaled to cover the full page.
 */
export function createPdfBlobFromCanvas(
  canvas: HTMLCanvasElement,
  options: Partial<ExportOptions> = {},
): Blob {
  const pixelWidth = Math.max(1, Math.round(Number(canvas?.width) || 1));
  const pixelHeight = Math.max(1, Math.round(Number(canvas?.height) || 1));
  const pageW = pdfNum(cmToPoints(positiveOr(options.widthCm, 20)));
  const pageH = pdfNum(cmToPoints(positiveOr(options.heightCm, 30)));

  const jpegBase64 = canvas.toDataURL("image/jpeg", 0.94).split(",")[1] || "";
  const jpegBytes = decodeBase64(jpegBase64);

  // Page content: scale the unit-square image XObject up to page size.
  const contentBytes = new TextEncoder().encode(
    ["q", `${pageW} 0 0 ${pageH} 0 0 cm`, "/Im0 Do", "Q"].join("\n"),
  );

  const pdf = new PdfBuilder();
  pdf.text("%PDF-1.4\n");
  // Binary-content marker comment (bytes above 0x80) required by convention.
  pdf.raw(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  pdf.object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  pdf.object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  pdf.object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  pdf.object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>`,
    jpegBytes,
  );
  pdf.object(5, `<< /Length ${contentBytes.length} >>`, contentBytes);

  return pdf.finish(5);
}
