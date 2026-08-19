// Cache port. Adapters store JSON-serialisable values with a timestamp
// and drop entries older than the caller's max age.
export interface ICache {
  read<T = unknown>(key: string, maxAgeMs?: number): T | null;
  write(key: string, data: unknown): void;
}
