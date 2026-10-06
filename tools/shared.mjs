// tools/shared.mjs — the resolver every repo that CONSUMES the shared home carries (travlr-earth/app-landing holds the home itself: shared/, published at
// https://www.travlr.earth/_s/ by tools/build-shared.mjs). It is the one file that is allowed to be copied, and it is identical in every consumer: when you
// change it here, copy it to the others (the duplicate scanner in the knowledge base lists it and nothing else).
//
//   node tools/shared.mjs resolve                  put every file the lock names where the lock says, verifying each against its pinned hash
//   node tools/shared.mjs check                    no network: every destination exists and matches the lock (what a CI or a deploy runs)
//   node tools/shared.mjs status                   which pins are behind the shared home
//   node tools/shared.mjs update [name…]           re-pin to the shared home as it is now (all entries, or the ones named)
//   node tools/shared.mjs add <name|dir/> --to <dest> [--upper] [--private]
//                                                  pin a file, or every file under a shared directory (name ends with /); --to is the destination
//                                                  file or directory in THIS repo; --upper upper-cases the file name (the app's flags are AD.webp);
//                                                  --also <dest> (a single file) puts the same pinned file at a second place too
//
// THE LOCK, shared.lock.json (committed):
//   { "origin": "https://www.travlr.earth", "files": { "<shared name>": { "sha256": "<hex>", "to": "<path in this repo>" | ["<path>", "<another path>"], "private": true? } } }
// The destinations are NOT committed: this tool keeps a marked block in .gitignore with them, so a copy cannot be committed back by accident.
//
// WHERE THE BYTES COME FROM, each checked against the pinned sha256 (a wrong file is an error, never a quiet substitute):
//   1. .shared-cache/<sha256>                    what an earlier run fetched (gitignored)
//   2. the shared home's source: $SHARED_DIR, else ../app-landing/shared beside this repo (a developer machine, a local deploy)
//   3. https://www.travlr.earth/_s/h/<sha16>/<name>   ($SHARED_ORIGIN overrides the origin, e.g. http://127.0.0.1:8788 for the dev stack)
// "private" files (the access gate) are only ever read from 2: they are not published.
// A pin that no longer matches the shared home says so and how to move it: node tools/shared.mjs update.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, posix, sep } from 'node:path';

