import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { runLighthouse } from './checks/lighthouse.js';
import { runSiteChecks } from './checks/site.js';
import { checkUrls } from './checks/links.js';
import { crawlSite, captureScreenshots } from './crawler.js';
import { analyze, compareAudits } from './analyze.js';
import { summarise, aiEnabled } from './ai.js';
import { buildSummary } from './summary.js';
import { saveAudit, findPrevious } from './storage.js';
import { getFieldData } from './checks/field-data.js';

const jobs = new Map();
const queue = [];
let running = false;

export const STEPS = [
  { key: 'site', label: 'Checking SSL, security headers, robots.txt and sitemap' },
  { key: 'lighthouse', label: 'Running Google Lighthouse' },
  { key: 'crawl', label: 'Crawling and analysing pages' },
  { key: 'links', label: 'Checking links' },
  { key: 'screenshots', label: 'Taking screenshots' },
  { key: 'analyze', label: 'Scoring and prioritising issues' },
  { key: 'ai', label: 'Writing AI summary' },
];

function makeJob(url, options) {
  const job = {
    id: `${new URL(url).hostname.replace(/[^a-z0-9]/gi, '-')}-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`,
    url,
    options,
    status: 'queued',
    step: null,
    percent: 0,
    log: [],
    error: null,
    createdAt: new Date().toISOString(),
    events: new EventEmitter(),
  };
  job.events.setMaxListeners(50);
  return job;
}

/** Queue an audit (local server): runs one at a time, progress via getJob(id).events. */
export function createJob(url, options) {
  const job = makeJob(url, options);
  jobs.set(job.id, job);
  queue.push(job);
  emit(job, { message: queue.length > 1 || running ? `Queued (position ${queue.length})` : 'Starting…' });
  pump();
  return job;
}

export const getJob = (id) => jobs.get(id);

/**
 * Serverless mode: the audit runs inside the HTTP request that streams its progress,
 * because a later request may land on a different instance with no shared memory.
 * Subscribe to job.events before awaiting run().
 */
export function createLiveJob(url, options) {
  const job = makeJob(url, options);
  job.run = async () => {
    try {
      await runJob(job);
    } catch (err) {
      console.error(err);
      const msg = err.message.split('\n')[0];
      emit(job, { status: 'failed', error: msg, message: `Failed: ${msg}` });
    }
  };
  return job;
}

export function publicJob(job) {
  const { events, ...rest } = job;
  return { ...rest, steps: STEPS.filter((s) => s.key !== 'ai' || job.options.ai) };
}

function emit(job, patch) {
  if (patch.message) job.log.push({ t: Date.now(), message: patch.message });
  Object.assign(job, { ...patch, message: undefined });
  job.events.emit('update', { status: job.status, step: job.step, percent: job.percent, message: patch.message, error: job.error, log: undefined });
}

async function pump() {
  if (running || !queue.length) return;
  running = true;
  const job = queue.shift();
  try {
    await runJob(job);
  } catch (err) {
    console.error(err);
    emit(job, { status: 'failed', error: err.message.split('\n')[0], message: `Failed: ${err.message.split('\n')[0]}` });
  } finally {
    running = false;
    // Free memory a while after completion; results are on disk.
    setTimeout(() => jobs.delete(job.id), 30 * 60 * 1000).unref();
    pump();
  }
}

