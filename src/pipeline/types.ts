export type FileFormat = "png" | "jpg" | "webp" | "pdf";

export type FormatUnit = "cm" | "px";

export type FormatCategory =
  | "print"
  | "social"
  | "stories"
  | "wallpaper"
  | "web";

export interface FormatSpec {
  id: string;
  name: string;
  description: string;
  category: FormatCategory;
  unit: FormatUnit;
  /** Physical width in cm (for print) or logical px width (for digital). */
  width: number;
  /** Physical height in cm (for print) or logical px height (for digital). */
  height: number;
  /** Pixel width of the output canvas. Derived from width/height + dpi for print. */
  pixelWidth: number;
  /** Pixel height of the output canvas. */
  pixelHeight: number;
  /** DPI for print formats; 96 for screen formats. */
  dpi: number;
  /** Default file format for this spec. */
  defaultFormat: FileFormat;
}

export interface BatchExportItem {
  spec: FormatSpec;
  format: FileFormat;
}

export interface OutputProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  items: BatchExportItem[];
}

export interface BatchExportOptions {
  items: BatchExportItem[];
  city: string;
  country: string;
  continent?: string;
  themeId: string;
}

export interface BatchExportResult {
  item: BatchExportItem;
  blob: Blob;
  filename: string;
  error?: string;
}
