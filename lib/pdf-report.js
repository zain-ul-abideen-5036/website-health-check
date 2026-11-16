/**
 * Print layout for the client PDF. Designed for A4 paper rather than reusing the
 * interactive web report: cover page, one-page summary, ranked action plan,
 * findings by area, technical detail and a methodology appendix.
 */
import { CATEGORIES } from './analyze.js';
import { effortOf, WHY_AREA } from './summary.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const plural = (n, w) => `${n} ${n === 1 ? w : /(s|x|ch|sh)$/.test(w) ? `${w}es` : `${w}s`}`;
const trunc = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const pathOf = (u) => { try { const x = new URL(u); return (x.pathname + x.search) || '/'; } catch { return u; } };
const fmtMs = (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`);
const fmtBytes = (b) => (!b ? '–' : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const longDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const tone = (s) => (s === null || s === undefined ? 'na' : s >= 90 ? 'good' : s >= 50 ? 'warn' : 'bad');
const rating = (s) => (s >= 90 ? 'Good' : s >= 70 ? 'Fair' : s >= 50 ? 'Needs work' : 'Poor');
const gradeWord = (g) => ({ A: 'Excellent', B: 'Good', C: 'Fair', D: 'Needs work', F: 'Poor' }[g] || '');
const SEVS = ['critical', 'high', 'medium', 'low'];
const EFFORT = { low: 'Quick fix', medium: 'Moderate', high: 'Larger job' };
const SEV_MEANING = {
  critical: 'Broken or risky right now. Fix immediately.',
  high: 'Noticeably hurts visitors, rankings or security. Fix this month.',
  medium: 'Worth fixing in the next round of work.',
  low: 'Minor refinement. Fix when convenient.',
};

export const reportBrand = () => process.env.REPORT_BRAND || 'Website Health Check';

const sev = (s) => `<span class="sev sev-${s}"><i></i>${cap(s)}</span>`;
const bar = (score) => `<span class="bar t-${tone(score)}"><i style="width:${Math.max(0, Math.min(100, score ?? 0))}%"></i></span>`;
const chapter = (n, title, intro = '') => `<header class="ch"><span class="ch-n">${String(n).padStart(2, '0')}</span><h2>${title}</h2>${intro ? `<p class="ch-intro">${intro}</p>` : ''}</header>`;

// ------------------------------------------------------------------ cover
function cover(a, shots) {
  const an = a.analysis;
  const host = new URL(a.finalUrl).host;
  const devices = Object.keys(a.lighthouse).join(' and ');
  return `<section class="cover">
    <div class="cover-top">
      <span class="brand"><span class="mark"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg></span>${esc(reportBrand())}</span>
      <span>Website health report</span>
    </div>
    <div class="cover-title">
      <p class="eyebrow">Prepared for</p>
      <h1>${esc(host)}</h1>
      <p class="cover-url">${esc(a.finalUrl)}</p>
      <p class="cover-date">${longDate(a.createdAt)}</p>
    </div>
    <div class="cover-score">
      <div class="big">
        <div class="big-num">${an.overall}<span>/100</span></div>
        <div class="big-line"><span class="grade t-${tone(an.overall)}">${an.grade}</span>${gradeWord(an.grade)} overall</div>
      </div>
      <table class="cover-areas">${Object.entries(CATEGORIES).map(([k, c]) =>
        `<tr><th>${c.label}</th><td class="w">${bar(an.scores[k])}</td><td class="n">${an.scores[k]}</td></tr>`).join('')}</table>
    </div>
    ${shots.desktop || shots.mobile ? `<div class="cover-shots">
      ${shots.desktop ? `<figure class="shot-d"><img src="${shots.desktop}" alt=""><figcaption>Desktop</figcaption></figure>` : ''}
      ${shots.mobile ? `<figure class="shot-m"><img src="${shots.mobile}" alt=""><figcaption>Mobile</figcaption></figure>` : ''}
    </div>` : ''}
    <div class="cover-foot">
      <span>${plural(a.pages.length, 'page')} scanned</span><span>${plural(a.linksChecked, 'link')} checked</span><span>Lighthouse ${esc(devices)}</span><span>${plural(an.issues.length, 'issue')} found</span>
    </div>
  </section>`;
}

// ------------------------------------------------------------------ 01 summary
function summaryChapter(a) {
  const an = a.analysis;
  const s = a.ai && !a.ai.error ? a.ai : a.summary;
  const byCat = (k, sv) => an.issues.filter((i) => i.category === k && (!sv || i.severity === sv)).length;
  const total = an.issues.length || 1;

  const figures = `<div class="figures">
    <div><span class="k">Overall score</span><span class="v t-${tone(an.overall)}">${an.overall}<small>/100</small></span><span class="s">Grade ${an.grade}</span></div>
    <div><span class="k">Issues found</span><span class="v">${an.issues.length}</span><span class="s">${an.counts.critical} critical · ${an.counts.high} high</span></div>
    <div><span class="k">Pages scanned</span><span class="v">${a.pages.length}</span><span class="s">${plural(a.linksChecked, 'link')} checked</span></div>
    <div><span class="k">Checks passed</span><span class="v">${an.passed.length}</span><span class="s">already working well</span></div>
  </div>`;

  const areas = `<table class="t areas">
    <thead><tr><th>Area</th><th class="r">Score</th><th>Rating</th><th class="r">Issues</th><th>What it covers</th></tr></thead>
    <tbody>${Object.entries(CATEGORIES).map(([k, c]) => `<tr>
      <td class="nowrap"><strong>${c.label}</strong></td>
      <td class="r num"><span class="t-${tone(an.scores[k])}">${an.scores[k]}</span></td>
      <td class="nowrap">${rating(an.scores[k])}</td>
      <td class="r num">${byCat(k)}${byCat(k, 'critical') ? ` <span class="t-bad">(${byCat(k, 'critical')} critical)</span>` : ''}</td>
      <td class="muted">${cap(WHY_AREA[k])}</td></tr>`).join('')}</tbody></table>`;

  const dist = an.issues.length ? `<div class="dist">
    <div class="dist-bar">${SEVS.filter((x) => an.counts[x]).map((x) => `<span style="flex:${an.counts[x] / total};background:var(--sev-${x})"></span>`).join('')}</div>
    <div class="dist-key">${SEVS.map((x) => `<span>${sev(x)} ${an.counts[x]}</span>`).join('')}</div>
  </div>` : '';

  let cmp = '';
  if (a.comparison) {
    const c = a.comparison;
    const d = (n) => (n > 0 ? `<span class="t-good">+${n}</span>` : n < 0 ? `<span class="t-bad">−${Math.abs(n)}</span>` : '<span class="muted">±0</span>');
    cmp = `<h3 class="sub">Progress since ${longDate(c.previousDate)}</h3>
      <p class="deltas"><span><strong>Overall</strong> ${d(c.overallDelta)}</span>${Object.entries(c.scoreDeltas).map(([k, v]) => `<span>${CATEGORIES[k].label} ${d(v)}</span>`).join('')}</p>
      <div class="cols">
        <div><p class="label">${plural(c.fixed.length, 'issue')} resolved</p>${c.fixed.length ? `<ul class="plain">${c.fixed.slice(0, 8).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted">None</p>'}</div>
        <div><p class="label">${plural(c.newIssues.length, 'new issue')}</p>${c.newIssues.length ? `<ul class="plain">${c.newIssues.slice(0, 8).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted">None</p>'}</div>
      </div>`;
  }

  return `<section class="chapter">${chapter(1, 'Summary')}
    ${s ? `<p class="lede">${esc(s.executive_summary)}</p>` : ''}
    ${figures}
    <h3 class="sub">Scores by area</h3>
    ${areas}
    ${dist ? `<h3 class="sub">Issues by severity</h3>${dist}` : ''}
    ${cmp}
  </section>`;
}

// ------------------------------------------------------------------ 02 action plan
function actionPlan(a) {
  const an = a.analysis;
  const s = a.summary;
  if (!an.issues.length) return `<section class="chapter">${chapter(2, 'Action plan')}<p class="lede">No issues were found across the pages scanned. Re-run this audit after any major changes to the site.</p></section>`;
  return `<section class="chapter">${chapter(2, 'Action plan', 'Every issue found, ranked by severity and then by how many pages it affects. Effort is a rough guide for a typical small business site.')}
    <table class="t plan">
      <thead><tr><th class="r">#</th><th>Issue</th><th>Area</th><th>Severity</th><th>Effort</th><th class="r">Pages</th></tr></thead>
      <tbody>${an.issues.map((i, n) => {
        const pages = new Set(i.affected.map((x) => x.url).filter(Boolean)).size;
        return `<tr><td class="r num muted">${n + 1}</td><td>${esc(i.title)}</td><td class="nowrap">${CATEGORIES[i.category].label}</td><td>${sev(i.severity)}</td><td class="nowrap">${EFFORT[effortOf(i.id)]}</td><td class="r num">${pages || 'Site'}</td></tr>`;
      }).join('')}</tbody>
    </table>
    ${s?.quick_wins?.length ? `<div class="callout"><p class="label">Quick wins</p><p class="muted small" style="margin-bottom:6px">Small changes that can usually be made in under an hour each.</p><ul class="ticks">${s.quick_wins.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
  </section>`;
}

// ------------------------------------------------------------------ 03 findings
function issueCard(i, n) {
  const pages = i.affected.slice(0, 5);
  const more = i.count - pages.length;
  return `<article class="issue sev-${i.severity}">
    <div class="issue-head"><span class="issue-n">${n}</span><h4>${esc(i.title)}</h4>${sev(i.severity)}</div>
    <div class="issue-body">
      <div><p class="label">Why it matters</p><p>${esc(i.description)}</p></div>
      <div><p class="label">How to fix</p><p>${esc(i.fix)}</p></div>
    </div>
    ${pages.length ? `<div class="where"><p class="label">Where${i.count > 1 ? ` (${i.count})` : ''}</p><ul>${pages.map((x) => `<li><span class="p">${esc(trunc(pathOf(x.url), 60))}</span>${x.detail ? `<span class="d">${esc(trunc(x.detail, 150))}</span>` : ''}</li>`).join('')}</ul>${more > 0 ? `<p class="muted small">and ${more} more, listed in the locations spreadsheet</p>` : ''}</div>` : ''}
  </article>`;
}

function findings(a) {
  const an = a.analysis;
  if (!an.issues.length) return '';
  const rank = new Map(an.issues.map((i, n) => [i, n + 1]));
  return `<section class="chapter">${chapter(3, 'Detailed findings', 'Each issue with an explanation, the recommended fix and example pages. Numbers match the action plan.')}
    ${Object.entries(CATEGORIES).map(([k, c]) => {
      const list = an.issues.filter((i) => i.category === k);
      return `<div class="area"><h3 class="area-title"><span>${c.label}</span><span class="area-score t-${tone(an.scores[k])}">${an.scores[k]}<small>/100</small></span></h3>
        ${list.length ? list.map((i) => issueCard(i, rank.get(i))).join('') : '<p class="muted clear">No issues found in this area.</p>'}</div>`;
    }).join('')}
  </section>`;
}

// ------------------------------------------------------------------ 04 performance
const RANGES = { FCP: [1800, 3000], LCP: [2500, 4000], TBT: [200, 600], CLS: [0.1, 0.25], SI: [3400, 5800], TTI: [3800, 7300] };
const rangeText = (k, [g, p]) => (k === 'CLS' ? [`≤ ${g}`, `> ${p}`] : [`≤ ${fmtMs(g)}`, `> ${fmtMs(p)}`]);

function lighthouseTables(lh) {
  if (lh.error) return `<p class="notice">${esc(lh.error)}</p>`;
  const s = lh.scores;
  return `<div class="figures four">${[['performance', 'Performance'], ['accessibility', 'Accessibility'], ['bestPractices', 'Best practices'], ['seo', 'SEO']]
      .map(([k, l]) => `<div><span class="k">${l}</span><span class="v t-${tone(s[k])}">${s[k] ?? '–'}</span>${bar(s[k])}</div>`).join('')}</div>
    <table class="t">
      <thead><tr><th>Metric</th><th class="r">Result</th><th class="r">Good</th><th class="r">Poor</th><th>Rating</th></tr></thead>
      <tbody>${lh.metrics.map((m) => {
        const r = RANGES[m.short];
        const t = !r || m.value === null ? 'na' : m.value <= r[0] ? 'good' : m.value <= r[1] ? 'warn' : 'bad';
        const [g, p] = r ? rangeText(m.short, r) : ['', ''];
        return `<tr><td>${esc(m.name)} <span class="muted">(${m.short})</span></td><td class="r num t-${t}"><strong>${esc(m.display)}</strong></td><td class="r num muted">${g}</td><td class="r num muted">${p}</td><td>${{ good: 'Good', warn: 'Needs work', bad: 'Poor', na: '–' }[t]}</td></tr>`;
      }).join('')}</tbody>
    </table>
    ${lh.opportunities.length ? `<h3 class="sub">Biggest speed opportunities</h3><table class="t">
      <thead><tr><th>Opportunity</th><th class="r">Estimated saving</th></tr></thead>
      <tbody>${lh.opportunities.slice(0, 8).map((o) => `<tr><td><strong>${esc(o.title)}</strong><div class="muted small">${esc(trunc(o.description, 220))}</div></td><td class="r num nowrap">${o.savingsMs ? fmtMs(o.savingsMs) : ''}${o.savingsBytes ? `<div class="muted small">${fmtBytes(o.savingsBytes)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

function fieldTable(f) {
  if (!f) return '';
  if (!f.available) return `<h3 class="sub">Real-visitor experience</h3><p class="muted">${esc(f.error || f.reason)}</p>`;
  const R = { good: 'Good', 'needs-improvement': 'Needs work', poor: 'Poor' };
  const T = { good: 'good', 'needs-improvement': 'warn', poor: 'bad' };
  return `<h3 class="sub">Real-visitor experience <span class="muted small">Chrome UX Report · ${f.formFactor === 'DESKTOP' ? 'desktop' : 'mobile'} · ${f.scope === 'page' ? 'home page' : 'whole site'} · ${esc(f.period.from)} to ${esc(f.period.to)}</span></h3>
    <p class="small" style="margin-bottom:8px">${f.passesCoreWebVitals === true ? '<strong class="t-good">Passes</strong> Google\'s Core Web Vitals assessment for real visitors.' : f.passesCoreWebVitals === false ? '<strong class="t-bad">Fails</strong> Google\'s Core Web Vitals assessment for real visitors.' : ''} Values are the 75th percentile: three in four visits were at least this fast.</p>
    <table class="t">
      <thead><tr><th>Metric</th><th class="r">75th percentile</th><th>Rating</th><th>Share of visits (good / needs work / poor)</th></tr></thead>
      <tbody>${f.metrics.map((m) => `<tr><td>${esc(m.name)} <span class="muted">(${m.short})</span></td><td class="r num t-${T[m.rating]}"><strong>${esc(m.display)}</strong></td><td>${R[m.rating]}</td>
        <td><span class="split"><i style="flex:${m.distribution.good};background:var(--good)"></i><i style="flex:${m.distribution.needsImprovement};background:var(--warn)"></i><i style="flex:${m.distribution.poor};background:var(--bad)"></i></span>
        <span class="muted small num">${Math.round(m.distribution.good * 100)}% / ${Math.round(m.distribution.needsImprovement * 100)}% / ${Math.round(m.distribution.poor * 100)}%</span></td></tr>`).join('')}</tbody>
    </table>`;
}

function performanceChapter(a) {
  const pages = a.pages.filter((p) => !p.error && p.status < 400).sort((x, y) => (y.loadMs || 0) - (x.loadMs || 0)).slice(0, 12);
  return `<section class="chapter">${chapter(4, 'Performance', 'Lab results from Google Lighthouse on the home page, plus load times measured for each page crawled.')}
    ${Object.entries(a.lighthouse).map(([d, lh]) => `<h3 class="sub">Lighthouse · ${cap(d)}</h3>${lighthouseTables(lh)}`).join('')}
    ${fieldTable(a.fieldData)}
    ${pages.length > 1 ? `<h3 class="sub">Slowest pages</h3><table class="t">
      <thead><tr><th>Page</th><th class="r">Server response</th><th class="r">Fully loaded</th><th class="r">Weight</th><th class="r">Requests</th></tr></thead>
      <tbody>${pages.map((p) => `<tr><td>${esc(trunc(pathOf(p.finalUrl), 70))}</td><td class="r num">${fmtMs(p.timing?.ttfb)}</td><td class="r num">${fmtMs(p.loadMs)}</td><td class="r num">${fmtBytes(p.transferBytes)}</td><td class="r num">${p.requestCount ?? '–'}</td></tr>`).join('')}</tbody></table>` : ''}
  </section>`;
}

// ------------------------------------------------------------------ 05 technical checks
function technicalChapter(a) {
  const { ssl, https, headers, robots, sitemap } = a.site;
  const ok = (b, y = 'Yes', n = 'No') => (b ? `<span class="t-good">${y}</span>` : `<span class="t-bad">${n}</span>`);
  const schema = [...new Set(a.pages.flatMap((p) => p.jsonLd || []))];
  const home = a.pages.find((p) => !p.error && p.status < 400);
  const rows = [
    ['Served over HTTPS', ok(https.usesHttps)],
    ['HTTP redirects to HTTPS', ok(https.httpRedirectsToHttps)],
    ['SSL certificate', ssl.checked ? (ssl.valid ? `<span class="t-good">Valid</span> · expires ${ssl.validTo ? longDate(ssl.validTo) : ''} (${ssl.daysLeft} days)` : `<span class="t-bad">${esc(ssl.error || 'Invalid')}</span>`) : '<span class="t-bad">None</span>'],
    ...(ssl.valid ? [['Certificate issuer', esc(ssl.issuer)], ['TLS protocol', esc(ssl.protocol || 'Unknown')]] : []),
    ['Server version hidden', ok(!headers.disclosure?.length, 'Yes', `No (${esc((headers.disclosure || []).join(', '))})`)],
    ['Text compression', ok(headers.compression)],
  ];
  const seo = [
    ['robots.txt', robots.found ? (robots.blocksAll ? '<span class="t-bad">Blocks all crawlers</span>' : '<span class="t-good">Found, allows crawling</span>') : '<span class="t-warn">Not found</span>'],
    ['XML sitemap', sitemap.found ? `<span class="t-good">Found</span> · ${sitemap.urlCount} URLs · ${esc(sitemap.url)}` : '<span class="t-bad">Not found</span>'],
    ['Structured data', schema.length ? esc(schema.join(', ')) : '<span class="t-warn">None found</span>'],
    ['Language declared', home?.lang ? esc(home.lang) : '<span class="t-warn">No</span>'],
  ];
  return `<section class="chapter">${chapter(5, 'Technical checks', 'Site-wide security and search engine configuration.')}
    <div class="cols">
      <div><h3 class="sub">Security and HTTPS</h3><table class="t kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table></div>
      <div><h3 class="sub">Search engine setup</h3><table class="t kv">${seo.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
        ${home ? `<h3 class="sub">How the home page appears on Google</h3><div class="serp"><div class="site">${esc(new URL(home.finalUrl).host)}</div><div class="ttl">${esc(trunc(home.title || 'Untitled page', 62))}</div><div class="desc">${esc(trunc(home.metaDescription || 'No meta description. Google will pick text from the page instead.', 160))}</div></div>` : ''}
      </div>
    </div>
    ${headers.checked ? `<h3 class="sub">Security headers</h3><table class="t">
      <thead><tr><th>Header</th><th>Status</th><th>Purpose</th></tr></thead>
      <tbody>${headers.list.map((h) => `<tr><td class="nowrap"><strong>${esc(h.name)}</strong></td><td class="nowrap">${h.present ? '<span class="t-good">Present</span>' : '<span class="t-bad">Missing</span>'}</td><td class="muted small">${esc(h.why)}</td></tr>`).join('')}</tbody></table>` : ''}
  </section>`;
}

// ------------------------------------------------------------------ appendices
function pagesAppendix(a) {
  const counts = new Map();
  for (const i of a.analysis.issues) for (const u of new Set(i.affected.map((x) => x.url))) counts.set(u, (counts.get(u) || 0) + 1);
  return `<section class="chapter">${chapter('A', 'Pages scanned', `${plural(a.pages.length, 'page')} crawled in a real Chrome browser. Full detail is in the pages spreadsheet.`)}
    <table class="t dense">
      <thead><tr><th>Page</th><th class="r">Status</th><th>Title</th><th class="r">Words</th><th class="r">Load</th><th class="r">Weight</th><th class="r">WCAG</th><th class="r">Issues</th></tr></thead>
      <tbody>${a.pages.map((p) => `<tr><td>${esc(trunc(pathOf(p.finalUrl || p.url), 42))}</td><td class="r num ${p.status >= 400 || !p.status ? 't-bad' : ''}">${p.status || 'Error'}</td><td>${esc(trunc(p.title, 46)) || '<span class="t-bad">Missing</span>'}</td><td class="r num">${p.wordCount ?? '–'}</td><td class="r num">${fmtMs(p.loadMs)}</td><td class="r num">${fmtBytes(p.transferBytes)}</td><td class="r num ${p.axeViolations ? 't-bad' : ''}">${p.axeViolations ?? 0}</td><td class="r num">${counts.get(p.finalUrl) || 0}</td></tr>`).join('')}</tbody>
    </table>
  </section>`;
}

function methodAppendix(a) {
  return `<section class="chapter">${chapter('B', 'How this audit works')}
    <div class="cols">
      <div>
        <h3 class="sub">What was tested</h3>
        <ul class="plain">
          <li><strong>Performance</strong>: Google Lighthouse ${esc(Object.keys(a.lighthouse).join(' and '))} test of the home page, plus load time, page weight and image checks on every page.${a.fieldData?.available ? ' Real-visitor data from the Chrome UX Report.' : ''}</li>
          <li><strong>SEO</strong>: titles, descriptions, headings, canonicals, indexing, structured data, robots.txt and sitemap.</li>
          <li><strong>Accessibility</strong>: automated WCAG 2.2 AA tests (axe-core) on every page, and image alt text.</li>
          <li><strong>Security</strong>: HTTPS, SSL certificate, mixed content and HTTP security headers.</li>
          <li><strong>Links and content</strong>: every unique link checked once, plus broken files and JavaScript errors.</li>
        </ul>
        <h3 class="sub">How scores are calculated</h3>
        <p class="small">Each area starts at 100 and loses points for each issue according to its severity. Lighthouse results are blended in where they measure the same thing. The overall score is a weighted average:</p>
        <table class="t kv small">${Object.values(CATEGORIES).map((c) => `<tr><th>${c.label}</th><td class="num">${c.weight}%</td></tr>`).join('')}</table>
        <p class="small muted" style="margin-top:6px">Grades: A 90+, B 80–89, C 65–79, D 50–64, F below 50.</p>
      </div>
      <div>
        <h3 class="sub">Severity levels</h3>
        <table class="t kv">${SEVS.map((x) => `<tr><th>${sev(x)}</th><td class="small">${SEV_MEANING[x]}</td></tr>`).join('')}</table>
        <h3 class="sub">Limitations</h3>
        <ul class="plain small">
          <li>Lighthouse scores vary by a few points between runs because network and server conditions change.</li>
          <li>Automated tools find roughly a third of accessibility problems. Manual keyboard and screen reader testing is still needed for compliance.</li>
          <li>Social networks block automated checks, so their links are listed as "could not verify" rather than broken.</li>
          <li>The crawl covered ${plural(a.pages.length, 'page')}${a.options?.maxPages ? ` (limit ${a.options.maxPages})` : ''}. Pages behind logins or forms were not tested.</li>
        </ul>
      </div>
    </div>
  </section>`;
}

// ------------------------------------------------------------------ document
export function pdfReportHtml(audit, shots = {}) {
  const host = new URL(audit.finalUrl).host;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Website health report: ${esc(host)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Geist:wght@400;500;600;700&display=swap">
<style>${CSS}</style></head><body>
${cover(audit, shots)}
${summaryChapter(audit)}
${actionPlan(audit)}
${findings(audit)}
${performanceChapter(audit)}
${technicalChapter(audit)}
${pagesAppendix(audit)}
${methodAppendix(audit)}
</body></html>`;
}

export const pdfFooter = (audit) => `<div style="width:100%;padding:0 16mm;font:7.5px Helvetica,Arial,sans-serif;color:#8f8b80;display:flex;justify-content:space-between;">
  <span>${esc(new URL(audit.finalUrl).host)} · Website health report · ${longDate(audit.createdAt)}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

const CSS = `
:root{--paper:#f6f5f1;--sunk:#efede7;--line:#e3e0d8;--line-strong:#cfcbc0;--ink:#1b1a17;--ink-2:#4d4a43;--ink-3:#67635a;--accent:#23634c;
--good:#276d49;--warn:#8a5e0f;--bad:#b23f2c;--sev-critical:#9e2a20;--sev-high:#c0562a;--sev-medium:#b38518;--sev-low:#8f8b80;
--serif:"Newsreader",Georgia,serif;--sans:"Geist","Segoe UI",Helvetica,Arial,sans-serif}
@page{size:A4;margin:18mm 16mm 18mm}
@page cover{margin:0}

*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink);font:400 9.5pt/1.5 var(--sans);-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3,h4,p{margin:0}
ul{margin:0}
.num{font-variant-numeric:tabular-nums}.muted{color:var(--ink-3)}.small{font-size:8.5pt}.nowrap{white-space:nowrap}.r{text-align:right}
.t-good{color:var(--good)}.t-warn{color:var(--warn)}.t-bad{color:var(--bad)}.t-na{color:var(--ink-3)}
.label{font-size:7.5pt;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:3px}

/* cover */
.cover{page:cover;width:210mm;height:297mm;padding:20mm 20mm 16mm;background:var(--paper);display:flex;flex-direction:column;break-after:page;overflow:hidden}
.cover-top{display:flex;justify-content:space-between;align-items:center;font-size:8.5pt;color:var(--ink-3);padding-bottom:5mm;border-bottom:1px solid var(--ink)}
.brand{display:flex;align-items:center;gap:8px;color:var(--ink);font-weight:600;font-size:9.5pt}
.mark{width:20px;height:20px;border-radius:4px;background:var(--ink);color:var(--paper);display:grid;place-items:center}
.cover-title{margin-top:22mm}
.eyebrow{font-size:9pt;color:var(--ink-3);font-weight:500}
.cover h1{font-family:var(--serif);font-weight:500;font-size:40pt;line-height:1.02;letter-spacing:-.03em;margin:3mm 0 3mm;word-break:break-word}
.cover-url{font-size:9.5pt;color:var(--ink-2);word-break:break-all}
.cover-date{font-size:9.5pt;color:var(--ink-3);margin-top:1mm}
.cover-score{display:grid;grid-template-columns:62mm 1fr;gap:12mm;align-items:end;margin-top:16mm;padding-top:7mm;border-top:1px solid var(--line-strong)}
.big-num{font-family:var(--serif);font-size:84pt;line-height:.85;letter-spacing:-.045em}
.big-num span{font-size:15pt;letter-spacing:0;color:var(--ink-3);margin-left:3px}
.big-line{display:flex;align-items:center;gap:8px;margin-top:4mm;font-size:10pt;color:var(--ink-2)}
.grade{display:inline-grid;place-items:center;width:22px;height:22px;border:1.5px solid currentColor;border-radius:4px;font-family:var(--serif);font-weight:600;font-size:13pt;line-height:1}
.cover-areas{width:100%;border-collapse:collapse}
.cover-areas th{text-align:left;font-weight:500;font-size:9pt;padding:2.2mm 0;width:34mm;border-bottom:1px solid var(--line)}
.cover-areas td{padding:2.2mm 0;border-bottom:1px solid var(--line)}
.cover-areas td.w{padding-right:4mm}
.cover-areas td.n{width:10mm;text-align:right;font-family:var(--serif);font-size:14pt;font-variant-numeric:tabular-nums}
.bar{display:block;height:3px;background:var(--line);border-radius:2px;overflow:hidden}.bar i{display:block;height:100%;background:currentColor}
.cover-shots{margin-top:auto;display:flex;align-items:flex-end;gap:7mm;padding-top:10mm}
.cover-shots figure{margin:0}.cover-shots img{display:block;width:100%;border:1px solid var(--line-strong);border-radius:3px;object-fit:cover;object-position:top}
.cover-shots figcaption{font-size:7.5pt;color:var(--ink-3);margin-top:1.5mm}
.shot-d{width:128mm}.shot-d img{height:76mm}.shot-m{width:36mm}.shot-m img{height:76mm;border-radius:6px}
.cover-foot{display:flex;gap:7mm;margin-top:8mm;padding-top:4mm;border-top:1px solid var(--line-strong);font-size:8pt;color:var(--ink-3)}

/* chapters */
.chapter{break-before:page}
.ch{display:grid;grid-template-columns:14mm 1fr;align-items:baseline;padding-bottom:4mm;margin-bottom:6mm;border-bottom:1px solid var(--ink)}
.ch-n{font-family:var(--serif);font-size:13pt;color:var(--ink-3)}
.ch h2{font-family:var(--serif);font-weight:500;font-size:22pt;letter-spacing:-.02em;line-height:1.1}
.ch-intro{grid-column:2;margin-top:2mm;color:var(--ink-2);max-width:150mm}
.sub{font-family:var(--serif);font-weight:500;font-size:13pt;letter-spacing:-.01em;margin:8mm 0 3mm;break-after:avoid}
.sub .small{font-family:var(--sans);font-size:7.5pt;letter-spacing:0;margin-left:4px}
.lede{font-family:var(--serif);font-size:13pt;line-height:1.5;max-width:165mm;margin-bottom:7mm}
.figures{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--ink);margin-bottom:2mm}
.figures>div{padding:3mm 4mm 3.5mm 0;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:1px}
.figures>div+div{padding-left:4mm;border-left:1px solid var(--line)}
.figures .k{font-size:8pt;color:var(--ink-3)}
.figures .v{font-family:var(--serif);font-size:22pt;line-height:1.1;font-variant-numeric:tabular-nums}
.figures .v small{font-family:var(--sans);font-size:9pt;color:var(--ink-3);margin-left:2px}
.figures .s{font-size:8pt;color:var(--ink-3)}
.figures .bar{margin-top:2mm}
.figures.four{margin-bottom:5mm}

/* tables */
.t{width:100%;border-collapse:collapse;font-size:8.8pt}
.t th{text-align:left;font-weight:600;font-size:7.5pt;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3);padding:2mm 2.5mm;border-bottom:1px solid var(--line-strong)}
.t td{padding:2mm 2.5mm;border-bottom:1px solid var(--line);vertical-align:top}
.t th:first-child,.t td:first-child{padding-left:0}.t th:last-child,.t td:last-child{padding-right:0}
.t tr{break-inside:avoid}
thead{display:table-header-group}
.t.dense td{padding:1.4mm 2mm;font-size:8pt}
.t.kv th{text-transform:none;letter-spacing:0;font-size:8.8pt;font-weight:500;color:var(--ink);width:42%;border-bottom:1px solid var(--line);vertical-align:top}
.areas td.muted{font-size:8.3pt}
.plan td:nth-child(2){font-weight:500}

.sev{display:inline-flex;align-items:center;gap:5px;font-size:8pt;font-weight:600;color:var(--ink-2);white-space:nowrap}
.sev i{width:7px;height:7px;border-radius:2px;background:var(--c)}
.sev-critical{--c:var(--sev-critical)}.sev-high{--c:var(--sev-high)}.sev-medium{--c:var(--sev-medium)}.sev-low{--c:var(--sev-low)}
.dist-bar{display:flex;gap:2px;height:8px}.dist-bar span{border-radius:2px;min-width:4px}
.dist-key{display:flex;gap:7mm;margin-top:3mm;font-size:9pt}
.deltas{display:flex;flex-wrap:wrap;gap:2mm 6mm;font-size:9pt;margin-bottom:4mm}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:9mm}
.cols .sub:first-child{margin-top:0}
ul.plain{padding-left:4mm}ul.plain li{margin:1mm 0}
.callout{margin-top:8mm;padding:4mm 5mm;background:var(--paper);border-left:2px solid var(--accent);break-inside:avoid}
ul.ticks{list-style:none;padding:0}ul.ticks li{position:relative;padding-left:5mm;margin:1.5mm 0}
ul.ticks li::before{content:"";position:absolute;left:0;top:1.6mm;width:6px;height:3px;border-left:1.5px solid var(--accent);border-bottom:1.5px solid var(--accent);transform:rotate(-45deg)}
.notice{border-left:2px solid var(--warn);padding:1mm 0 1mm 3mm;color:var(--ink-2)}
.split{display:inline-flex;width:30mm;height:5px;gap:1px;vertical-align:middle;margin-right:2mm}.split i{display:block;border-radius:1px}

/* findings */
.area{margin-bottom:4mm}
.area-title{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--serif);font-weight:500;font-size:14pt;margin:7mm 0 2mm;padding-bottom:2mm;border-bottom:1px solid var(--line-strong);break-after:avoid}
.area:first-of-type .area-title{margin-top:0}
.area-score{font-size:14pt;font-variant-numeric:tabular-nums}.area-score small{font-family:var(--sans);font-size:8pt;color:var(--ink-3)}
.clear{padding:2mm 0}
.issue{padding:3.5mm 0 3.5mm 4mm;border-left:2px solid var(--c);border-bottom:1px solid var(--line);break-inside:avoid;margin-top:3mm}
.issue-head{display:grid;grid-template-columns:7mm 1fr auto;gap:2mm;align-items:baseline}
.issue-n{font-family:var(--serif);color:var(--ink-3);font-size:10pt}
.issue h4{font-size:10pt;font-weight:600}
.issue-body{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin:2mm 0 0 7mm;color:var(--ink-2)}
.where{margin:3mm 0 0 7mm}
.where ul{list-style:none;padding:0;font-size:8pt}
.where li{display:grid;grid-template-columns:64mm 1fr;gap:3mm;padding:1mm 0;border-top:1px dotted var(--line-strong)}
.where .p{font-weight:500;overflow-wrap:anywhere}.where .d{color:var(--ink-3);word-break:break-word}
.serp{padding:3.5mm 4mm;border:1px solid var(--line);border-radius:4px;font-family:Arial,sans-serif}
.serp .site{font-size:8pt;color:#4d5156}.serp .ttl{font-size:11.5pt;color:#1a0dab;margin:1mm 0}.serp .desc{font-size:8.5pt;color:#4d5156;line-height:1.45}
`;

/** Renders the report to a PDF buffer: the cover without a footer, every other page numbered. */
export async function renderPdf(browser, audit, shots) {
  const { PDFDocument } = await import('pdf-lib');
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(pdfReportHtml(audit, shots), { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    // Web fonts must finish loading or the PDF falls back to system fonts.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    const base = { format: 'A4', printBackground: true, preferCSSPageSize: true };
    const coverPdf = await page.pdf({ ...base, pageRanges: '1' });
    const bodyPdf = await page.pdf({ ...base, pageRanges: '2-', displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: pdfFooter(audit) });
    const out = await PDFDocument.create();
    for (const bytes of [coverPdf, bodyPdf]) {
      const doc = await PDFDocument.load(bytes);
      (await out.copyPages(doc, doc.getPageIndices())).forEach((p) => out.addPage(p));
    }
    out.setTitle(`Website health report: ${new URL(audit.finalUrl).host}`);
    out.setAuthor(reportBrand());
    out.setSubject('Performance, SEO, accessibility, security and links audit');
    out.setCreationDate(new Date(audit.createdAt));
    return Buffer.from(await out.save());
  } finally {
    await context.close().catch(() => {});
  }
}
