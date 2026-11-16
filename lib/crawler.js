import { devices } from 'playwright-core';
import { launchBrowser, isServerless } from './browser.js';
import { AxeBuilder } from '@axe-core/playwright';
import { crawlKey, isCrawlable } from './url.js';

const PAGE_CONCURRENCY = isServerless ? 2 : 3; // serverless functions get one CPU
const NAV_TIMEOUT = isServerless ? 25000 : 40000;
const IDLE_WAIT = 6000; // after "load", wait at most this long for the network to go quiet
const UA_SUFFIX = ' WebsiteHealthCheck';

/**
 * Crawl up to maxPages same-site pages starting at startUrl (sitemap URLs used as extra seeds)
 * and inspect each one in a real browser.
 */
export async function crawlSite(startUrl, { maxPages = 10, seeds = [], runAxe = true, deadline = Infinity, onProgress = () => {} } = {}) {
  const browser = await launchBrowser(['--disable-dev-shm-usage']);
  const origin = new URL(startUrl).origin;
  const queue = [startUrl, ...seeds.filter((s) => isCrawlable(s, origin))];
  const seen = new Set();
  const pages = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      // Headless Chrome's default UA says "HeadlessChrome", which some sites block.
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version().split('.')[0]}.0.0.0 Safari/537.36${UA_SUFFIX}`,
      ignoreHTTPSErrors: true,
    });

    const next = () => {
      while (queue.length) {
        const candidate = queue.shift();
        let key;
        try { key = crawlKey(candidate); } catch { continue; }
        if (seen.has(key)) continue;
        seen.add(key);
        return candidate;
      }
      return null;
    };

    // Workers pull from a shared queue; links found on each page are added to it.
    let inFlight = 0;
    async function worker() {
      // Stop starting new pages once the time budget is spent (serverless); pages already loading still finish.
      while (pages.length + inFlight < maxPages && Date.now() < deadline) {
        const url = next();
        if (!url) {
          if (inFlight === 0) return;
          await new Promise((r) => setTimeout(r, 250)); // wait for other workers to discover links
          continue;
        }
        inFlight++;
        onProgress({ message: `Scanning ${shortUrl(url)}`, done: pages.length, total: maxPages });
        const result = await inspectPage(context, url, { runAxe });
        inFlight--;
        // Redirected to a page we've already got? Skip the duplicate.
        const finalKey = result.finalUrl ? crawlKey(result.finalUrl) : null;
        if (finalKey && finalKey !== crawlKey(url) && seen.has(finalKey) && pages.some((p) => crawlKey(p.finalUrl) === finalKey)) continue;
        if (finalKey) seen.add(finalKey);
        pages.push(result);
        for (const link of result.links?.internal ?? []) if (isCrawlable(link.href, origin)) queue.push(link.href);
      }
    }
    await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, worker));
    await context.close();
    return pages.slice(0, maxPages);
  } finally {
    await browser.close();
  }
}

async function inspectPage(context, url, { runAxe }) {
  const page = await context.newPage();
  const failedResources = [];
  const mixedContent = new Set();
  const consoleErrors = [];
  const resourceSizes = new Map();
  const isHttps = url.startsWith('https://');
  const started = Date.now();

  page.on('response', async (res) => {
    const req = res.request();
    const type = req.resourceType();
    if (res.status() >= 400 && type !== 'document' && !/favicon/.test(res.url())) {
      failedResources.push({ url: res.url(), status: res.status(), type });
    }
    if (type === 'image') {
      const len = Number(res.headers()['content-length'] || 0);
      if (len) resourceSizes.set(res.url(), len);
    }
  });
  page.on('request', (req) => {
    if (isHttps && req.url().startsWith('http://')) mixedContent.add(req.url());
  });
  page.on('requestfailed', (req) => {
    const err = req.failure()?.errorText || 'failed';
    if (/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(err)) return; // aborted by the page itself, not a real failure
    if (/mixed-content/i.test(err)) return; // reported separately as mixed content
    failedResources.push({ url: req.url(), status: err.replace('net::', ''), type: req.resourceType() });
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Already covered by the mixed-content and broken-resource checks.
    if (/^Mixed Content:|Failed to load resource/i.test(text)) return;
    consoleErrors.push(text.slice(0, 300));
  });
  page.on('pageerror', (err) => consoleErrors.push(`Uncaught: ${err.message.slice(0, 300)}`));

  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT });
    } catch (err) {
      // Very slow page: take whatever has rendered so far rather than loading it twice.
      if (!/Timeout/i.test(err.message)) throw err;
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    }
    // Let late requests (lazy images, fonts) finish, but don't wait forever: chat widgets and analytics may never go quiet.
    await page.waitForLoadState('networkidle', { timeout: IDLE_WAIT }).catch(() => {});
    const status = response?.status() ?? 0;
    const headers = response?.headers() ?? {};
    // Give lazy content a moment and trigger lazy-loaded images.
    await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
      window.scrollTo(0, 0);
    }).catch(() => {});

    const dom = await page.evaluate(extractPageData);

    // Use network sizes for images (falls back to Resource Timing).
    for (const img of dom.images) {
      img.bytes = resourceSizes.get(img.src) || dom.resourceBytes[img.src] || 0;
    }

    let axe = { violations: [], passes: 0, error: null };
    if (runAxe && status < 400) {
      try {
        const r = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        axe = {
          passes: r.passes.length,
          violations: r.violations.map((v) => ({
            id: v.id,
            impact: v.impact || 'minor',
            help: v.help,
            description: v.description,
            helpUrl: v.helpUrl,
            nodes: v.nodes.length,
            samples: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 200) })),
          })),
          error: null,
        };
      } catch (err) {
        axe.error = err.message.split('\n')[0];
      }
    }

    delete dom.resourceBytes;
    return {
      url,
      finalUrl: page.url(),
      status,
      contentType: headers['content-type'] || '',
      xRobotsTag: headers['x-robots-tag'] || '',
      loadMs: dom.timing.load || Date.now() - started,
      timing: dom.timing,
      ...dom,
      failedResources: dedupeBy(failedResources, (r) => r.url),
      mixedContent: [...mixedContent].slice(0, 50),
      consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
      axe,
      error: null,
    };
  } catch (err) {
    return { url, finalUrl: url, status: 0, error: err.message.split('\n')[0], links: { internal: [], external: [] }, images: [], headings: [], axe: { violations: [] }, failedResources: [], mixedContent: [], consoleErrors: [] };
  } finally {
    await page.close().catch(() => {});
  }
}

/** Runs inside the page. Must be self-contained. */
function extractPageData() {
  const attr = (sel, name) => document.querySelector(sel)?.getAttribute(name)?.trim() || '';
  const meta = (name) => attr(`meta[name="${name}" i]`, 'content');
  const prop = (p) => attr(`meta[property="${p}" i]`, 'content');

  const nav = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource');
  const resourceBytes = {};
  for (const r of resources) resourceBytes[r.name] = r.transferSize || r.encodedBodySize || 0;
  const transferBytes = (nav?.transferSize || 0) + resources.reduce((s, r) => s + (r.transferSize || 0), 0);

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter((h) => h.offsetParent !== null || getComputedStyle(h).position === 'fixed')
    .map((h) => ({ level: Number(h.tagName[1]), text: h.innerText.trim().replace(/\s+/g, ' ').slice(0, 120) }));

  const images = [...document.querySelectorAll('img')].map((img) => {
    const rect = img.getBoundingClientRect();
    return {
      src: img.currentSrc || img.src || img.getAttribute('data-src') || '',
      alt: img.getAttribute('alt'),
      hasDimensions: img.hasAttribute('width') && img.hasAttribute('height') || Boolean(img.style.aspectRatio),
      loading: img.getAttribute('loading') || '',
      naturalWidth: img.naturalWidth,
      displayWidth: Math.round(rect.width),
      visible: rect.width > 1 && rect.height > 1,
      aboveFold: rect.top < window.innerHeight,
    };
  }).filter((i) => i.src && !i.src.startsWith('data:'));

  const here = location.hostname.replace(/^www\./, '');
  const internal = [], external = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const raw = a.getAttribute('href').trim();
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript|sms|whatsapp):/i.test(raw)) continue;
    let href;
    try { href = new URL(raw, location.href).href.split('#')[0]; } catch { continue; }
    if (!/^https?:/.test(href)) continue;
    const text = (a.innerText || a.getAttribute('aria-label') || a.querySelector('img')?.alt || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const link = { href, text, nofollow: /nofollow/i.test(a.rel) };
    (new URL(href).hostname.replace(/^www\./, '') === here ? internal : external).push(link);
  }

  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => {
    try {
      const data = JSON.parse(s.textContent);
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      return items.map((i) => [].concat(i['@type'] || 'Unknown').join(', '));
    } catch { return ['Invalid JSON-LD']; }
  });

  const text = document.body?.innerText || '';
  return {
    title: document.title.trim(),
    metaDescription: meta('description'),
    metaRobots: meta('robots'),
    canonical: attr('link[rel="canonical"]', 'href'),
    lang: document.documentElement.getAttribute('lang') || '',
    viewport: meta('viewport'),
    charset: document.querySelector('meta[charset]') ? document.characterSet : (document.querySelector('meta[http-equiv="content-type" i]') ? document.characterSet : ''),
    favicon: attr('link[rel~="icon"]', 'href'),
    og: { title: prop('og:title'), description: prop('og:description'), image: prop('og:image'), type: prop('og:type') },
    twitterCard: meta('twitter:card'),
    headings,
    wordCount: text.split(/\s+/).filter((w) => /\w/.test(w)).length,
    images,
    links: { internal, external },
    jsonLd,
    iframes: document.querySelectorAll('iframe').length,
    forms: document.querySelectorAll('form').length,
    resourceBytes,
    transferBytes,
    requestCount: resources.length + 1,
    timing: nav ? {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd || nav.duration),
    } : {},
  };
}

/** Viewport screenshots of the start page on three device sizes. */
export async function captureScreenshots(url, { deadline = Infinity } = {}) {
  // All three devices load in parallel to save time, and never past the deadline.
  const navTimeout = Math.max(5000, Math.min(NAV_TIMEOUT, deadline - Date.now() - 6000));
  const browser = await launchBrowser();
  const targets = {
    mobile: devices['iPhone 13'],
    tablet: devices['iPad Mini'],
    desktop: { viewport: { width: 1440, height: 900 } },
  };
  const shots = {};
  try {
    await Promise.all(Object.entries(targets).map(async ([name, device]) => {
      const ctx = await browser.newContext({ ...device, ignoreHTTPSErrors: true });
      try {
        const page = await ctx.newPage();
        // On a slow page, take the screenshot of whatever has rendered when time is up.
        await page.goto(url, { waitUntil: 'load', timeout: navTimeout }).catch(() => {});
        if (deadline - Date.now() > 8000) await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(600);
        shots[name] = await page.screenshot({ type: 'jpeg', quality: 72 });
      } catch { /* leave this screenshot out */ }
      await ctx.close().catch(() => {});
    }));
  } finally {
    await browser.close();
  }
  return shots;
}

const shortUrl = (u) => { try { const x = new URL(u); return x.pathname === '/' ? x.host : x.pathname; } catch { return u; } };
const dedupeBy = (arr, key) => [...new Map(arr.map((x) => [key(x), x])).values()];
