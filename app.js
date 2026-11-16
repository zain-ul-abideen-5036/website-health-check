/**
 * The Express app, shared by the local server (server.js) and Vercel (api/index.js).
 */
import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseUrl } from './lib/url.js';
import { createJob, createLiveJob, getJob, publicJob } from './lib/jobs.js';
import { listAudits, loadAudit, deleteAudit, readScreenshot, storageProblem } from './lib/storage.js';
import { launchBrowser, isServerless } from './lib/browser.js';
import { visitor, clientIp, createRateLimit } from './lib/visitor.js';
import { aiEnabled } from './lib/ai.js';
import { fieldDataEnabled } from './lib/checks/field-data.js';
import { issuesCsv, locationsCsv, pagesCsv, linksCsv } from './lib/exports.js';
import { renderPdf } from './lib/pdf-report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Serverless functions have a time limit (300 s on Vercel's free plan), so large crawls are capped there.
const PAGE_OPTIONS = isServerless ? [1, 5, 10] : [1, 5, 10, 25, 50];
const MAX_LINKS = isServerless ? 200 : 400;
const STREAMING = isServerless || process.env.AUDIT_MODE === 'stream';

const app = express();
app.disable('x-powered-by');

// Open access, no passwords: each browser gets an anonymous visitor ID (see lib/visitor.js).
// On a public deployment, History shows only the visitor's own audits and audits are rate limited.
const PUBLIC = isServerless || process.env.PUBLIC_MODE === '1';
const AUDITS_PER_HOUR = Number(process.env.AUDITS_PER_HOUR) || 6;
const auditLimit = createRateLimit({ max: AUDITS_PER_HOUR, windowMs: 60 * 60 * 1000 });
app.set('trust proxy', true);
app.use('/api', visitor);

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ------------------------------------------------------------------ config
app.get('/api/config', (req, res) => res.json({
  aiEnabled: aiEnabled(),
  fieldData: fieldDataEnabled(),
  pageOptions: PAGE_OPTIONS,
  // 'queue': local server, progress over Server-Sent Events. 'stream': serverless, the audit runs inside one streamed request.
  mode: isServerless || process.env.AUDIT_MODE === 'stream' ? 'stream' : 'queue',
  storageProblem: storageProblem(),
  public: PUBLIC,
  auditsPerHour: PUBLIC ? AUDITS_PER_HOUR : null,
}));

// ------------------------------------------------------------------ start an audit
async function parseAuditRequest(req) {
  const body = req.body;
  const problem = storageProblem();
  if (problem) throw Object.assign(new Error(problem), { status: 503 });
  let url;
  try { url = await normaliseUrl(body?.url); } catch (err) { throw Object.assign(err, { status: 400 }); }
  const maxPages = PAGE_OPTIONS.includes(Number(body?.maxPages)) ? Number(body.maxPages) : Math.min(10, PAGE_OPTIONS.at(-1));
  const device = ['mobile', 'desktop', 'both'].includes(body?.device) ? body.device : 'mobile';
  // Streamed runs must finish before the platform cuts the request: give the pipeline a budget below the limit.
  const timeBudgetMs = STREAMING ? STREAM_LIMIT_MS - 15000 : undefined;
  if (PUBLIC) {
    const wait = auditLimit.take(clientIp(req));
    if (wait) throw Object.assign(new Error(`You've run ${AUDITS_PER_HOUR} audit${AUDITS_PER_HOUR === 1 ? '' : 's'} in the last hour. Please try again in ${wait} minute${wait === 1 ? '' : 's'}.`), { status: 429 });
  }
  // owner: hash of the visitor ID, so History can show each visitor only their own audits.
  return { url, options: { maxPages, device, ai: Boolean(body?.ai) && aiEnabled(), maxLinks: MAX_LINKS, timeBudgetMs, owner: PUBLIC ? req.visitor : undefined } };
}

