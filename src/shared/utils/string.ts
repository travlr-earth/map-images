/** Lowercase snake_case identifier from arbitrary text ("untitled" if empty). */
export function slugify(value: string): string {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug.length > 0 ? slug : "untitled";
}
