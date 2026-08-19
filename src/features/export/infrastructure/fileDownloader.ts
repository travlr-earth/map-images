import type { IFileDownloader } from "../domain/ports";

/** Browser default: hand the blob to the user via a synthetic anchor click. */
const anchorDownloader: IFileDownloader = {
  async downloadBlob(blob: Blob, filename: string): Promise<void> {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  },
};

let activeDownloader: IFileDownloader = anchorDownloader;

/** Swaps in an alternative delivery mechanism (native share sheet, tests, ...). */
export function setFileDownloader(downloader: IFileDownloader): void {
  activeDownloader = downloader;
}

export function getFileDownloader(): IFileDownloader {
  return activeDownloader;
}

export function triggerDownloadBlob(
  blob: Blob,
  filename: string,
): Promise<void> {
  return activeDownloader.downloadBlob(blob, filename);
}
