/**
 * Saved audits. Two interchangeable backends:
 * - Local disk (data/audits/<id>/) when running on your own machine.
 * - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (required on Vercel, whose disk is temporary).
 * Each audit stores audit.json, a small summary.json for the history list, and JPEG screenshots.
 */
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSummary } from './summary.js';
import { isServerless } from './browser.js';

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'audits');
const SAFE_ID = /^[a-z0-9-]+$/i;
const SHOTS = ['mobile', 'tablet', 'desktop'];

const checkId = (id) => {
  if (!SAFE_ID.test(id)) throw new Error('Invalid audit id');
  return id;
};

/**
 * Vercel connects a Blob store in one of two ways, and lets you choose a custom name prefix:
 * - a read-write token: BLOB_READ_WRITE_TOKEN (or <PREFIX>_READ_WRITE_TOKEN), value starts "vercel_blob_rw_"
 * - a store id used with Vercel's built-in OIDC sign-in: BLOB_STORE_ID (or <PREFIX>_STORE_ID), value starts "store_"
 * Returns the options to pass to every Blob call, or null when no store is connected.
 */
function blobCredentials() {
  const env = process.env;
  const entries = Object.entries(env).filter(([, v]) => typeof v === 'string' && v.trim());
  const token = env.BLOB_READ_WRITE_TOKEN?.trim()
    || entries.find(([k, v]) => /READ_WRITE_TOKEN$/.test(k) && v.trim().startsWith('vercel_blob_rw_'))?.[1].trim();
  if (token) return { token };
  const storeId = env.BLOB_STORE_ID?.trim()
    || entries.find(([k, v]) => /STORE_ID$/.test(k) && v.trim().startsWith('store_'))?.[1].trim();
  if (storeId) return { storeId };
  return null;
}

export const usingBlob = () => Boolean(blobCredentials());

/** On Vercel, nothing can be saved without Blob storage connected. */
export function storageProblem() {
  if (!isServerless || usingBlob()) return null;
  // Variable names only (never values), to help diagnose a store connected under another name.
  const related = Object.keys(process.env).filter((k) => /BLOB|STORE/i.test(k) && !/^VERCEL_/.test(k));
  return 'Storage is not set up. In your Vercel project, open Storage, create a Blob store, connect it to this project and redeploy.'
    + (related.length ? ` Storage-related variables found: ${related.join(', ')}.` : ' No storage variables were found in this deployment.');
}

// ------------------------------------------------------------------ backends
const disk = {
  async put(key, body) {
    const file = path.join(DATA_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  },
  async get(key) {
    try { return await readFile(path.join(DATA_DIR, key)); } catch { return null; }
  },
  async ids() {
    await mkdir(DATA_DIR, { recursive: true });
    return (await readdir(DATA_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  },
  async remove(id) {
    await rm(path.join(DATA_DIR, id), { recursive: true, force: true });
  },
};

const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
let blobSdk = null;
const sdk = async () => (blobSdk ||= await import('@vercel/blob'));
const blob = {
  async put(key, body, contentType) {
    const { put } = await sdk();
    await put(`audits/${key}`, body, { ...blobCredentials(), access: ACCESS, contentType, addRandomSuffix: false, allowOverwrite: true });
  },
  async get(key) {
    const { get } = await sdk();
    try {
      const res = await get(`audits/${key}`, { ...blobCredentials(), access: ACCESS, useCache: false });
      if (!res?.stream) return null;
      return Buffer.from(await new Response(res.stream).arrayBuffer());
    } catch (err) {
      if (err?.name === 'BlobNotFoundError') return null;
      throw err;
    }
  },
  async ids() {
    const { list } = await sdk();
    const ids = new Set();
    let cursor;
    do {
      const page = await list({ ...blobCredentials(), prefix: 'audits/', cursor, limit: 1000 });
      for (const b of page.blobs) if (b.pathname.endsWith('/summary.json')) ids.add(b.pathname.split('/')[1]);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return [...ids];
  },
  async remove(id) {
    const { list, del } = await sdk();
    const page = await list({ ...blobCredentials(), prefix: `audits/${id}/` });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url), blobCredentials());
  },
};

const store = () => (usingBlob() ? blob : disk);

// ------------------------------------------------------------------ audits
export async function saveAudit(audit, screenshots = {}) {
  checkId(audit.id);
  const s = store();
  for (const [name, buf] of Object.entries(screenshots)) await s.put(`${audit.id}/${name}.jpg`, buf, 'image/jpeg');
  audit.screenshots = Object.keys(screenshots);
  await s.put(`${audit.id}/audit.json`, JSON.stringify(audit), 'application/json');
  await s.put(`${audit.id}/summary.json`, JSON.stringify(summary(audit)), 'application/json');
}

export async function loadAudit(id) {
  let audit;
  try {
    const buf = await store().get(`${checkId(id)}/audit.json`);
    if (!buf) return null;
    audit = JSON.parse(buf.toString('utf8'));
  } catch (err) {
    if (/Invalid audit id/.test(err.message)) return null;
    throw err;
  }
  // Audits saved before the built-in summary existed get one on the fly.
  if (!audit.summary) audit.summary = buildSummary(audit);
  return audit;
}

export async function readScreenshot(id, name) {
  if (!SHOTS.includes(name)) return null;
  try { return await store().get(`${checkId(id)}/${name}.jpg`); } catch { return null; }
}

/** Lightweight summaries of every saved audit, newest first. */
export async function listAudits() {
  const s = store();
  const ids = await s.ids();
  const rows = await Promise.all(ids.map(async (id) => {
    try {
      const buf = await s.get(`${id}/summary.json`);
      if (buf) return JSON.parse(buf.toString('utf8'));
      // Older local audits have no summary.json: build it from the full audit once.
      const audit = await loadAudit(id);
      if (!audit) return null;
      const sum = summary(audit);
      await s.put(`${id}/summary.json`, JSON.stringify(sum), 'application/json').catch(() => {});
      return sum;
    } catch { return null; }
  }));
  return rows.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function summary(a) {
  return {
    id: a.id,
    url: a.finalUrl,
    host: new URL(a.finalUrl).host,
    createdAt: a.createdAt,
    durationMs: a.durationMs,
    pages: a.pages.length,
    overall: a.analysis.overall,
    grade: a.analysis.grade,
    scores: a.analysis.scores,
    counts: a.analysis.counts,
  };
}

export async function deleteAudit(id) {
  await store().remove(checkId(id));
}

/** Most recent earlier audit of the same host, for before/after comparison. */
export async function findPrevious(host, beforeIso) {
  const list = await listAudits();
  const prev = list.find((a) => a.host.replace(/^www\./, '') === host.replace(/^www\./, '') && a.createdAt < beforeIso);
  return prev ? loadAudit(prev.id) : null;
}
