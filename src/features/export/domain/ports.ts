/**
 * Delivery mechanism for a finished export blob — the default is a browser
 * download, but hosts may substitute a native share sheet or test double.
 */
export interface IFileDownloader {
  downloadBlob(blob: Blob, filename: string): Promise<void>;
}
