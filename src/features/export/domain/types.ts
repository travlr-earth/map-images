/** File formats the export feature can emit. */
export type ExportFormat = "png" | "pdf" | "svg";

/** Requested physical print size for an export. */
export interface ExportOptions {
  widthCm: number;
  heightCm: number;
}
