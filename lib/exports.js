/**
 * Spreadsheet exports. Each CSV answers one question:
 *   issues.csv     What needs fixing, in priority order? (one row per issue)
 *   locations.csv  Exactly where is each problem? (one row per issue per page)
 *   pages.csv      How does each page measure up? (one row per page)
 *   links.csv      Which links are broken, redirected or unverifiable, and where are they?
 * All files open cleanly in Excel (UTF-8 BOM, CRLF line endings).
 */
import { CATEGORIES } from './analyze.js';
import { effortOf, impactOf } from './summary.js';

const SEV_RANK = { critical: 1, high: 2, medium: 3, low: 4 };
const EFFORT_LABEL = { low: 'Quick fix', medium: 'Moderate', high: 'Larger job' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const kb = (b) => (b ? Math.round(b / 1024) : '');
const ms = (v) => (v === null || v === undefined || Number.isNaN(v) ? '' : Math.round(v));

function toCsv(rows) {
  // Prefix cells that look like formulas so spreadsheets don't execute them (CSV injection).
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

export function issuesCsv(audit) {
  const rows = [['Priority', 'Severity', 'Area', 'Issue', 'Occurrences', 'Pages affected', 'Impact', 'Effort', 'Why it matters', 'How to fix', 'Example pages']];
  audit.analysis.issues.forEach((i, n) => {
    const pages = [...new Set(i.affected.map((a) => a.url).filter(Boolean))];
    rows.push([
      n + 1, cap(i.severity), CATEGORIES[i.category].label, i.title, i.count, pages.length || (i.affected.length ? '' : 'Site-wide'),
      cap(impactOf(i.severity)), EFFORT_LABEL[effortOf(i.id)], i.description, i.fix,
      pages.slice(0, 5).map(pathOf).join(' | ') + (pages.length > 5 ? ` | +${pages.length - 5} more` : ''),
    ]);
  });
  return toCsv(rows);
}

export function locationsCsv(audit) {
  const rows = [['Priority', 'Severity', 'Area', 'Issue', 'Page URL', 'Detail']];
  audit.analysis.issues.forEach((i, n) => {
    const affected = i.affected.length ? i.affected : [{ url: audit.finalUrl, detail: 'Site-wide' }];
    for (const a of affected) rows.push([n + 1, cap(i.severity), CATEGORIES[i.category].label, i.title, a.url, a.detail]);
  });
  return toCsv(rows);
}

export function pagesCsv(audit) {
  const issuesByPage = new Map();
  for (const i of audit.analysis.issues) {
    for (const url of new Set(i.affected.map((a) => a.url))) issuesByPage.set(url, (issuesByPage.get(url) || 0) + 1);
  }
  const rows = [['URL', 'HTTP status', 'Title', 'Title length', 'Meta description', 'Description length', 'H1', 'H1 count', 'Words',
    'Canonical', 'Indexable', 'Images', 'Images missing alt', 'Internal links', 'External links',
    'Server response (ms)', 'Load time (ms)', 'Page weight (KB)', 'Requests', 'WCAG violations', 'JavaScript errors', 'Issues on this page']];
  for (const p of audit.pages) {
    rows.push([
      p.finalUrl || p.url, p.status || p.error || '', p.title || '', p.title?.length || 0, p.metaDescription || '', p.metaDescription?.length || 0,
      (p.h1 || []).join(' / '), (p.h1 || []).length, p.wordCount ?? '',
      p.canonical ? 'Yes' : 'No', /noindex/i.test(p.metaRobots || '') ? 'No (noindex)' : 'Yes',
      p.imageCount ?? 0, p.imagesMissingAlt ?? 0, p.internalLinks ?? 0, p.externalLinks ?? 0,
      ms(p.timing?.ttfb), ms(p.loadMs), kb(p.transferBytes), p.requestCount ?? '', p.axeViolations ?? 0, p.consoleErrors ?? 0,
      issuesByPage.get(p.finalUrl) || 0,
    ]);
  }
  return toCsv(rows);
}

export function linksCsv(audit) {
  const host = new URL(audit.finalUrl).hostname.replace(/^www\./, '');
  const sources = audit.linkSources || {};
  const resultOf = (r) => (!r.ok ? 'Broken' : r.unverified ? 'Could not verify' : r.redirectedTo ? 'Redirected' : 'OK');
  const order = { Broken: 0, Redirected: 1, 'Could not verify': 2, OK: 3 };
  const list = Object.entries(audit.linkResults || {}).map(([url, r]) => {
    let type = 'External';
    try { if (new URL(url).hostname.replace(/^www\./, '') === host) type = 'Internal'; } catch { /* keep external */ }
    return { url, r, type, result: resultOf(r) };
  }).sort((a, b) => order[a.result] - order[b.result] || a.type.localeCompare(b.type) || a.url.localeCompare(b.url));

  const rows = [['Result', 'Type', 'HTTP status', 'Link URL', 'Redirects to', 'Link text', 'Found on (pages)']];
  for (const { url, r, type, result } of list) {
    const src = sources[url] || [];
    rows.push([result, type, r.status, url, r.redirectedTo || '', src[0]?.text || '', src.map((s) => s.page).join(' | ')]);
  }
  return toCsv(rows);
}
