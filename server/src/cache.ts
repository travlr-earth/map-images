/**
 * Supabase Storage cache for rendered story images.
 * Key: SHA-256 of the stable render params → "renders/{hash}.jpg"
 * TTL enforced by Supabase Storage lifecycle policy (set to 7 days in bucket settings).
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BUCKET = "story-renders";

// Local-dev fallback: save renders to disk when Supabase creds are absent
const LOCAL_OUT = process.env.LOCAL_RENDER_DIR ?? resolve(process.cwd(), "renders-local");
const IS_LOCAL  = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key);
}

export function hashKey(stableJson: string): string {
  return createHash("sha256").update(stableJson).digest("hex");
}

export function storagePath(hash: string): string {
  return `renders/${hash}.jpg`;
}

/** Returns the public URL if the image is already cached, null otherwise. */
export async function getCached(hash: string): Promise<string | null> {
  if (IS_LOCAL) {
    const file = resolve(LOCAL_OUT, `${hash}.jpg`);
    return existsSync(file)
      ? `http://localhost:${process.env.PORT ?? 3001}/renders-local/${hash}.jpg`
      : null;
  }
  const client = supabase();
  const path = storagePath(hash);

  const { data } = await client.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return null;

  // HEAD-check: getPublicUrl always returns a URL structure, even for missing files.
  // Verify existence by listing with a prefix match.
  const { data: list, error } = await client.storage
    .from(BUCKET)
    .list("renders", { search: `${hash}.jpg` });

  if (error || !list?.length) return null;
  return data.publicUrl;
}

/** Stores JPEG buffer and returns its public URL. */
export async function store(hash: string, jpeg: Buffer): Promise<string> {
  if (IS_LOCAL) {
    mkdirSync(LOCAL_OUT, { recursive: true });
    const file = resolve(LOCAL_OUT, `${hash}.jpg`);
    writeFileSync(file, jpeg);
    console.log(`[cache] saved locally → ${file}`);
    return `http://localhost:${process.env.PORT ?? 3001}/renders-local/${hash}.jpg`;
  }
  const client = supabase();
  const path = storagePath(hash);

  const { error } = await client.storage.from(BUCKET).upload(path, jpeg, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "604800",   // 7 days
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
