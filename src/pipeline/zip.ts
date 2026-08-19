import type { BatchExportResult } from "./types";

/** Packages a set of export results into a .zip blob using the native Compression Streams API. */
export async function packageAsZip(
  results: BatchExportResult[],
  zipFilename: string,
): Promise<void> {
  // Dynamic import so the module is only loaded when actually exporting.
  const { default: JSZip } = await import("jszip");

  const zip = new JSZip();

  for (const result of results) {
    if (result.blob && !result.error) {
      zip.file(result.filename, result.blob);
    }
  }

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  a.click();
  URL.revokeObjectURL(url);
}
