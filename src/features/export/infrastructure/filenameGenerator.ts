import { slugify } from "@/shared/utils/string";

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local-time stamp in the form YYYYMMDD_HHMMSS, e.g. 20260819_142530. */
function timestampNow(): string {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    twoDigits(now.getMonth() + 1),
    twoDigits(now.getDate()),
  ].join("");
  const timePart = [
    twoDigits(now.getHours()),
    twoDigits(now.getMinutes()),
    twoDigits(now.getSeconds()),
  ].join("");
  return `${datePart}_${timePart}`;
}

function cleanExtension(extension: string | undefined): string {
  const value = String(extension ?? "png")
    .trim()
    .toLowerCase();
  return value || "png";
}

/** Builds a download filename like `tokyo_noir_20260819_142530.png`. */
export function createPosterFilename(
  cityOrLocation: string,
  themeId: string,
  extension = "png",
): string {
  const locationSlug = slugify(cityOrLocation) || "city";
  return `${locationSlug}_${themeId}_${timestampNow()}.${cleanExtension(extension)}`;
}
