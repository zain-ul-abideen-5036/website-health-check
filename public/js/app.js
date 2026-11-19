(function () {
  'use strict';
  const { esc, fmtDate, gradeTone, plural, tone } = window.Report;
  const app = document.getElementById('app');
  let config = { aiEnabled: false, fieldData: false, pageOptions: [1, 5, 10, 25, 50] };
  let activeStream = null;

  const prefs = load('prefs', { maxPages: 10, device: 'mobile', ai: true });
  function load(k, d) { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }

  const CATS = { performance: 'Performance', seo: 'SEO', accessibility: 'Accessibility', security: 'Security', links: 'Links & content' };

  // ---------------------------------------------------------------- routing
  async function route() {
    activeStream?.close();
    activeStream = null;
    const [, view, id, tab] = location.hash.split('/');
    window.scrollTo(0, 0);
    document.getElementById('nav-new').toggleAttribute('aria-current', view === 'new');
    document.getElementById('nav-history').toggleAttribute('aria-current', view === 'history');
    if (view === 'run' && id) return runView(id);
    if (view === 'audit' && id) return reportView(id, tab);
    if (view === 'history') return historyView();
    if (view === 'new') newAuditView(id ? decodeURIComponent(id) : '');
    else landingView();
    if (config.storageProblem) app.insertAdjacentHTML('afterbegin', `<div class="container"><p class="banner" role="alert"><strong>Setup needed.</strong> ${esc(config.storageProblem)}</p></div>`);
  }
  window.addEventListener('hashchange', route);

  async function api(url, opts) {
    const res = await fetch(url, opts);
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  let pendingStream = null; // serverless mode: the response that carries the running audit's progress

  async function startAudit(body) {
    const req = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    if (config.mode !== 'stream') {
      const { id } = await api('/api/audits', req);
      location.hash = `#/run/${id}`;
      return;
    }
    // On Vercel the audit runs inside this one request, which streams progress until it finishes.
    const controller = new AbortController();
    const res = await fetch('/api/audits/stream', { ...req, signal: controller.signal });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    pendingStream = { res, controller };
    location.hash = '#/run/live';
  }

  /** Reads newline-delimited JSON from a streamed response, calling onLine for each object. Resolves when the stream ends. */
  async function readLines(res, onLine) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) onLine(JSON.parse(line));
      }
    }
  }

  /** URL input with a fixed https:// prefix; strips a pasted scheme so it isn't duplicated. */
  const urlField = (id, value = '', btn = 'Run audit') => `<div class="url-field">
      <span class="prefix" aria-hidden="true">https://</span>
      <input id="${id}" type="text" inputmode="url" placeholder="example.co.uk" autocomplete="url" aria-label="Website address" aria-describedby="form-error" value="${esc(value)}">
      <button class="btn btn-primary" type="submit">${btn}</button>
    </div>`;
  function bindUrlInput(input) {
    input.addEventListener('input', () => {
      const m = input.value.match(/^\s*https?:\/\//i);
      if (m) input.value = input.value.slice(m[0].length);
    });
  }
  function showFormError(form, input, btn, label, message) {
    const err = form.querySelector('.form-error');
    err.textContent = message;
    err.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    btn.disabled = false;
    btn.textContent = label;
  }

  const estimateSeconds = (pages, device) => Math.round(25 + (device === 'both' ? 2 : 1) * 30 + pages * 2.5 + Math.min(400, pages * 25) / 8 + 10);
  const fmtDuration = (s) => (s < 60 ? `${s} seconds` : `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? '' : 's'}`);

  // ---------------------------------------------------------------- landing
  const AREAS = [
    ['Performance', 'Google Lighthouse on mobile and desktop, Core Web Vitals, image weight, page size and server response time.'],
    ['SEO', 'Titles, descriptions, headings, canonicals, indexing, structured data, Open Graph, robots.txt and sitemaps.'],
    ['Accessibility', 'Automated WCAG 2.2 AA testing with axe-core on every page, including alt text and colour contrast.'],
    ['Security', 'SSL validity and expiry, HTTPS redirects, mixed content, security headers and version disclosure.'],
    ['Links and content', 'Every internal and external link checked once, broken images and scripts, JavaScript errors.'],
  ];
  const OUTPUTS = [
    ['PDF report', 'A designed, client-ready document: cover page, one-page summary, ranked action plan, findings with fixes, and a methodology appendix.'],
    ['Spreadsheets', 'Four CSVs that open in Excel: issues by priority, every affected location, page-by-page metrics, and broken or redirected links.'],
    ['Interactive HTML', 'A single self-contained file with the full filterable report, ready to email or host.'],
    ['Written summary', 'A plain-English overview, quick wins and a draft client email, generated on your machine.'],
  ];

  function previewCard(a) {
    const sample = !a;
    a ||= { host: 'example-bakery.co.uk', overall: 72, grade: 'C', scores: { performance: 58, seo: 81, accessibility: 69, security: 77, links: 92 }, counts: { critical: 1, high: 4, medium: 7, low: 5 }, createdAt: null, pages: 18 };
    return `<figure class="specimen" aria-label="${sample ? 'Sample report' : 'Your latest audit'}">
      <div class="specimen-head"><span>${sample ? 'Sample report' : 'Your latest audit'}</span><span>${a.createdAt ? fmtDate(a.createdAt) : '18 pages'}</span></div>
      <p class="specimen-host">${esc(a.host)}</p>
      <div class="specimen-score"><span class="n">${a.overall}</span><span class="of">/100</span><span class="grade t-${gradeTone(a.grade)}">${a.grade}</span></div>
      <ul class="specimen-areas">${Object.entries(CATS).map(([k, l]) => `<li><span>${l}</span><span class="meter t-${tone(a.scores[k])}"><i style="--v:${a.scores[k] / 100}"></i></span><span class="v">${a.scores[k]}</span></li>`).join('')}</ul>
      <div class="specimen-foot">${['critical', 'high', 'medium', 'low'].map((s) => `<span class="sev sev-${s}"><i></i>${a.counts[s]} ${s}</span>`).join('')}</div>
      ${sample ? '' : `<a class="specimen-link" href="#/audit/${a.id}">Open report →</a>`}
    </figure>`;
  }

  /** A real app screenshot in light and dark versions; CSS shows the one matching the theme. Responsive via srcset. */
  function shot(name, alt, { big, small, h, sizes }) {
    return ['light', 'dark'].map((t) => `<img class="shot-${t}" src="/img/showcase/${name}-${t}-${small}.webp" srcset="/img/showcase/${name}-${t}-${small}.webp ${small}w, /img/showcase/${name}-${t}-${big}.webp ${big}w" sizes="${sizes}" width="${big}" height="${h}" alt="${esc(alt)}" loading="lazy" decoding="async">`).join('');
  }

  async function landingView() {
    document.title = 'Website Health Check: audits your clients can read';
    app.innerHTML = `
      <div class="first-screen">
      <section class="hero container">
        <div class="hero-copy">
          <p class="kicker">Performance · SEO · Accessibility · Security · Links</p>
          <h1>Website audits your clients can actually read.</h1>
          <p class="lead">Crawl any site in a real browser, run Google Lighthouse and WCAG tests, check every link, and get a ranked fix list with a designed PDF and spreadsheets. ${config.mode === 'stream' ? 'Free to run, with no API keys needed.' : 'Free, and it runs on your own machine.'}</p>
          <form class="audit-form" id="quick-form" novalidate>
            ${urlField('url')}
            <p class="form-hint">Up to ${prefs.maxPages} pages · Lighthouse ${prefs.device} · <a href="#/new">Change settings</a></p>
            <p class="form-error" id="form-error" role="alert" hidden></p>
          </form>
        </div>
        <div class="hero-side" id="hero-preview">${previewCard(null)}</div>
      </section>

      <section class="band"><div class="container figures-row">
        <div><span class="v">50+</span><span class="k">checks per audit</span></div>
        <div><span class="v">5</span><span class="k">areas scored 0–100</span></div>
        <div><span class="v">6</span><span class="k">export formats</span></div>
        <div><span class="v">£0</span><span class="k">no API keys or accounts</span></div>
      </div></section>
      </div>

      <section class="container section showcase" aria-labelledby="showcase-title">
        <div class="section-head"><p class="kicker">See it in action</p><h2 id="showcase-title">A real report, on any screen.</h2>
          <p class="muted">Captured from an audit of books.toscrape.com, a public sandbox site: 10 pages, 212 links and 26 issues, ranked and explained.</p></div>
        <div class="device-stage">
          <figure class="browser-frame">
            <div class="browser-bar" aria-hidden="true"><i></i><i></i><i></i><span>Website Health Check · Report</span></div>
            ${shot('report', 'A report overview: an overall score of 82 out of 100, grade B, five area scores and the issues by severity', { big: 1440, small: 800, h: 900, sizes: '(max-width: 1240px) 92vw, 1100px' })}
          </figure>
          <figure class="phone-frame">
            ${shot('phone', 'The same report on a phone', { big: 780, small: 390, h: 1688, sizes: '(max-width: 640px) 34vw, 240px' })}
          </figure>
        </div>
        <div class="shot-grid">
          <figure class="shot-card">${shot('issues', 'An expanded issue with why it matters, how to fix it and the affected pages', { big: 960, small: 560, h: 600, sizes: '(max-width: 860px) 92vw, 380px' })}<figcaption><b>Ranked, explained issues</b>Why it matters, how to fix it and exactly where.</figcaption></figure>
          <figure class="shot-card paper"><img src="/img/showcase/pdf-cover-560.webp" srcset="/img/showcase/pdf-cover-560.webp 560w, /img/showcase/pdf-cover-910.webp 910w" sizes="(max-width: 860px) 92vw, 380px" width="910" height="1288" alt="The PDF report cover with the site name, score, grade, area scores and screenshots" loading="lazy" decoding="async"><figcaption><b>A PDF for the client</b>Cover, summary, action plan and findings.</figcaption></figure>
          <figure class="shot-card">${shot('history', 'The History page with a score trend for each website', { big: 960, small: 560, h: 600, sizes: '(max-width: 860px) 92vw, 380px' })}<figcaption><b>History and trends</b>Re-run an audit and see what moved.</figcaption></figure>
        </div>
      </section>

      <section class="container section">
        <div class="section-head"><p class="kicker">How it works</p><h2>From a URL to a client-ready report in about two minutes.</h2></div>
        <ol class="howto">
          <li><span class="n">01</span><div><h3>Enter a website</h3><p>Choose how many pages to crawl and whether to test mobile, desktop or both. Pages are discovered from the sitemap and internal links.</p></div></li>
          <li><span class="n">02</span><div><h3>It tests every page</h3><p>Each page is loaded in Chromium, tested with axe-core and checked against 50+ rules. Lighthouse measures speed and every link is checked once.</p></div></li>
          <li><span class="n">03</span><div><h3>Share the results</h3><p>Issues are ranked by severity and effort, with a plain-English explanation and fix for each. Export a PDF for the client and CSVs for the developer.</p></div></li>
        </ol>
      </section>

      <section class="container section split-section">
        <div class="section-head"><p class="kicker">What it checks</p><h2>Five areas, scored and explained.</h2><p class="muted">Every issue says why it matters, how to fix it and exactly which pages it affects.</p></div>
        <dl class="arealist">${AREAS.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>
      </section>

      <section class="container section split-section">
        <div class="section-head"><p class="kicker">What you get</p><h2>Reports for clients, data for developers.</h2></div>
        <dl class="arealist">${OUTPUTS.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>
      </section>

      <section class="container section split-section">
        <div class="section-head"><p class="kicker">Free and private</p><h2>Nothing to pay, no API keys to manage.</h2></div>
        <div class="prose">
          <p>Lighthouse, axe-core, Playwright and the summary writer are all open source and run on this server, so audits cost nothing. ${config.mode === 'stream' ? 'No sign-up or password: your audit history is tied to this browser, and you can share any report by its link.' : 'Results stay on your computer in <code>data/audits</code>.'}</p>
          <p>Optional: add a free Google API key to include real-visitor Core Web Vitals from the Chrome UX Report.
            ${config.fieldData ? '<strong class="t-good">Real-visitor data is switched on.</strong>' : 'It needs no billing account; see the README for the two-minute setup.'}</p>
        </div>
      </section>

      <section class="container section" id="recent" hidden>
        <div class="section-head row"><div><p class="kicker">Recent audits</p><h2>Pick up where you left off.</h2></div><a class="btn" href="#/history">View all history</a></div>
        <div id="recent-body"></div>
      </section>

      <section class="container"><div class="cta">
        <h2>Audit a website now.</h2>
        <a class="btn btn-primary btn-lg" href="#/new">Start a new audit</a>
      </div></section>`;

    const form = document.getElementById('quick-form');
    const input = document.getElementById('url');
    bindUrlInput(input);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      form.querySelector('.form-error').hidden = true;
      if (!input.value.trim()) return showFormError(form, input, btn, 'Run audit', 'Enter a website address, for example example.co.uk');
      btn.disabled = true;
      btn.textContent = 'Starting…';
      try { await startAudit({ url: input.value.trim(), maxPages: prefs.maxPages, device: prefs.device, ai: config.aiEnabled && prefs.ai }); }
      catch (ex) { showFormError(form, input, btn, 'Run audit', ex.message); }
    });

    let list = [];
    try { list = await api('/api/audits'); } catch { /* landing still works without history */ }
    if (!document.getElementById('hero-preview')) return; // navigated away
    if (list.length) {
      document.getElementById('hero-preview').innerHTML = previewCard(list[0]);
      document.getElementById('recent').hidden = false;
      document.getElementById('recent-body').innerHTML = historyTable(list.slice(0, 4), { compact: true });
    }
  }

  // ---------------------------------------------------------------- new audit
  const PAGE_HELP = { 1: 'Home page only. Fastest.', 5: 'A quick look at key pages.', 10: 'Good default for small business sites.', 25: 'Most of a typical brochure site.', 50: 'Larger sites. Takes a few minutes.' };
  const DEVICE_HELP = {
    mobile: ['Mobile', 'What Google uses for rankings. Simulates a mid-range phone on 4G.'],
    desktop: ['Desktop', 'Fast connection and a large screen. Usually scores higher.'],
    both: ['Both', 'Runs Lighthouse twice so you can compare. Adds about 30 seconds.'],
  };

  function newAuditView(prefill = '') {
    document.title = 'New audit · Website Health Check';
    app.innerHTML = `<div class="container page">
      <header class="page-head"><p class="kicker">New audit</p><h1>Which website should we check?</h1></header>
      <form class="new-grid" id="audit-form" novalidate>
        <div>
          <label class="field-label" for="url">Website address</label>
          ${urlField('url', prefill)}
          <p class="form-error" id="form-error" role="alert" hidden></p>

          <fieldset class="choice-group">
            <legend class="field-label">How many pages to crawl</legend>
            <div class="choices">${config.pageOptions.map((n) => `<label class="choice"><input type="radio" name="pages" value="${n}" ${n === prefs.maxPages ? 'checked' : ''}><span class="c-t">${n === 1 ? '1 page' : `Up to ${n}`}</span><span class="c-d">${PAGE_HELP[n] || ''}</span></label>`).join('')}</div>
          </fieldset>

          <fieldset class="choice-group">
            <legend class="field-label">Lighthouse test</legend>
            <div class="choices three">${Object.entries(DEVICE_HELP).map(([v, [t, d]]) => `<label class="choice"><input type="radio" name="device" value="${v}" ${v === prefs.device ? 'checked' : ''}><span class="c-t">${t}</span><span class="c-d">${d}</span></label>`).join('')}</div>
          </fieldset>

          ${config.aiEnabled ? `<label class="switch" style="margin-top:24px"><input type="checkbox" id="opt-ai" ${prefs.ai ? 'checked' : ''}>Write the summary with Claude (uses your API key)</label>` : ''}
        </div>

        <aside class="new-side">
          <p class="kicker">What happens next</p>
          <ol class="mini-steps">
            <li><span>SSL, security headers, robots.txt and sitemap</span></li>
            <li><span>Google Lighthouse <span id="dev-note"></span></span></li>
            <li><span>Crawl <span id="pages-note"></span> with accessibility tests</span></li>
            <li><span>Check every link, image and script</span></li>
            <li><span>Screenshots on mobile, tablet and desktop</span></li>
            ${config.fieldData ? '<li><span>Real-visitor data from the Chrome UX Report</span></li>' : ''}
            <li><span>Score, rank and write the summary</span></li>
          </ol>
          <div class="estimate"><span class="k">Estimated time</span><span class="v" id="estimate"></span></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit" id="go">Run audit</button>
          <p class="muted small" style="margin-top:12px">Only audit sites you own or have permission to test. One audit runs at a time; others wait in a queue.</p>
        </aside>
      </form>
    </div>`;

    const form = document.getElementById('audit-form');
    const input = document.getElementById('url');
    bindUrlInput(input);
    input.focus();
    const values = () => ({ maxPages: Number(form.pages.value), device: form.device.value });
    const refresh = () => {
      const v = values();
      document.getElementById('estimate').textContent = `About ${fmtDuration(estimateSeconds(v.maxPages, v.device))}`;
      document.getElementById('dev-note').textContent = v.device === 'both' ? '(mobile and desktop)' : `(${v.device})`;
      document.getElementById('pages-note').textContent = v.maxPages === 1 ? 'the home page' : `up to ${v.maxPages} pages`;
    };
    form.addEventListener('change', refresh);
    refresh();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('go');
      form.querySelector('.form-error').hidden = true;
      input.removeAttribute('aria-invalid');
      if (!input.value.trim()) return showFormError(form, input, btn, 'Run audit', 'Enter a website address, for example example.co.uk');
      const body = { url: input.value.trim(), ...values(), ai: document.getElementById('opt-ai')?.checked ?? false };
      Object.assign(prefs, { maxPages: body.maxPages, device: body.device, ai: body.ai || prefs.ai });
      save('prefs', prefs);
      btn.disabled = true;
      btn.textContent = 'Starting…';
      try { await startAudit(body); }
      catch (ex) { showFormError(form, input, btn, 'Run audit', ex.message); input.focus(); }
    });
  }

  // ---------------------------------------------------------------- history
  /** Score change versus the previous audit of the same site. */
  function withDeltas(list) {
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = new Map();
    const out = new Map();
    for (const a of sorted) {
      const key = a.host.replace(/^www\./, '');
      out.set(a.id, last.has(key) ? a.overall - last.get(key) : null);
      last.set(key, a.overall);
    }
    return out;
  }

  function historyTable(list, { compact = false, deltas = withDeltas(list) } = {}) {
    const d = (n) => (n === null ? '' : n > 0 ? `<span class="delta up">+${n}</span>` : n < 0 ? `<span class="delta down">−${Math.abs(n)}</span>` : '<span class="delta same">±0</span>');
    return `<div class="table-wrap"><table class="t htable">
      <thead><tr><th>Website</th><th>Date</th><th class="r">Score</th>${compact ? '' : Object.values(CATS).map((l) => `<th class="r area-col">${l === 'Links & content' ? 'Links' : l === 'Accessibility' ? 'A11y' : l === 'Performance' ? 'Perf.' : l}</th>`).join('')}<th>Issues</th><th class="r">Pages</th>${compact ? '' : '<th><span class="sr">Actions</span></th>'}</tr></thead>
      <tbody>${list.map((a) => `<tr data-id="${a.id}" data-host="${esc(a.host)}">
        <td class="h-site"><a class="hlink" href="#/audit/${a.id}">${esc(a.host)}</a></td>
        <td class="h-date nowrap muted">${fmtDate(a.createdAt)}</td>
        <td class="h-score r nowrap"><span class="hscore t-${gradeTone(a.grade)}">${a.overall}</span> <span class="grade-sm t-${gradeTone(a.grade)}">${a.grade}</span> ${d(deltas.get(a.id) ?? null)}</td>
        ${compact ? '' : Object.keys(CATS).map((k) => `<td class="h-area r num t-${tone(a.scores[k])}">${a.scores[k]}</td>`).join('')}
        <td class="h-issues nowrap small">${a.counts.critical ? `<span class="sev sev-critical"><i></i>${a.counts.critical}</span> ` : ''}${a.counts.high ? `<span class="sev sev-high"><i></i>${a.counts.high}</span> ` : ''}<span class="muted">${a.counts.critical + a.counts.high + a.counts.medium + a.counts.low} total</span></td>
        <td class="h-pages r num">${a.pages}</td>
        ${compact ? '' : `<td class="h-actions r nowrap row-actions">
          <a class="btn btn-text" href="/api/audits/${a.id}/export.pdf" data-pdf>PDF</a>
          <a class="btn btn-text" href="#/new/${encodeURIComponent(a.url)}">Re-run</a>
          <button class="btn btn-text danger" data-delete="${a.id}" aria-label="Delete audit of ${esc(a.host)} from ${fmtDate(a.createdAt)}">Delete</button></td>`}
      </tr>`).join('')}</tbody></table></div>`;
  }

  /** Small score-over-time line for a site, drawn as inline SVG. */
  function sparkline(scores) {
    if (scores.length < 2) return '';
    const w = 96, h = 28, min = Math.min(...scores) - 4, max = Math.max(...scores) + 4;
    const pts = scores.map((s, i) => `${(i / (scores.length - 1)) * w},${h - ((s - min) / (max - min)) * (h - 4) - 2}`);
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${pts.at(-1).split(',')[0]}" cy="${pts.at(-1).split(',')[1]}" r="2.2" fill="currentColor"/></svg>`;
  }

  async function historyView() {
    document.title = 'History · Website Health Check';
    app.innerHTML = `<div class="container page"><header class="page-head row"><div><p class="kicker">History</p><h1>Saved audits</h1>${config.public ? '<p class="page-note">Audits run in this browser. Anyone you send a report link to can view that report.</p>' : ''}</div><a class="btn btn-primary" href="#/new">New audit</a></header>
      <div class="skeleton" style="padding-top:0">${'<div class="b" style="height:44px"></div>'.repeat(5)}</div></div>`;
    let list = [];
    try { list = await api('/api/audits'); } catch (e) { toast(e.message); }
    const page = app.querySelector('.page');
    if (!page) return;

    if (!list.length) {
      page.innerHTML = `<header class="page-head"><p class="kicker">History</p><h1>No audits yet</h1></header>
        <p class="empty">Every audit you run is saved here, so you can reopen the report, export it again, or re-run it later to see what improved.</p>
        <a class="btn btn-primary btn-lg" href="#/new">Run your first audit</a>`;
      return;
    }

    const deltas = withDeltas(list);
    const sites = new Map();
    for (const a of [...list].reverse()) { // oldest first
      const key = a.host.replace(/^www\./, '');
      if (!sites.has(key)) sites.set(key, []);
      sites.get(key).push(a);
    }
    const avg = Math.round(list.reduce((s, a) => s + a.overall, 0) / list.length);
    const siteCards = [...sites.entries()].sort((a, b) => b[1].at(-1).createdAt.localeCompare(a[1].at(-1).createdAt)).slice(0, 8).map(([host, runs]) => {
      const latest = runs.at(-1);
      const change = runs.length > 1 ? latest.overall - runs[0].overall : null;
      return `<a class="site" href="#/audit/${latest.id}">
        <span class="site-host">${esc(host)}</span>
        <span class="site-score t-${gradeTone(latest.grade)}">${latest.overall}</span>
        <span class="site-trend t-${gradeTone(latest.grade)}">${sparkline(runs.map((r) => r.overall))}</span>
        <span class="site-meta">${plural(runs.length, 'audit')}${change !== null ? ` · ${change >= 0 ? '+' : '−'}${Math.abs(change)} since first` : ''}</span>
      </a>`;
    }).join('');

    page.innerHTML = `<header class="page-head row"><div><p class="kicker">History</p><h1>Saved audits</h1>${config.public ? '<p class="page-note">Audits run in this browser. Anyone you send a report link to can view that report.</p>' : ''}</div><a class="btn btn-primary" href="#/new">New audit</a></header>
      <div class="stats stats-keep" style="--cols:3">
        <div><div class="k">Audits saved</div><div class="v">${list.length}</div></div>
        <div><div class="k">Websites</div><div class="v">${sites.size}</div></div>
        <div><div class="k">Average score</div><div class="v t-${tone(avg)}">${avg}<small>/100</small></div></div>
      </div>
      <div class="rule-title"><h2>Websites</h2><span class="aside">Latest score and trend</span></div>
      <div class="sites">${siteCards}</div>
      <div class="rule-title"><h2>All audits</h2><span class="aside" id="h-count"></span></div>
      <div class="toolbar" style="margin-top:0">
        <input class="search" type="search" id="h-search" placeholder="Search by website" aria-label="Search by website">
        <select class="select" id="h-sort" aria-label="Sort audits">
          <option value="new">Newest first</option><option value="old">Oldest first</option><option value="high">Highest score</option><option value="low">Lowest score</option><option value="site">Website A–Z</option>
        </select>
      </div>
      <div id="h-table"></div>`;

    const render = () => {
      const q = document.getElementById('h-search').value.trim().toLowerCase();
      const sort = document.getElementById('h-sort').value;
      const rows = list.filter((a) => !q || a.host.toLowerCase().includes(q));
      const cmp = { new: (a, b) => b.createdAt.localeCompare(a.createdAt), old: (a, b) => a.createdAt.localeCompare(b.createdAt), high: (a, b) => b.overall - a.overall, low: (a, b) => a.overall - b.overall, site: (a, b) => a.host.localeCompare(b.host) || b.createdAt.localeCompare(a.createdAt) }[sort];
      rows.sort(cmp);
      document.getElementById('h-count').textContent = `${rows.length} of ${list.length}`;
      document.getElementById('h-table').innerHTML = rows.length ? historyTable(rows, { deltas }) : '<p class="empty">No audits match that search.</p>';
    };
    document.getElementById('h-search').addEventListener('input', render);
    document.getElementById('h-sort').addEventListener('change', render);
    render();

    page.addEventListener('click', async (e) => {
      if (e.target.closest('[data-pdf]')) return toast('Preparing PDF, this takes a few seconds');
      const del = e.target.closest('[data-delete]');
      if (!del) return;
      const row = del.closest('tr');
      if (!confirm(`Delete this audit of ${row.dataset.host}? This can't be undone.`)) return;
      try {
        await api(`/api/audits/${del.dataset.delete}`, { method: 'DELETE' });
        toast('Audit deleted');
        historyView();
      } catch (ex) { toast(ex.message); }
    });
  }

  // ---------------------------------------------------------------- running
  function runView(id) {
    const live = id === 'live';
    if (live && !pendingStream) { location.hash = '#/history'; return; } // page was reloaded mid-audit
    let auditId = live ? null : id;
    let finished = false;
    document.title = 'Running audit · Website Health Check';
    app.innerHTML = `<div class="container"><section class="run" aria-live="polite">
      <p class="kicker" id="run-kicker">Running audit</p>
      <h1 id="run-title">Preparing…</h1>
      <div class="rail" id="rail"><i></i></div>
      <div class="run-meta"><span id="pct">0%</span><span id="elapsed">0:00</span></div>
      <ol class="steps" id="steps"></ol>
      <div class="log" id="log"></div>
      <div class="run-error" id="run-error" hidden></div>
    </section></div>`;

    const started = Date.now();
    const timer = setInterval(() => {
      const el = document.getElementById('elapsed');
      if (!el) return clearInterval(timer);
      const s = Math.floor((Date.now() - started) / 1000);
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);

    let steps = [];
    const renderSteps = (current, status) => {
      const idx = steps.findIndex((s) => s.key === current);
      document.getElementById('steps').innerHTML = steps.map((s, i) => {
        const state = status === 'done' || (idx > -1 && i < idx) ? 'done' : i === idx ? 'active' : '';
        return `<li class="${state}"${state === 'active' ? ' aria-current="step"' : ''}>${esc(s.label)}<span class="state">${state === 'done' ? 'Done' : state === 'active' ? 'In progress' : ''}</span></li>`;
      }).join('');
    };
    const log = (msg, t = Date.now()) => {
      const el = document.getElementById('log');
      if (!el || !msg) return;
      el.insertAdjacentHTML('beforeend', `<div><span class="t">${new Date(t).toLocaleTimeString('en-GB')}</span>${esc(msg)}</div>`);
      el.scrollTop = el.scrollHeight;
    };
    const fail = (message) => {
      clearInterval(timer);
      activeStream?.close();
      document.getElementById('run-kicker').textContent = 'Audit failed';
      document.getElementById('rail').hidden = true;
      const box = document.getElementById('run-error');
      box.hidden = false;
      box.innerHTML = `<p>${esc(message || 'Something went wrong.')}</p><a class="btn" href="#/new">Try another site</a>`;
    };
    const update = (u) => {
      if (u.percent !== undefined) {
        document.getElementById('rail').firstElementChild.style.setProperty('--v', u.percent / 100);
        document.getElementById('pct').textContent = `${u.percent}%`;
      }
      if (u.step !== undefined || u.status) renderSteps(u.step, u.status);
      log(u.message);
      if (u.status === 'done') {
        clearInterval(timer);
        activeStream?.close();
        finished = true;
        setTimeout(() => { location.hash = `#/audit/${auditId}`; }, 500);
      }
      if (u.status === 'failed') { finished = true; fail(u.error); }
    };

    const onData = (data) => {
      if (data.ping) return;
      if (!data.snapshot) return update(data);
      const j = data.snapshot;
      auditId = j.id;
      steps = j.steps;
      const host = new URL(j.url).host;
      document.getElementById('run-title').textContent = host;
      document.title = `Auditing ${host} · Website Health Check`;
      j.log.forEach((l) => log(l.message, l.t));
      update({ percent: j.percent, step: j.step, status: j.status, error: j.error });
    };

    if (live) {
      const { res, controller } = pendingStream;
      pendingStream = null;
      activeStream = { close: () => controller.abort() };
      readLines(res, onData).then(() => {
        if (finished) return;
        // The connection closed without a result. Say how long it ran and where, so the cause can be found.
        const secs = Math.round((Date.now() - started) / 1000);
        const where = document.querySelector('#steps li.active')?.firstChild?.textContent || 'start-up';
        const ran = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
        fail(secs >= 280
          ? `The audit stopped after ${ran}, during "${where}". Vercel's free plan allows 5 minutes per audit, so try fewer pages or a single Lighthouse device.`
          : `The server stopped unexpectedly after ${ran}, during "${where}". This is not the time limit. Open Vercel → Deployments → Logs to see the error.`);
      }).catch((err) => {
        if (err.name !== 'AbortError' && !finished) fail('Lost connection to the server, so the audit may have been interrupted.');
      });
      return;
    }

    activeStream = new EventSource(`/api/jobs/${id}/events`);
    activeStream.onmessage = (e) => onData(JSON.parse(e.data));
    activeStream.onerror = async () => {
      // The server restarted, or the job finished and was cleaned up: check for saved results.
      activeStream?.close();
      try { await api(`/api/audits/${id}`); location.hash = `#/audit/${id}`; }
      catch { fail('Lost connection to the server, so the audit may have been interrupted.'); }
    };
  }

  // ---------------------------------------------------------------- report
  async function reportView(id, tab) {
    app.innerHTML = `<div class="container skeleton" aria-busy="true" aria-label="Loading report">
      <div class="b" style="width:180px;height:84px"></div><div class="b" style="width:42%;height:22px"></div><div class="b" style="width:64%;height:14px;margin-bottom:48px"></div>
      ${'<div class="b" style="height:44px"></div>'.repeat(5)}</div>`;
    let audit;
    try { audit = await api(`/api/audits/${id}`); } catch (e) {
      app.innerHTML = `<div class="container run"><p class="kicker">Report unavailable</p><h1>${esc(e.message)}</h1><p style="margin-top:20px"><a class="btn" href="#/history">Back to history</a></p></div>`;
      return;
    }
    document.title = `${new URL(audit.finalUrl).host} · ${audit.analysis.overall}/100 · Website Health Check`;
    window.Report.mount(app, audit, { tab, onTab: (t) => history.replaceState(null, '', `#/audit/${id}/${t}`) });

    app.querySelector('[data-action="rerun"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Starting…';
      try { await startAudit({ url: audit.url, ...audit.options }); }
      catch (ex) { toast(ex.message); btn.disabled = false; btn.textContent = 'Run again'; }
    });
    app.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      if (!confirm(`Delete this audit of ${new URL(audit.finalUrl).host}? This can't be undone.`)) return;
      await api(`/api/audits/${id}`, { method: 'DELETE' });
      toast('Audit deleted');
      location.hash = '#/history';
    });
    app.querySelectorAll('[data-download]').forEach((a) => a.addEventListener('click', () => {
      if (a.href.endsWith('.pdf')) toast('Preparing PDF, this takes a few seconds');
      a.closest('details')?.removeAttribute('open');
    }));
  }

  // ---------------------------------------------------------------- theme
  // Light, dark, or follow the system. Saved per browser; applied early by an inline script in index.html.
  function applyTheme(choice) {
    if (choice === 'light' || choice === 'dark') document.documentElement.dataset.theme = choice;
    else delete document.documentElement.dataset.theme;
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === choice)));
  }
  let savedTheme = 'system';
  try { savedTheme = localStorage.getItem('theme') || 'system'; } catch { /* storage blocked */ }
  applyTheme(savedTheme);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    applyTheme(b.dataset.themeSet);
    try { b.dataset.themeSet === 'system' ? localStorage.removeItem('theme') : localStorage.setItem('theme', b.dataset.themeSet); } catch { /* storage blocked */ }
  });

  // Close an open export menu on outside click or Escape.
  document.addEventListener('click', (e) => document.querySelectorAll('details.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.removeAttribute('open'); }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const m = document.querySelector('details.menu[open]');
    if (m) { m.removeAttribute('open'); m.querySelector('summary').focus(); }
  });

  // ---------------------------------------------------------------- start
  api('/api/config').then((c) => { config = { ...config, ...c }; }).catch(() => {}).finally(route);
})();