// Local server: queue the audit and return its id; progress comes from /api/jobs/:id/events.
app.post('/api/audits', wrap(async (req, res) => {
  let parsed;
  try { parsed = await parseAuditRequest(req); } catch (err) { return res.status(err.status || 400).json({ error: err.message }); }
  const job = createJob(parsed.url, parsed.options);
  res.status(202).json({ id: job.id });
}));

// Serverless: run the audit inside this request and stream progress as newline-delimited JSON.
// Streams that are currently running an audit, so a crash anywhere can still be reported to the browser.
const liveStreams = new Set();
const reportCrash = (kind) => (err) => {
  console.error(`[${kind}]`, err);
  const message = `The server hit an unexpected error: ${String(err?.message || err).split('\n')[0]}`;
  for (const send of liveStreams) send({ status: 'failed', error: message, message: `Failed: ${message}` });
};
// Without these, one stray error inside Chrome or Lighthouse would kill the process and cut the stream silently.
process.on('unhandledRejection', reportCrash('unhandledRejection'));
process.on('uncaughtException', reportCrash('uncaughtException'));

// Stop just before the platform's time limit so the browser gets a clear message instead of a cut connection.
const STREAM_LIMIT_MS = ((Number(process.env.FUNCTION_TIMEOUT_SECONDS) || 300) - 12) * 1000;

app.post('/api/audits/stream', wrap(async (req, res) => {
  let parsed;
  try { parsed = await parseAuditRequest(req); } catch (err) { return res.status(err.status || 400).json({ error: err.message }); }
  const job = createLiveJob(parsed.url, parsed.options);
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  const send = (data) => { if (!res.writableEnded) res.write(`${JSON.stringify(data)}\n`); };
  liveStreams.add(send);
  send({ snapshot: publicJob(job) });
  const onUpdate = (u) => {
    send(u);
    if (u.message) console.log(`[audit ${job.id}] ${u.message}`); // visible in the Vercel logs
  };
  job.events.on('update', onUpdate);
  const ping = setInterval(() => send({ ping: true }), 10000); // keeps proxies from closing an idle stream
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      const message = `The audit hit the ${Math.round((STREAM_LIMIT_MS + 12000) / 60000)}-minute server limit during "${job.step || 'start-up'}". Try fewer pages or a single Lighthouse device.`;
      console.error(`[audit ${job.id}] ${message}`);
      send({ status: 'failed', error: message, message: `Failed: ${message}` });
      resolve();
    }, STREAM_LIMIT_MS);
  });
  try {
    await Promise.race([job.run(), deadline]);
  } finally {
    clearTimeout(timer);
    clearInterval(ping);
    liveStreams.delete(send);
    job.events.off('update', onUpdate);
    res.end();
  }
}));

// ------------------------------------------------------------------ live progress (Server-Sent Events)
app.get('/api/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).end();

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ snapshot: publicJob(job) });
  if (job.status === 'done' || job.status === 'failed') return res.end();

  const onUpdate = (u) => {
    send(u);
    if (u.status === 'done' || u.status === 'failed') cleanup();
  };
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  const cleanup = () => { clearInterval(ping); job.events.off('update', onUpdate); res.end(); };
  job.events.on('update', onUpdate);
  req.on('close', cleanup);
});

// ------------------------------------------------------------------ audit history and results
/** On a public deployment, only the visitor who ran an audit owns it. Locally, you own everything. */
const owns = (req, audit) => !PUBLIC || (audit.owner && audit.owner === req.visitor);

app.get('/api/audits', wrap(async (req, res) => {
  const list = await listAudits();
  res.json(list.filter((a) => owns(req, a)).map(({ owner, ...a }) => a));
}));