const ROOT = process.cwd();
const LOCK = join(ROOT, 'shared.lock.json');
const CACHE = join(ROOT, '.shared-cache');
const sha = b => createHash('sha256').update(b).digest('hex');
const dests = e => [].concat(e.to);   // a pin has one destination, or several
const readLock = () => (existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : { origin: 'https://www.travlr.earth', files: {} });
const writeLock = lock => {
  const files = Object.fromEntries(Object.keys(lock.files).sort().map(k => [k, lock.files[k]]));
  writeFileSync(LOCK, JSON.stringify({ origin: lock.origin, files }, null, 1) + '\n');
};
const home = () => {
  const dir = process.env.SHARED_DIR ? resolve(process.env.SHARED_DIR) : resolve(ROOT, '..', 'app-landing', 'shared');
  return existsSync(dir) ? dir : null;
};
const walk = (dir, out = []) => { for (const n of readdirSync(dir).sort()) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const fromHome = name => { const h = home(); const p = h && join(h, name); return p && existsSync(p) ? readFileSync(p) : null; };

async function bytesFor(name, entry, lock) {
  const want = entry.sha256;
  const cached = join(CACHE, want);
  if (existsSync(cached)) return { b: readFileSync(cached), from: 'cache' };
  const local = fromHome(name);
  if (local && sha(local) === want) return { b: local, from: 'shared home (local)' };
  if (!entry.private) {
    const origin = (process.env.SHARED_ORIGIN || lock.origin).replace(/\/$/, '');
    const url = `${origin}/_s/h/${want.slice(0, 16)}/${name}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) }).catch(e => ({ ok: false, status: 0, statusText: e.message }));
    if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (sha(b) === want) return { b, from: origin }; throw new Error(`${name}: ${url} answered with different bytes than the pin`); }
    const why = local ? `the shared home here has changed (${name} is not what the lock pins): run node tools/shared.mjs update` : `${url} answered ${r.status} ${r.statusText || ''}`.trim();
    throw new Error(`${name}: ${why}`);
  }
  throw new Error(`${name}: private, and ${local ? 'the shared home here has changed: run node tools/shared.mjs update' : 'no shared home beside this repo (../app-landing/shared; set SHARED_DIR)'}`);
}

function syncGitignore(lock) {
  const f = join(ROOT, '.gitignore');
  const begin = '# shared:begin (tools/shared.mjs: resolved from the shared home, never committed)', end = '# shared:end';
  const lines = [...new Set(['.shared-cache/', ...Object.values(lock.files).flatMap(e => dests(e)).map(t => t.split(sep).join('/'))])].sort();
  const block = [begin, ...lines, end].join('\n');
  let s = existsSync(f) ? readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '';
  const a = s.indexOf(begin), b = s.indexOf(end);
  s = a >= 0 && b > a ? s.slice(0, a) + block + s.slice(b + end.length) : (s && !s.endsWith('\n') ? s + '\n' : s) + block + '\n';
  writeFileSync(f, s);
}

const cmd = process.argv[2] || 'resolve';
const flag = n => process.argv.includes(`--${n}`);
const opt = n => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const lock = readLock();
const entries = Object.entries(lock.files);

if (cmd === 'resolve') {
  let fetched = 0, failed = 0;
  for (const [name, e] of entries) {
    const todo = dests(e).filter(t => { const d = join(ROOT, t); return !(existsSync(d) && sha(readFileSync(d)) === e.sha256); });
    if (!todo.length) continue;
    try {
      const { b, from } = await bytesFor(name, e, lock);
      mkdirSync(CACHE, { recursive: true }); writeFileSync(join(CACHE, e.sha256), b);
      for (const t of todo) {
        const dest = join(ROOT, t);
        mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, b);
        fetched++; if (fetched <= 3) console.log(`shared: ${name} -> ${t} (${from})`);
      }
    } catch (err) { failed++; console.error(`shared: ${err.message}`); }
  }
  syncGitignore(lock);
  console.log(`shared: ${entries.length} files pinned, ${fetched} written, ${failed} failed`);
  process.exit(failed ? 1 : 0);
} else if (cmd === 'check') {
  const bad = entries.filter(([, e]) => dests(e).some(t => { const d = join(ROOT, t); return !existsSync(d) || sha(readFileSync(d)) !== e.sha256; }));
  if (bad.length) { console.error(`shared: ${bad.length} file(s) missing or not what the lock pins (node tools/shared.mjs resolve): ${bad.slice(0, 5).map(([n]) => n).join(', ')}`); process.exit(1); }
  console.log(`shared: ok, ${entries.length} files match the lock`);
} else if (cmd === 'status' || cmd === 'update') {
  const only = process.argv.slice(3).filter(a => !a.startsWith('--'));
  const manifest = home() ? null : await fetch(`${(process.env.SHARED_ORIGIN || lock.origin).replace(/\/$/, '')}/_s/manifest.json`).then(r => r.json()).catch(() => null);
  let behind = 0;
  for (const [name, e] of entries) {
    if (only.length && !only.includes(name)) continue;
    const now = home() ? (fromHome(name) ? sha(fromHome(name)) : null) : manifest?.files?.[name]?.sha256 || null;
    if (!now) { console.error(`shared: ${name}: not in the shared home any more`); behind++; continue; }
    if (now !== e.sha256) { behind++; if (cmd === 'update') e.sha256 = now; console.log(`shared: ${name}: ${cmd === 'update' ? 'moved to' : 'behind'} ${now.slice(0, 12)}`); }
  }
  if (cmd === 'update') { writeLock(lock); console.log(`shared: lock updated (${behind} moved); run node tools/shared.mjs resolve`); }
  else { console.log(behind ? `shared: ${behind} pin(s) behind the shared home` : 'shared: every pin is current'); process.exit(behind ? 1 : 0); }
} else if (cmd === 'add') {
  const target = process.argv[3], to = opt('to');
  if (!target || !to) { console.error('usage: node tools/shared.mjs add <name|dir/> --to <dest> [--upper] [--private]'); process.exit(2); }
  const h = home();
  const names = [];
  if (target.endsWith('/')) {
    if (!h) { console.error('shared: adding a directory needs the shared home beside this repo (or SHARED_DIR)'); process.exit(2); }
    for (const p of walk(join(h, target))) names.push(relative(h, p).split(sep).join('/'));
  } else names.push(target);
  for (const name of names) {
    const b = fromHome(name);
    if (!b) { console.error(`shared: ${name} is not in the shared home`); process.exit(2); }
    let dest = target.endsWith('/') ? posix.join(to, name.slice(target.length)) : to;
    if (flag('upper')) dest = posix.join(posix.dirname(dest), posix.basename(dest, posix.extname(dest)).toUpperCase() + posix.extname(dest));
    const also = opt('also');
    lock.files[name] = { sha256: sha(b), to: also && !target.endsWith('/') ? [dest, also] : dest, ...(flag('private') ? { private: true } : {}) };
  }
  writeLock(lock); syncGitignore(lock);
  console.log(`shared: pinned ${names.length} file(s) under ${to}; run node tools/shared.mjs resolve`);
} else { console.error('usage: node tools/shared.mjs resolve | check | status | update [name…] | add <name|dir/> --to <dest> [--upper] [--private]'); process.exit(2); }
