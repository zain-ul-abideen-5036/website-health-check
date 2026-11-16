import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { chromeForLighthouse } from '../browser.js';

const METRICS = [
  ['first-contentful-paint', 'First Contentful Paint', 'FCP'],
  ['largest-contentful-paint', 'Largest Contentful Paint', 'LCP'],
  ['total-blocking-time', 'Total Blocking Time', 'TBT'],
  ['cumulative-layout-shift', 'Cumulative Layout Shift', 'CLS'],
  ['speed-index', 'Speed Index', 'SI'],
  ['interactive', 'Time to Interactive', 'TTI'],
];

/** Run Lighthouse once for a form factor ("mobile" | "desktop"). Never throws. */
export async function runLighthouse(url, formFactor = 'mobile') {
  let chrome;
  try {
    chrome = await chromeLauncher.launch(await chromeForLighthouse());
    const flags = {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      maxWaitForLoad: 45000,
    };
    const result = await lighthouse(url, flags, formFactor === 'desktop' ? desktopConfig : undefined);
    const { categories, audits, runtimeError, runWarnings } = result.lhr;
    if (runtimeError) return { formFactor, error: runtimeError.message };

    const score = (c) => (c && c.score !== null ? Math.round(c.score * 100) : null);

    const metrics = METRICS.map(([id, name, short]) => ({
      id, name, short,
      value: audits[id]?.numericValue ?? null,
      display: audits[id]?.displayValue ?? 'n/a',
      score: audits[id]?.score ?? null,
    }));

    // "Opportunities" = things Lighthouse estimates would save load time.
    const opportunities = Object.values(audits)
      .filter((a) => a.details?.type === 'opportunity' && a.score !== null && a.score < 0.9)
      .map((a) => ({
        id: a.id,
        title: a.title,
        description: stripMarkdownLinks(a.description),
        savingsMs: Math.round(a.details.overallSavingsMs || 0),
        savingsBytes: Math.round(a.details.overallSavingsBytes || 0),
        display: a.displayValue || '',
      }))
      .filter((o) => o.savingsMs > 0 || o.savingsBytes > 0)
      .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes)
      .slice(0, 10);

    const totalBytes = audits['total-byte-weight']?.numericValue ?? null;

    return {
      formFactor,
      scores: {
        performance: score(categories.performance),
        accessibility: score(categories.accessibility),
        bestPractices: score(categories['best-practices']),
        seo: score(categories.seo),
      },
      metrics,
      opportunities,
      totalBytes,
      warnings: runWarnings ?? [],
      error: null,
    };
  } catch (err) {
    return { formFactor, error: `Lighthouse could not test this page: ${err.message.split('\n')[0]}` };
  } finally {
    // kill() is sync in some chrome-launcher versions and async in others.
    if (chrome) await Promise.resolve().then(() => chrome.kill()).catch(() => {});
  }
}

function stripMarkdownLinks(s = '') {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}
