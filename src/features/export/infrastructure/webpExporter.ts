/** WebP export at a given quality (0–1). Default 0.85 is a good web-optimised balance. */
export async function createWebpBlob(
  canvas: HTMLCanvasElement,
  quality = 0.85,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to create WebP blob from canvas."));
      },
      "image/webp",
      quality,
    );
  });
}
