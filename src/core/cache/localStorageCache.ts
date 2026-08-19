import type { ICache } from "./ports";
import { APP_VERSION } from "@/core/config";

// Keys are namespaced per app version so a deploy invalidates old entries.
const KEY_NS = `mapimages:${APP_VERSION}:`;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function storage(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

/** ICache adapter over window.localStorage. All failures degrade to a miss. */
export const localStorageCache: ICache = {
  read<T = unknown>(key: string, maxAgeMs: number = SIX_HOURS_MS): T | null {
    const store = storage();
    if (!store) {
      return null;
    }

    const namespacedKey = KEY_NS + key;
    try {
      const raw = store.getItem(namespacedKey);
      if (!raw) {
        return null;
      }

      const entry = JSON.parse(raw);
      const validEnvelope =
        entry && typeof entry === "object" && typeof entry.ts === "number";
      if (!validEnvelope || Date.now() - entry.ts > maxAgeMs) {
        store.removeItem(namespacedKey);
        return null;
      }

      return (entry.data as T) ?? null;
    } catch {
      return null;
    }
  },

  write(key: string, data: unknown): void {
    const store = storage();
    if (!store) {
      return;
    }

    try {
      store.setItem(KEY_NS + key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // Quota exceeded or storage disabled — caching is best-effort.
    }
  },
};