async function runJob(job) {
  const { url, options } = job;
  const started = Date.now();
  job.status = 'running';
  // Serverless runs have a hard time limit. With a budget, slow steps are trimmed (and noted in the report)
  // so the audit still finishes with useful results instead of being cut off.
  const end = options.timeBudgetMs ? started + options.timeBudgetMs : Infinity;
  const left = () => end - Date.now();
  const limits = [];
  const limit = (text) => { limits.push(text); emit(job, { message: text }); };

  emit(job, { step: 'site', percent: 3, message: 'Checking SSL certificate, security headers, robots.txt and sitemap' });
  // Real-visitor data (only if a free Google API key is set) runs alongside the site checks.
  const [site, fieldData] = await Promise.all([runSiteChecks(url), getFieldData(url, options.device === 'desktop' ? 'desktop' : 'mobile')]);
  if (fieldData) emit(job, { message: fieldData.available ? `Real-visitor data found (${fieldData.scope === 'page' ? 'this page' : 'whole site'})` : fieldData.error || 'Not enough real-visitor data for this site' });
  emit(job, { percent: 8, message: `Site checks done${site.sitemap.found ? `: sitemap has ${site.sitemap.urlCount} URLs` : ''}` });

  const lighthouse = {};
  const devices = options.device === 'both' ? ['mobile', 'desktop'] : [options.device];
  for (const [i, d] of devices.entries()) {
    if (i > 0 && left() < 170000) { limit(`Skipped the ${d} Lighthouse test to stay within the time limit.`); break; }
    emit(job, { step: 'lighthouse', percent: 10 + i * 12, message: `Running Lighthouse (${d})… this takes 20–40 seconds` });
    lighthouse[d] = await runLighthouse(url, d);
    emit(job, { message: lighthouse[d].error ? `Lighthouse ${d}: ${lighthouse[d].error}` : `Lighthouse ${d}: performance ${lighthouse[d].scores.performance}/100` });
  }

  emit(job, { step: 'crawl', percent: 35, message: `Crawling up to ${options.maxPages} pages` });
  const pages = await crawlSite(url, {
    maxPages: options.maxPages,
    seeds: site.sitemap.urls,
    deadline: end - 80000, // leave time for links, screenshots and scoring
    onProgress: ({ message, done, total }) => emit(job, { percent: 35 + Math.round((done / total) * 30), message }),
  });
  if (pages.length < options.maxPages && left() < 80000) limit(`Crawled ${pages.length} of up to ${options.maxPages} pages before the time limit.`);
  if (!pages.length || (pages[0].status === 0 && pages[0].error)) throw new Error(`Could not load the site: ${pages[0]?.error || 'no response'}`);
  emit(job, { percent: 65, message: `Analysed ${pages.length} page${pages.length === 1 ? '' : 's'}` });

  const allLinks = [...new Set(pages.flatMap((p) => [...(p.links?.internal ?? []), ...(p.links?.external ?? [])].map((l) => l.href)))]
    .slice(0, options.maxLinks);
  emit(job, { step: 'links', percent: 66, message: `Checking ${allLinks.length} unique links` });
  const linkMap = await checkUrls(allLinks, (done, total) => emit(job, { percent: 66 + Math.round((done / total) * 16), message: `Checked ${done}/${total} links` }), { deadline: end - 40000 });
  if (linkMap.size < allLinks.length) limit(`Checked ${linkMap.size} of ${allLinks.length} links before the time limit.`);
  const linkResults = Object.fromEntries(linkMap);

  emit(job, { step: 'screenshots', percent: 83, message: 'Capturing mobile, tablet and desktop screenshots' });
  let screenshots = {};
  if (left() > 30000) screenshots = await captureScreenshots(pages[0].finalUrl || url, { deadline: end - 8000 });
  else limit('Skipped screenshots to stay within the time limit.');

  emit(job, { step: 'analyze', percent: 90, message: 'Scoring and prioritising issues' });
  const analysis = analyze({ startUrl: url, site, lighthouse, pages, linkResults, fieldData });

  const audit = {
    id: job.id,
    url,
    finalUrl: pages[0].finalUrl || url,
    createdAt: job.createdAt,
    options,
    site,
    lighthouse,
    pages: pages.map(slimPage),
    linksChecked: linkMap.size,
    linkResults,
    linkSources: linkSourcesFor(pages, linkResults),
    fieldData,
    analysis,
    limits,
  };
  // Sitemap URL list is only needed for crawling.
  delete audit.site.sitemap.urls;

  const previous = await findPrevious(new URL(audit.finalUrl).host, audit.createdAt);
  audit.comparison = compareAudits(analysis, previous);
  audit.summary = buildSummary(audit); // free, offline: always available

  if (options.ai && aiEnabled()) {
    emit(job, { step: 'ai', percent: 93, message: 'Writing AI summary and recommendations' });
    audit.ai = await summarise(audit);
    emit(job, { message: audit.ai?.error ? audit.ai.error : 'AI summary ready' });
  }

  audit.durationMs = Date.now() - started;
  await saveAudit(audit, screenshots);
  emit(job, { status: 'done', step: null, percent: 100, message: `Done in ${(audit.durationMs / 1000).toFixed(0)}s · score ${analysis.overall}/100 (${analysis.grade})` });
}

/** Pages each problem link was found on (broken, redirected or unverified only), for the links export. */
function linkSourcesFor(pages, linkResults) {
  const out = {};
  for (const p of pages) {
    for (const l of [...(p.links?.internal ?? []), ...(p.links?.external ?? [])]) {
      const r = linkResults[l.href];
      if (!r || (r.ok && !r.redirectedTo && !r.unverified)) continue;
      const list = (out[l.href] ||= []);
      if (list.length < 10 && !list.some((x) => x.page === p.finalUrl)) list.push({ page: p.finalUrl, text: (l.text || '').slice(0, 120) });
    }
  }
  return out;
}

/** Keep stored JSON small: drop bulky per-page data the report doesn't need. */
function slimPage(p) {
  return {
    url: p.url, finalUrl: p.finalUrl, status: p.status, error: p.error,
    title: p.title, metaDescription: p.metaDescription, metaRobots: p.metaRobots, canonical: p.canonical,
    lang: p.lang, viewport: Boolean(p.viewport), og: p.og, twitterCard: p.twitterCard,
    h1: (p.headings || []).filter((h) => h.level === 1).map((h) => h.text),
    headingCount: (p.headings || []).length,
    wordCount: p.wordCount, jsonLd: p.jsonLd,
    imageCount: (p.images || []).length,
    imagesMissingAlt: (p.images || []).filter((i) => i.alt === null && i.visible).length,
    internalLinks: (p.links?.internal || []).length, externalLinks: (p.links?.external || []).length,
    transferBytes: p.transferBytes, requestCount: p.requestCount, timing: p.timing, loadMs: p.loadMs,
    axeViolations: (p.axe?.violations || []).length,
    consoleErrors: (p.consoleErrors || []).length,
  };
}
