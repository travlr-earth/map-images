import type { ResolvedTheme, ThemeColorKey } from "./types";

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value !== null && typeof value === "object" ? (value as AnyRecord) : null;
}

function splitPath(keyPath: string): string[] {
  return keyPath.split(".").filter((segment) => segment.length > 0);
}

/**
 * Read a color at a dotted key path (e.g. "map.roads.major").
 * Returns "" for anything that is not a string leaf.
 */
export function getThemeColorByPath(
  theme: unknown,
  keyPath: ThemeColorKey | string,
): string {
  const segments = splitPath(String(keyPath));
  let node: unknown = theme;

  for (const segment of segments) {
    const record = asRecord(node);
    if (!record || !(segment in record)) return "";
    node = record[segment];
  }

  return typeof node === "string" ? node : "";
}

function writeColorAtPath(target: AnyRecord, keyPath: string, color: string): void {
  const segments = splitPath(keyPath);
  if (segments.length === 0) return;

  let node = target;
  for (const segment of segments.slice(0, -1)) {
    const child = asRecord(node[segment]);
    if (child) {
      node = child;
    } else {
      const created: AnyRecord = {};
      node[segment] = created;
      node = created;
    }
  }
  node[segments[segments.length - 1]] = color;
}

/**
 * Return a copy of `baseTheme` with the given path→color overrides applied.
 * Blank/non-string colors are ignored; an empty override map returns the
 * original object untouched.
 */
export function applyThemeColorOverrides(
  baseTheme: ResolvedTheme,
  overrides: Record<string, string>,
): ResolvedTheme {
  if (Object.keys(overrides).length === 0) return baseTheme;

  const themed: ResolvedTheme = {
    ...baseTheme,
    ui: { ...baseTheme.ui },
    map: {
      ...baseTheme.map,
      roads: { ...baseTheme.map.roads },
    },
  };

  for (const [keyPath, color] of Object.entries(overrides)) {
    if (typeof color !== "string" || color.trim().length === 0) continue;
    writeColorAtPath(themed as unknown as AnyRecord, keyPath, color);
  }

  return themed;
}