// Anyone with a report's link can view it (IDs are long and random), but only the owner can delete it.
app.get('/api/audits/:id', wrap(async (req, res) => {
  const audit = await loadAudit(req.params.id);
  if (!audit) return res.status(404).json({ error: 'Audit not found' });
  audit.screenshotUrls = Object.fromEntries((audit.screenshots || []).map((n) => [n, `/api/audits/${audit.id}/screenshots/${n}.jpg`]));
  audit.canDelete = owns(req, audit);
  delete audit.owner;
  if (audit.options) delete audit.options.owner;
  res.json(audit);
}));

app.delete('/api/audits/:id', wrap(async (req, res) => {
  const audit = await loadAudit(req.params.id);
  if (!audit) return res.status(404).json({ error: 'Audit not found' });
  if (!owns(req, audit)) return res.status(403).json({ error: 'Only the person who ran this audit can delete it.' });
  await deleteAudit(req.params.id);
  res.status(204).end();
}));

app.get('/api/audits/:id/screenshots/:name.jpg', wrap(async (req, res) => {
  const buf = await readScreenshot(req.params.id, req.params.name);
  if (!buf) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type('jpeg').send(buf);
}));

// ------------------------------------------------------------------ exports
async function standaloneHtml(audit, { print = false } = {}) {
  const [css, render] = await Promise.all([
    readFile(path.join(__dirname, 'public/css/app.css'), 'utf8'),
    readFile(path.join(__dirname, 'public/js/render.js'), 'utf8'),
  ]);
  audit.screenshotUrls = {};
  for (const name of audit.screenshots || []) {
    const buf = await readScreenshot(audit.id, name);
    if (buf) audit.screenshotUrls[name] = `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  // Escape '<' and the JS line separators so the JSON is safe inside a <script> tag.
  const json = JSON.stringify(audit).replace(/</g, '\\u003c').replace(new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g'), '');
  const title = `Website health report: ${new URL(audit.finalUrl).host}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, '&lt;')}</title><style>${css}</style></head>
<body class="standalone${print ? ' print' : ''}"><main class="container" id="report"></main>
<script>${render}</script>
<script>Report.mount(document.getElementById('report'), ${json}, { standalone: true, print: ${print} });</script>
</body></html>`;
}

const fileBase = (audit) => `health-report-${new URL(audit.finalUrl).host}-${audit.createdAt.slice(0, 10)}`;

app.get('/api/audits/:id/export.html', wrap(async (req, res) => {
  const audit = await loadAudit(req.params.id);
  if (!audit) return res.status(404).end();
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase(audit)}.html"`);
  res.type('html').send(await standaloneHtml(audit));
}));

async function screenshotData(audit) {
  const out = {};
  for (const name of audit.screenshots || []) {
    const buf = await readScreenshot(audit.id, name);
    if (buf) out[name] = `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  return out;
}

// One shared browser for PDF rendering, started on first use.
let pdfBrowser = null;
async function getPdfBrowser() {
  if (!pdfBrowser || !pdfBrowser.isConnected()) pdfBrowser = await launchBrowser();
  return pdfBrowser;
}

app.get('/api/audits/:id/export.pdf', wrap(async (req, res) => {
  const audit = await loadAudit(req.params.id);
  if (!audit) return res.status(404).end();
  const pdf = await renderPdf(await getPdfBrowser(), audit, await screenshotData(audit));
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase(audit)}.pdf"`);
  res.type('pdf').send(pdf);
}));

// Spreadsheet exports: /issues.csv, /locations.csv, /pages.csv, /links.csv
const CSV = { issues: issuesCsv, locations: locationsCsv, pages: pagesCsv, links: linksCsv };
app.get('/api/audits/:id/:kind.csv', wrap(async (req, res) => {
  const build = CSV[req.params.kind];
  if (!build) return res.status(404).end();
  const audit = await loadAudit(req.params.id);
  if (!audit) return res.status(404).end();
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase(audit)}-${req.params.kind}.csv"`);
  res.type('csv').send(build(audit));
}));

// ------------------------------------------------------------------ errors
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: err.message });
});

export default app;
