/* Report renderer — shared by the web app and the exported HTML/PDF reports. Plain script, no build step. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tone = (s) => (s === null || s === undefined ? 'na' : s >= 90 ? 'good' : s >= 50 ? 'warn' : 'bad');
  const gradeTone = (g) => ({ A: 'good', B: 'good', C: 'warn', D: 'warn', F: 'bad' }[g] || 'na');
  const fmtBytes = (b) => (!b ? '–' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const fmtMs = (ms) => (ms === null || ms === undefined || isNaN(ms) ? '–' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
  const fmtDate = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const path = (u) => { try { const x = new URL(u); return (x.pathname + x.search) || '/'; } catch { return u; } };
  const plural = (n, w) => `${n} ${n === 1 ? w : /(s|x|ch|sh)$/.test(w) ? `${w}es` : `${w}s`}`;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  const CATS = { performance: 'Performance', seo: 'SEO', accessibility: 'Accessibility', security: 'Security', links: 'Links & content' };
  const SEVS = ['critical', 'high', 'medium', 'low'];

  const ICONS = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 4v10M12 19.5v.5"/></svg>',
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  };

  const meter = (score) => `<span class="meter t-${tone(score)}"><i style="--v:${(score ?? 0) / 100}"></i></span>`;
  const sevLabel = (sev) => `<span class="sev sev-${sev}"><i></i>${cap(sev)}</span>`;
  const delta = (d) => (d > 0 ? `<span class="delta up">+${d}</span>` : d < 0 ? `<span class="delta down">−${Math.abs(d)}</span>` : '<span class="delta same">±0</span>');
  const ruleTitle = (title, aside = '') => `<div class="rule-title"><h2>${title}</h2>${aside ? `<span class="aside">${aside}</span>` : ''}</div>`;

  const checklist = (items, cls = '') => `<ul class="checklist ${cls}">${items.map((it) =>
    `<li><span class="ico ${it.state}" role="img" aria-label="${it.state === 'y' ? 'Pass' : it.state === 'n' ? 'Fail' : 'Warning'}">${it.state === 'y' ? ICONS.check : it.state === 'n' ? ICONS.x : ICONS.warn}</span><div><div class="t">${it.title}</div>${it.sub ? `<div class="s">${it.sub}</div>` : ''}</div></li>`).join('')}</ul>`;

  // ---------------------------------------------------------------- issues
  function issueItem(i) {
    const rows = i.affected.map((a) => `<tr><td class="nowrap"><a href="${esc(a.url)}" target="_blank" rel="noopener" title="${esc(a.url)}">${esc(path(a.url))}</a></td><td class="break">${linkify(a.detail)}</td></tr>`).join('');
    const more = i.count > i.affected.length ? `<p class="muted small" style="margin-top:8px">and ${i.count - i.affected.length} more not shown</p>` : '';
    return `<details class="issue" data-sev="${i.severity}" data-cat="${i.category}" data-text="${esc((i.title + ' ' + i.description).toLowerCase())}">
      <summary>${sevLabel(i.severity)}<span class="title">${esc(i.title)}</span><span class="cat">${CATS[i.category]}</span><span class="count">${i.count > 1 ? `${i.count}×` : ''}</span><span class="chev">${ICONS.chev}</span></summary>
      <div class="body">
        <div><h4>Why it matters</h4><p>${linkify(i.description)}</p></div>
        <div><h4>How to fix</h4><p class="fix">${linkify(i.fix)}</p></div>
        ${rows ? `<div class="where"><h4>Where</h4><div class="affected"><table class="t"><thead><tr><th>Page</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>${more}</div>` : ''}
      </div></details>`;
  }

  const issueList = (issues, empty = 'No issues found in this area.') =>
    issues.length ? `<div class="issue-list">${issues.map(issueItem).join('')}</div>` : `<p class="empty">${empty}</p>`;

  // ---------------------------------------------------------------- header
  const EXPORTS = {
    client: [
      ['export.pdf', 'PDF report', 'Cover, summary, action plan, findings and appendix'],
      ['export.html', 'Interactive HTML', 'The full report as one self-contained file'],
    ],
    data: [
      ['issues.csv', 'Issues', 'One row per issue, in priority order, with fixes'],
      ['locations.csv', 'Issue locations', 'Every page and element each issue affects'],
      ['pages.csv', 'Pages', 'SEO, speed and accessibility metrics per page'],
      ['links.csv', 'Links', 'Broken, redirected and unverified links, and where they are'],
    ],
  };
  function header(a, opts) {
    const an = a.analysis;
    const cmp = a.comparison;
    const word = an.overall >= 90 ? 'Excellent' : an.overall >= 75 ? 'Good' : an.overall >= 50 ? 'Needs work' : 'Poor';
    return `<header class="report-head"><div class="container"><div class="top">
      <div class="score-hero">
        <div class="num" role="img" aria-label="Overall score ${an.overall} out of 100">${an.overall}<span>/100</span></div>
        <div class="line"><span class="grade t-${gradeTone(an.grade)}" role="img" aria-label="Grade ${an.grade}">${an.grade}</span>${word} overall${cmp ? ` · ${delta(cmp.overallDelta)} since ${new Date(cmp.previousDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</div>
      </div>
      <div class="info">
        <p class="kicker">Website audit</p>
        <h1 class="host">${esc(new URL(a.finalUrl).host)}</h1>
        <a class="url" href="${esc(a.finalUrl)}" target="_blank" rel="noopener">${esc(a.finalUrl)}</a>
        <div class="facts">
          <span>${fmtDate(a.createdAt)}</span>
          <span>${plural(a.pages.length, 'page')}</span>
          <span>${plural(a.linksChecked, 'link')} checked</span>
          <span>Lighthouse ${esc(Object.keys(a.lighthouse).join(' & '))}</span>
          <span>${Math.round(a.durationMs / 1000)}s</span>
        </div>
      </div>
      ${opts.standalone ? '' : `<div class="actions">
        <details class="menu">
          <summary class="btn">Export<svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></summary>
          <div class="menu-list">
            <p class="menu-group">For the client</p>
            ${EXPORTS.client.map(([file, t, d]) => `<a href="/api/audits/${a.id}/${file}" data-download><span class="m-t">${t}</span><span class="m-d">${d}</span></a>`).join('')}
            <p class="menu-group">Spreadsheets (CSV)</p>
            ${EXPORTS.data.map(([file, t, d]) => `<a href="/api/audits/${a.id}/${file}" data-download><span class="m-t">${t}</span><span class="m-d">${d}</span></a>`).join('')}
          </div>
        </details>
        <button class="btn btn-primary" data-action="rerun">Run again</button>
        <button class="btn btn-text danger" data-action="delete">Delete</button>
      </div>`}
    </div></div></header>`;
  }

  // ---------------------------------------------------------------- overview
  function verdict(an, pages) {
    const c = an.counts;
    const lead = c.critical ? `${plural(c.critical, 'critical problem')} ${c.critical === 1 ? 'needs' : 'need'} fixing straight away.`
      : c.high ? `No critical problems, but ${plural(c.high, 'high-priority fix')} ${c.high === 1 ? 'is' : 'are'} worth scheduling.`
      : c.medium ? `In good shape. ${plural(c.medium, 'medium issue')} left to tidy up.`
      : c.low ? 'In very good shape. Only minor refinements remain.'
      : 'No issues found across the pages scanned.';
    return `<p class="verdict">${lead}</p><p>${plural(an.issues.length, 'issue')} across ${plural(pages, 'page')} · ${an.passed.length} checks passed</p>`;
  }

  function overview(a) {
    const an = a.analysis;
    const byCat = (c) => an.issues.filter((i) => i.category === c).length;
    const total = an.issues.length || 1;

    const scores = `<p class="kicker" style="margin-bottom:10px">Scores by area</p><ul class="scorelist">${Object.entries(CATS).map(([k, label]) =>
      `<li><button class="scorerow" data-goto="issues" data-cat-filter="${k}" aria-label="${label}: ${an.scores[k]} out of 100. View issues">
        <span class="name">${label}</span>${meter(an.scores[k])}<span class="val">${an.scores[k]}</span><span class="sub">${byCat(k) ? plural(byCat(k), 'issue') : 'Clear'}</span>
      </button></li>`).join('')}</ul>`;

    const dist = `<div class="dist">${verdict(an, a.pages.length)}
      ${an.issues.length ? `<div class="bar" role="img" aria-label="Issue distribution by severity">${SEVS.filter((s) => an.counts[s]).map((s) => `<span class="sev-${s}" style="flex:${an.counts[s] / total};--c:var(--sev-${s})"></span>`).join('')}</div>` : ''}
      <dl>${SEVS.map((s) => `<div><dt>${sevLabel(s)}</dt><dd>${an.counts[s]}</dd></div>`).join('')}</dl>
    </div>`;

    // Optional Claude summary if one was generated; otherwise the free built-in summary.
    const useAi = a.ai && !a.ai.error;
    const s = useAi ? a.ai : a.summary;
    let ai = '';
    if (s) {
      ai = `${ruleTitle('Summary', useAi ? `Written by ${esc(a.ai.model || 'Claude')}` : 'Written from the audit results')}
        ${a.ai?.error ? `<p class="notice" style="margin-bottom:16px">${esc(a.ai.error)} Showing the built-in summary instead.</p>` : ''}
        <div class="ai">
          <div>
            <p class="summary">${esc(s.executive_summary)}</p>
            ${useAi ? `<div style="margin-top:20px">${s.top_priorities.map((p, n) => `<div class="priority"><span class="n">${n + 1}</span><div>
              <h4>${esc(p.title)}</h4><p>${esc(p.why_it_matters)}</p><p style="margin-top:6px"><strong>Fix:</strong> ${esc(p.how_to_fix)}</p>
              <p class="meta">Impact ${esc(p.impact)} · Effort ${esc(p.effort)}</p></div></div>`).join('')}</div>` : ''}
            <p class="kicker" style="margin:26px 0 4px">Quick wins</p>
            ${s.quick_wins.length ? checklist(s.quick_wins.map((q) => ({ state: 'y', title: esc(q) }))) : '<p class="empty" style="padding-top:6px">No quick fixes outstanding.</p>'}
          </div>
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 8px"><p class="kicker">Draft email to the client</p><button class="btn btn-text" data-copy="#ai-email">Copy</button></div>
            <div class="email-box" id="ai-email" tabindex="0" role="region" aria-label="Draft email to the client">${esc(s.client_email)}</div>
          </div>
        </div>`;
    }

    let cmp = '';
    if (a.comparison) {
      const c = a.comparison;
      cmp = `${ruleTitle('Since the last audit', fmtDate(c.previousDate))}
        <div class="compare-scores"><span><strong>Overall</strong> ${delta(c.overallDelta)}</span>${Object.entries(c.scoreDeltas).map(([k, d]) => `<span>${CATS[k]} ${delta(d)}</span>`).join('')}</div>
        <div class="compare">
          <div><strong>${plural(c.fixed.length, 'issue')} resolved</strong>${c.fixed.length ? `<ul>${c.fixed.slice(0, 12).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>
          <div><strong>${plural(c.newIssues.length, 'new issue')}</strong>${c.newIssues.length ? `<ul>${c.newIssues.slice(0, 12).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>
        </div>`;
    }

    const top = an.issues.slice(0, 6);
    const limits = a.limits?.length ? `<p class="notice" style="margin-top:28px">Shortened to fit the server time limit: ${a.limits.map(esc).join(' ')}</p>` : '';
    return `<h2 class="panel-title">Overview</h2>${limits}
      <div class="ov-grid"><div>${scores}</div>${dist}</div>
      ${ai}${cmp}
      ${ruleTitle('Top priorities', an.issues.length > top.length ? `<button class="btn btn-text" data-goto="issues">All ${an.issues.length} issues →</button>` : '')}
      ${issueList(top, 'No issues found across the pages scanned.')}
      ${ruleTitle("What's already working", `${an.passed.length} checks`)}
      ${checklist(an.passed.map((p) => ({ state: 'y', title: esc(p.title), sub: CATS[p.category] })), 'passed')}`;
  }

  function issuesPanel(a) {
    const an = a.analysis;
    return `<h2 class="panel-title">All issues</h2>
      <div class="toolbar">
        <input class="search" type="search" placeholder="Search issues" data-filter="search" aria-label="Search issues">
        <div class="filter-links" data-filter="sev" role="group" aria-label="Filter by severity">
          <button class="on" data-v="">All<span class="n">${an.issues.length}</span></button>
          ${SEVS.map((s) => `<button data-v="${s}">${cap(s)}<span class="n">${an.counts[s]}</span></button>`).join('')}
        </div>
        <select class="select" data-filter="cat" aria-label="Filter by area"><option value="">All areas</option>${Object.entries(CATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <span class="filter-count" data-filter-count aria-live="polite"></span>
      </div>
      ${issueList(an.issues, 'No issues found.')}`;
  }

  // ---------------------------------------------------------------- performance
  const METRIC_RANGES = { FCP: [1800, 3000], LCP: [2500, 4000], TBT: [200, 600], CLS: [0.1, 0.25], SI: [3400, 5800], TTI: [3800, 7300] };
  function metricCell(m) {
    const [good, poor] = METRIC_RANGES[m.short] || [1, 2];
    const v = m.value ?? 0;
    const pos = v <= good ? (v / good) * 33 : v <= poor ? 33 + ((v - good) / (poor - good)) * 33 : 66 + Math.min(1, (v - poor) / poor) * 33;
    const t = m.value === null ? 'na' : v <= good ? 'good' : v <= poor ? 'warn' : 'bad';
    return `<div><div class="k"><span>${esc(m.name)}</span><span>${m.short}</span></div><div class="v t-${t}">${esc(m.display)}</div>
      <div class="cwv-track" aria-hidden="true"><span></span><span></span><span></span><i style="left:calc(${Math.min(99, pos)}% - 1px)"></i></div></div>`;
  }

  function lighthouseBlock(lh) {
    if (!lh) return '';
    if (lh.error) return `<p class="notice">${esc(lh.error)}</p>`;
    const s = lh.scores;
    return `<div class="stats" style="--cols:4">${[['performance', 'Performance'], ['accessibility', 'Accessibility'], ['bestPractices', 'Best practices'], ['seo', 'SEO']]
        .map(([k, l]) => `<div><div class="k">${l}</div><div class="v t-${tone(s[k])}">${s[k] ?? '–'}</div>${meter(s[k])}</div>`).join('')}</div>
      ${ruleTitle('Core Web Vitals and speed')}
      <div class="stats" style="--cols:3">${lh.metrics.map(metricCell).join('')}</div>
      ${lh.opportunities.length ? `${ruleTitle('Where the time goes', 'Estimated savings')}
      <div class="panel table-wrap"><table class="t"><thead><tr><th>Opportunity</th><th style="text-align:right">Saving</th></tr></thead><tbody>
        ${lh.opportunities.map((o) => `<tr><td><strong style="font-weight:500">${esc(o.title)}</strong><div class="muted small" style="max-width:80ch">${esc(o.description)}</div></td><td class="num nowrap" style="text-align:right">${o.savingsMs ? fmtMs(o.savingsMs) : ''}${o.savingsBytes ? `<div class="muted small">${fmtBytes(o.savingsBytes)}</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
  }

  function fieldBlock(f) {
    if (!f) return '';
    if (!f.available) return `${ruleTitle('Real-visitor experience', 'Chrome UX Report')}<p class="muted small">${esc(f.error || f.reason)}</p>`;
    const T = { good: 'good', 'needs-improvement': 'warn', poor: 'bad' };
    const pct = (x) => Math.round(x * 100);
    return `${ruleTitle('Real-visitor experience', `Chrome UX Report · ${f.scope === 'page' ? 'home page' : 'whole site'} · ${esc(f.period.from)} to ${esc(f.period.to)}`)}
      ${f.passesCoreWebVitals !== null ? `<p class="small" style="margin-bottom:14px">${f.passesCoreWebVitals ? '<strong class="t-good">Passes</strong>' : '<strong class="t-bad">Fails</strong>'} Google's Core Web Vitals assessment for real ${f.formFactor === 'DESKTOP' ? 'desktop' : 'mobile'} visitors. Values are the 75th percentile of visits over 28 days.</p>` : ''}
      <div class="stats" style="--cols:${Math.min(5, f.metrics.length)}">${f.metrics.map((m) => `<div><div class="k"><span>${esc(m.name)}</span><span>${m.short}</span></div><div class="v t-${T[m.rating]}">${esc(m.display)}</div>
        <div class="dist-mini" role="img" aria-label="${pct(m.distribution.good)}% good, ${pct(m.distribution.needsImprovement)}% needs improvement, ${pct(m.distribution.poor)}% poor"><span style="flex:${m.distribution.good};background:var(--good)"></span><span style="flex:${m.distribution.needsImprovement};background:var(--warn)"></span><span style="flex:${m.distribution.poor};background:var(--bad)"></span></div>
        <div class="k" style="margin-top:6px">${pct(m.distribution.good)}% of visits good</div></div>`).join('')}</div>`;
  }

  function performancePanel(a) {
    const devices = Object.keys(a.lighthouse);
    const first = devices[0];
    const pages = a.pages.filter((p) => !p.error && p.status < 400);
    const t = (v, warn, bad) => (v > bad ? 't-bad' : v > warn ? 't-warn' : '');
    return `<h2 class="panel-title">Performance</h2>
      ${ruleTitle('Google Lighthouse · home page', devices.length > 1 ? `<span class="seg device-switch" data-device-switch role="group" aria-label="Device">${devices.map((d) => `<button class="${d === first ? 'on' : ''}" data-v="${d}">${cap(d)}</button>`).join('')}</span>` : cap(first))}
      ${devices.map((d) => `<div data-device="${d}"${d !== first ? ' hidden' : ''}>${lighthouseBlock(a.lighthouse[d])}</div>`).join('')}
      ${fieldBlock(a.fieldData)}
      ${ruleTitle('Load times by page', 'Desktop browser')}
      <div class="panel table-wrap"><table class="t"><thead><tr><th>Page</th><th>Server response</th><th>Fully loaded</th><th>Weight</th><th>Requests</th></tr></thead><tbody>
        ${pages.map((p) => `<tr><td><a class="truncate" href="${esc(p.finalUrl)}" target="_blank" rel="noopener" title="${esc(p.finalUrl)}">${esc(path(p.finalUrl))}</a></td>
          <td class="num ${t(p.timing?.ttfb, 400, 800)}">${fmtMs(p.timing?.ttfb)}</td>
          <td class="num ${t(p.loadMs, 3000, 5000)}">${fmtMs(p.loadMs)}</td>
          <td class="num ${t(p.transferBytes, 1572864, 3145728)}">${fmtBytes(p.transferBytes)}</td>
          <td class="num">${p.requestCount ?? '–'}</td></tr>`).join('')}
      </tbody></table></div>
      ${ruleTitle('Performance issues')}
      ${issueList(a.analysis.issues.filter((i) => i.category === 'performance'))}`;
  }

  // ---------------------------------------------------------------- seo
  function seoPanel(a) {
    const s = a.site;
    const pages = a.pages.filter((p) => !p.error && p.status < 400);
    const schema = [...new Set(pages.flatMap((p) => p.jsonLd || []))];
    const items = [
      { state: s.robots.found ? (s.robots.blocksAll ? 'n' : 'y') : 'w', title: 'robots.txt', sub: s.robots.found ? (s.robots.blocksAll ? 'Blocks all crawlers' : 'Found and allows crawling') : 'Not found' },
      { state: s.sitemap.found ? 'y' : 'n', title: 'XML sitemap', sub: s.sitemap.found ? `${esc(s.sitemap.url)} · ${s.sitemap.urlCount} URLs` : 'Not found at the usual locations' },
      { state: schema.length ? 'y' : 'w', title: 'Structured data', sub: schema.length ? esc(schema.join(', ')) : 'None found' },
      { state: s.https.usesHttps ? 'y' : 'n', title: 'HTTPS', sub: s.https.usesHttps ? 'Served securely' : 'Not secure' },
    ];
    const len = (n, lo, hi) => (!n ? 't-bad' : n < lo || n > hi ? 't-warn' : '');
    const home = pages[0];
    return `<h2 class="panel-title">SEO</h2>
      <div class="two-col">
        <div>${ruleTitle('Site-wide checks')}${checklist(items)}</div>
        <div>${ruleTitle('Search result preview', 'Home page')}
          ${home ? `<div class="serp"><div class="site">${esc(new URL(home.finalUrl).host)} › ${esc(path(home.finalUrl))}</div>
            <div class="title">${esc((home.title || 'Untitled page').slice(0, 62))}${(home.title || '').length > 62 ? '…' : ''}</div>
            <div class="desc">${esc((home.metaDescription || 'No meta description. Google will choose text from the page instead.').slice(0, 160))}${(home.metaDescription || '').length > 160 ? '…' : ''}</div></div>` : ''}
        </div>
      </div>
      ${ruleTitle('On-page SEO by page')}
      <div class="panel table-wrap"><table class="t"><thead><tr><th>Page</th><th>Title</th><th>Chars</th><th>Description</th><th>H1</th><th>Words</th><th>Canonical</th><th>Indexable</th></tr></thead><tbody>
        ${pages.map((p) => `<tr><td><a class="truncate" style="max-width:200px" href="${esc(p.finalUrl)}" target="_blank" rel="noopener" title="${esc(p.finalUrl)}">${esc(path(p.finalUrl))}</a></td>
          <td><span class="truncate" style="max-width:260px" title="${esc(p.title)}">${esc(p.title || '—')}</span></td>
          <td class="num ${len(p.title?.length, 20, 60)}">${p.title?.length || 0}</td>
          <td class="num ${len(p.metaDescription?.length, 70, 160)}">${p.metaDescription?.length ? `${p.metaDescription.length} chars` : 'Missing'}</td>
          <td class="num ${p.h1.length === 1 ? '' : 't-bad'}">${p.h1.length}</td>
          <td class="num ${p.wordCount < 250 ? 't-warn' : ''}">${p.wordCount ?? '–'}</td>
          <td>${p.canonical ? 'Yes' : '<span class="t-warn">No</span>'}</td>
          <td>${/noindex/i.test(p.metaRobots) ? '<span class="t-bad">noindex</span>' : 'Yes'}</td></tr>`).join('')}
      </tbody></table></div>
      ${ruleTitle('SEO issues')}
      ${issueList(a.analysis.issues.filter((i) => i.category === 'seo'))}`;
  }

  // ---------------------------------------------------------------- accessibility / links
  function accessibilityPanel(a) {
    const lh = a.lighthouse.mobile?.scores?.accessibility ?? a.lighthouse.desktop?.scores?.accessibility;
    const issues = a.analysis.issues.filter((i) => i.category === 'accessibility');
    const missingAlt = a.pages.reduce((s, p) => s + (p.imagesMissingAlt || 0), 0);
    const imgs = a.pages.reduce((s, p) => s + (p.imageCount || 0), 0);
    return `<h2 class="panel-title">Accessibility</h2>
      <div class="stats" style="--cols:3;margin-top:32px">
        <div><div class="k">Lighthouse accessibility</div><div class="v t-${tone(lh)}">${lh ?? '–'}<small>/100</small></div>${meter(lh)}</div>
        <div><div class="k">WCAG rules failing</div><div class="v ${issues.length ? 't-bad' : ''}">${issues.length}</div></div>
        <div><div class="k">Images without alt text</div><div class="v ${missingAlt ? 't-bad' : ''}">${missingAlt}<small>of ${imgs}</small></div></div>
      </div>
      <p class="notice" style="margin-top:20px">Automated testing (axe-core, WCAG 2.2 AA) catches roughly a third of accessibility problems. Check keyboard navigation and a screen reader by hand before claiming compliance.</p>
      ${ruleTitle('Accessibility issues')}
      ${issueList(issues)}`;
  }

  function linksPanel(a) {
    const results = Object.values(a.linkResults || {});
    const broken = results.filter((r) => !r.ok).length;
    const redirected = results.filter((r) => r.ok && r.redirectedTo).length;
    const unverified = results.filter((r) => r.unverified).length;
    return `<h2 class="panel-title">Links & content</h2>
      <div class="stats" style="--cols:4;margin-top:32px">
        <div><div class="k">Unique links checked</div><div class="v">${results.length}</div></div>
        <div><div class="k">Broken</div><div class="v ${broken ? 't-bad' : ''}">${broken}</div></div>
        <div><div class="k">Redirected</div><div class="v">${redirected}</div></div>
        <div><div class="k">Could not verify</div><div class="v">${unverified}</div></div>
      </div>
      ${unverified ? '<p class="muted small" style="margin-top:12px;max-width:72ch">Links that could not be verified usually point at social networks, which block automated checks.</p>' : ''}
      ${ruleTitle('Links, resources and scripts')}
      ${issueList(a.analysis.issues.filter((i) => i.category === 'links'))}`;
  }

  // ---------------------------------------------------------------- security
  function securityPanel(a) {
    const { ssl, https, headers } = a.site;
    const sslItems = ssl.checked ? [
      { state: ssl.valid ? 'y' : 'n', title: ssl.valid ? 'Certificate is valid' : 'Certificate problem', sub: ssl.valid ? esc(ssl.subject) : esc(ssl.error) },
      ...(ssl.valid ? [
        { state: ssl.daysLeft > 30 ? 'y' : ssl.daysLeft > 14 ? 'w' : 'n', title: `Expires in ${ssl.daysLeft} days`, sub: ssl.validTo ? new Date(ssl.validTo).toLocaleDateString('en-GB', { dateStyle: 'long' }) : '' },
        { state: 'y', title: 'Issuer', sub: esc(ssl.issuer) },
        { state: /TLSv1\.[23]/.test(ssl.protocol || '') ? 'y' : 'w', title: 'Protocol', sub: esc(ssl.protocol || 'Unknown') },
      ] : []),
    ] : [{ state: 'n', title: 'No SSL certificate', sub: 'The site is not served over HTTPS' }];
    const httpsItems = [
      { state: https.usesHttps ? 'y' : 'n', title: 'Served over HTTPS' },
      { state: https.httpRedirectsToHttps ? 'y' : 'n', title: 'HTTP redirects to HTTPS' },
      { state: headers.disclosure?.length ? 'w' : 'y', title: 'Server software version hidden', sub: headers.disclosure?.length ? esc(headers.disclosure.join(' · ')) : '' },
    ];
    return `<h2 class="panel-title">Security</h2>
      <div class="two-col">
        <div>${ruleTitle('SSL certificate')}${checklist(sslItems)}</div>
        <div>${ruleTitle('HTTPS')}${checklist(httpsItems)}</div>
      </div>
      ${ruleTitle('Security headers')}
      ${headers.checked ? checklist(headers.list.map((h) => ({ state: h.present ? 'y' : 'n', title: esc(h.name), sub: h.present ? `<code>${esc(String(h.value).slice(0, 140))}</code>` : esc(h.why) })), 'passed') : `<p class="empty">Could not read headers: ${esc(headers.error)}</p>`}
      ${ruleTitle('Security issues')}
      ${issueList(a.analysis.issues.filter((i) => i.category === 'security'))}`;
  }

  // ---------------------------------------------------------------- pages / screenshots
  function pagesPanel(a) {
    return `<h2 class="panel-title">Pages scanned</h2>
      ${ruleTitle(`${plural(a.pages.length, 'page')} scanned`, 'Links shown as internal / external')}
      <div class="panel table-wrap"><table class="t"><thead><tr><th>Page</th><th>Status</th><th>Title</th><th>Words</th><th>Images</th><th>Links</th><th>Weight</th><th>Load</th><th>WCAG</th><th>JS errors</th></tr></thead><tbody>
        ${a.pages.map((p) => `<tr>
          <td><a class="truncate" style="max-width:220px" href="${esc(p.finalUrl)}" target="_blank" rel="noopener" title="${esc(p.finalUrl)}">${esc(path(p.finalUrl))}</a></td>
          <td class="num ${p.status >= 400 || !p.status ? 't-bad' : ''}">${p.status || esc(p.error || 'Error')}</td>
          <td><span class="truncate" style="max-width:240px" title="${esc(p.title)}">${esc(p.title || '—')}</span></td>
          <td class="num">${p.wordCount ?? '–'}</td>
          <td class="num">${p.imageCount ?? 0}${p.imagesMissingAlt ? ` <span class="t-bad">(${p.imagesMissingAlt} no alt)</span>` : ''}</td>
          <td class="num">${p.internalLinks ?? 0} / ${p.externalLinks ?? 0}</td>
          <td class="num">${fmtBytes(p.transferBytes)}</td>
          <td class="num">${fmtMs(p.loadMs)}</td>
          <td class="num ${p.axeViolations ? 't-bad' : ''}">${p.axeViolations ?? 0}</td>
          <td class="num ${p.consoleErrors ? 't-bad' : ''}">${p.consoleErrors ?? 0}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function screenshotsPanel(a) {
    const u = a.screenshotUrls || {};
    const dev = (name, label) => (u[name] ? `<figure class="device ${name}" style="margin:0"><div class="frame"><img src="${u[name]}" alt="${label} screenshot of the home page" loading="lazy"></div>${name === 'desktop' ? '<div class="stand"></div>' : ''}<figcaption class="lbl">${label}</figcaption></figure>` : '');
    const html = dev('desktop', 'Desktop, 1440px') + dev('tablet', 'Tablet, iPad Mini') + dev('mobile', 'Mobile, iPhone 13');
    return `<h2 class="panel-title">Screenshots</h2>${html ? `<div class="shots">${html}</div>` : '<p class="empty">No screenshots were captured.</p>'}`;
  }

  // ---------------------------------------------------------------- mount
  const TABS = [
    ['overview', 'Overview', overview],
    ['issues', 'All issues', issuesPanel],
    ['performance', 'Performance', performancePanel],
    ['seo', 'SEO', seoPanel],
    ['accessibility', 'Accessibility', accessibilityPanel],
    ['links', 'Links', linksPanel],
    ['security', 'Security', securityPanel],
    ['pages', 'Pages', pagesPanel],
    ['screenshots', 'Screenshots', screenshotsPanel],
  ];

  function mount(root, audit, opts = {}) {
    const an = audit.analysis;
    const count = (k) => (k === 'issues' ? an.issues.length : CATS[k] ? an.issues.filter((i) => i.category === k).length : k === 'pages' ? audit.pages.length : 0);
    const initial = opts.tab && TABS.some((t) => t[0] === opts.tab) ? opts.tab : 'overview';

    root.innerHTML = header(audit, opts) +
      `<nav class="tabs" aria-label="Report sections"><div class="container" role="tablist">${TABS.map(([k, l]) =>
        `<button class="tab${k === initial ? ' on' : ''}" role="tab" aria-selected="${k === initial}" data-tab="${k}">${l}${count(k) ? `<span class="count">${count(k)}</span>` : ''}</button>`).join('')}</div></nav>
      <div class="container">${TABS.map(([k, , fn]) => `<section class="tab-panel" role="tabpanel" data-panel="${k}"${!opts.print && k !== initial ? ' hidden' : ''}>${fn(audit)}</section>`).join('')}</div>`;

    if (opts.print) {
      root.querySelectorAll('details.issue').forEach((d) => (d.open = true));
      return;
    }

    const show = (tab) => {
      root.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      root.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
      opts.onTab?.(tab);
      const tabs = root.querySelector('.tabs');
      const offset = opts.standalone ? 0 : 56;
      if (tabs && window.scrollY > tabs.offsetTop - offset) window.scrollTo({ top: tabs.offsetTop - offset });
    };

    const panel = root.querySelector('[data-panel="issues"]');
    function applyFilters() {
      const q = (panel.querySelector('[data-filter="search"]').value || '').toLowerCase().trim();
      const sev = panel.querySelector('[data-filter="sev"] button.on')?.dataset.v || '';
      const cat = panel.querySelector('[data-filter="cat"]').value;
      let shown = 0;
      panel.querySelectorAll('details.issue').forEach((d) => {
        const ok = (!sev || d.dataset.sev === sev) && (!cat || d.dataset.cat === cat) && (!q || d.dataset.text.includes(q));
        d.hidden = !ok;
        if (ok) shown++;
      });
      panel.querySelector('[data-filter-count]').textContent = `${shown} of ${an.issues.length} shown`;
    }

    root.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) return show(tabBtn.dataset.tab);

      const goto = e.target.closest('[data-goto]');
      if (goto) {
        show(goto.dataset.goto);
        const sel = panel.querySelector('[data-filter="cat"]');
        sel.value = goto.dataset.catFilter || '';
        return applyFilters();
      }

      const sevBtn = e.target.closest('[data-filter="sev"] button');
      if (sevBtn) {
        sevBtn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === sevBtn));
        return applyFilters();
      }

      const dev = e.target.closest('[data-device-switch] button');
      if (dev) {
        dev.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === dev));
        root.querySelectorAll('[data-device]').forEach((d) => (d.hidden = d.dataset.device !== dev.dataset.v));
        return;
      }

      const copy = e.target.closest('[data-copy]');
      if (copy) {
        const text = root.querySelector(copy.dataset.copy)?.innerText || '';
        navigator.clipboard?.writeText(text).then(() => { copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Copy'), 1600); });
      }
    });

    panel.querySelector('[data-filter="search"]').addEventListener('input', applyFilters);
    panel.querySelector('[data-filter="cat"]').addEventListener('change', applyFilters);
    applyFilters();
  }

  window.Report = { mount, esc, tone, gradeTone, fmtDate, plural, ICONS };
})();
