/** JPEG export at a given quality (0–1). Default 0.92 balances quality vs size for social sharing. */
export async function createJpgBlob(
  canvas: HTMLCanvasElement,
  quality = 0.92,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to create JPEG blob from canvas."));
      },
      "image/jpeg",
      quality,
    );
  });
}
