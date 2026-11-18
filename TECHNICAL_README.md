# Website Health Check: Technical Documentation

Everything needed to run, configure, deploy and extend Website Health Check.
For what the product does and screenshots, see the [README](README.md).

## Contents

- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Real-visitor data with a free Google key](#real-visitor-data-with-a-free-google-key)
- [Deploying to Vercel](#deploying-to-vercel)
- [Architecture](#architecture)
- [The audit pipeline](#the-audit-pipeline)
- [How scores are calculated](#how-scores-are-calculated)
- [Exports](#exports)
- [Open access and security](#open-access-and-security)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Extending it](#extending-it)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)

---

## Getting started

**Requirements:** Node.js 22.17 or newer. No database, no accounts, no API keys.

```bash
git clone https://github.com/zain-ul-abideen-5036/website-health-check.git
cd website-health-check
npm install      # also downloads the matching Chromium build for Playwright
npm start        # http://localhost:3000
```

`npm install` runs `scripts/postinstall.mjs`, which downloads Chromium through
`playwright-core`. The download is skipped on Vercel (`VERCEL` is set), where the
serverless build from `@sparticuz/chromium` is used instead.

Saved audits are written to `data/audits/<id>/` as `audit.json`, a small
`summary.json` for the history list, and three JPEG screenshots. The folder is
git-ignored.

If port 3000 is busy the server says so and exits. Start it on another port:

```bash
set PORT=3001 && npm start      # Windows (cmd)
$env:PORT = 3001; npm start     # Windows (PowerShell)
PORT=3001 npm start             # macOS / Linux
```

### Useful local modes

| Command | What it does |
|---|---|
| `AUDIT_MODE=stream npm start` | Runs each audit inside one streamed request, exactly as on Vercel |
| `PUBLIC_MODE=1 npm start` | Applies the public-deployment rules: per-browser history and the hourly rate limit |
| `FUNCTION_TIMEOUT_SECONDS=60 AUDIT_MODE=stream npm start` | Simulates a shorter serverless time limit to test the time budget |

---

## Environment variables

None are required. Everything works with no configuration.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Local port |
| `GOOGLE_API_KEY` | none | Real-visitor Core Web Vitals from the Chrome UX Report (free). `CRUX_API_KEY` also works |
| `REPORT_BRAND` | `Website Health Check` | Name printed on the PDF cover and set as the PDF author |
| `AUDITS_PER_HOUR` | `6` | Audits each visitor may run per hour on a public deployment |
| `PUBLIC_MODE` | off | `1` turns on per-browser history and rate limits outside Vercel |
| `VISITOR_SALT` | built-in | Salt for hashing anonymous visitor IDs. Set a random value on a public deployment |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` | none | Vercel Blob storage. Added automatically when a store is connected (custom prefixes are detected) |
| `BLOB_ACCESS` | `private` | Set to `public` only if the Blob store was created as public |
| `AUDIT_MODE` | `queue` | `stream` runs each audit inside one streamed request (automatic on Vercel) |
| `FUNCTION_TIMEOUT_SECONDS` | `300` | The platform's request time limit; audits budget themselves to finish before it |
| `ANTHROPIC_API_KEY` | none | Optional, paid: AI-written summaries instead of the free built-in writer. `CLAUDE_MODEL` overrides the model |

---

## Real-visitor data with a free Google key

Lighthouse measures one simulated page load. Google ranks pages on what real
Chrome users experienced over the last 28 days, published in the Chrome UX
Report (CrUX). With a key, each audit adds the real-visitor 75th percentile for
LCP, INP, CLS, FCP and TTFB, the share of good, middling and poor visits, and
Google's pass or fail verdict. INP cannot be measured by Lighthouse at all.

**Get a key** (about three minutes, no card or billing account):

1. Go to <https://console.cloud.google.com/> and create a project.
2. Open the [Chrome UX Report API](https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com) page and click **Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → API key** and copy it.
4. Recommended: edit the key, choose **Restrict key** and allow only the **Chrome UX Report API**.

**Use it**: set `GOOGLE_API_KEY` locally (`$env:GOOGLE_API_KEY = "…"` in
PowerShell) or in Vercel's environment variables. The terminal prints
`Real-visitor data (Chrome UX Report): enabled`.

The app queries the exact page first and falls back to the whole origin. Sites
with too little traffic have no published data; the report says so. Poor
real-visitor results become issues in the Performance area. Implementation:
[`lib/checks/field-data.js`](lib/checks/field-data.js).

---

## Deploying to Vercel

The app deploys to Vercel's free Hobby plan with no code changes. On Vercel it
runs differently from your computer:

| | Your computer | Vercel |
|---|---|---|
| Browser | Playwright's Chromium | `@sparticuz/chromium` 153, with `playwright-core` pinned to the matching 1.63.0 |
| Saved audits | `data/audits` folder | Vercel Blob, private |
| Pages per audit | up to 50 | up to 10 |
| Progress | queue and Server-Sent Events | the audit runs inside one streamed request |
| Time limit | none | 300 seconds; the pipeline budgets itself to finish inside it |

### Steps

1. **Import the repository.** At [vercel.com](https://vercel.com) choose **Add New → Project**, pick the repository and click **Deploy**. Leave the framework preset as **Other**; `vercel.json` configures the function.
2. **Connect storage.** In the project open **Storage → Create Database → Blob**, choose **Private**, create it and connect it to the project for all environments. Until this is done the site shows a *Setup needed* banner.
3. **Add environment variables** (optional) under **Settings → Environment Variables**: `GOOGLE_API_KEY`, `REPORT_BRAND`, `AUDITS_PER_HOUR`, `VISITOR_SALT`.
4. **Redeploy** from **Deployments → ⋯ → Redeploy**. Storage and variables only apply to new deployments.

Every push to `main` deploys automatically afterwards.

### How it works on Vercel

- [`api/index.js`](api/index.js) exports the same Express app; `vercel.json` rewrites `/api/*` to it and serves `public/` statically.
- `includeFiles` bundles `@sparticuz/chromium`'s binary, Lighthouse's locale and config files, and axe-core, which are read from disk at run time and would otherwise be missed by file tracing.
- [`lib/browser.js`](lib/browser.js) removes three of `@sparticuz/chromium`'s default flags: `--single-process` (closing one page could take the whole browser down, surfacing as *Target page, context or browser has been closed*), and `--disable-web-security` and `--allow-running-insecure-content` (which would hide CORS and mixed-content problems from the audit).
- Each audit gets a time budget 27 seconds under the limit. If time runs short the crawl stops starting new pages, the link checker stops starting new checks, the second Lighthouse device or the screenshots are skipped, and the report states what was shortened. If the limit is reached anyway, the stream sends a clear failure message 12 seconds before the platform would cut the connection.

Vercel's Hobby plan is for personal, non-commercial use. Client work should run on a Pro account or on your own machine.

---

## Architecture

```
Browser (vanilla JS, no build step)
  │  public/index.html · js/app.js (routing, pages) · js/render.js (report renderer)
  │
  │  POST /api/audits          → queued job, progress over Server-Sent Events   (local)
  │  POST /api/audits/stream   → audit runs in the request, NDJSON progress     (Vercel)
  ▼
Express app (app.js)
  │  visitor cookie · rate limit · validation · exports
  ▼
Audit pipeline (lib/jobs.js)
  ├─ lib/checks/site.js         SSL, HTTPS redirect, headers, robots.txt, sitemap
  ├─ lib/checks/field-data.js   Chrome UX Report (optional)
  ├─ lib/checks/lighthouse.js   Lighthouse via chrome-launcher
  ├─ lib/crawler.js             Playwright crawl, page data, axe-core, screenshots
  ├─ lib/checks/links.js        every unique link, once
  ├─ lib/analyze.js             rules → issues, passes, scores, comparison
  └─ lib/summary.js             written summary, quick wins, client email
  ▼
Storage (lib/storage.js)        local disk  or  Vercel Blob
  ▼
Exports                         lib/pdf-report.js · lib/exports.js · standalone HTML
```

The report renderer (`public/js/render.js`) is shared: the web app mounts it,
and the HTML export inlines it with the audit data so the downloaded file works
offline with the same filters and tabs.

---

## The audit pipeline

| Step | What happens |
|---|---|
| **1. Validate** | The URL is normalised (`https://` added), resolved through DNS, and rejected if it points at a private, loopback or link-local address |
| **2. Site checks** | TLS certificate (validity, issuer, protocol, days left), HTTP→HTTPS redirect, security headers, compression, server version disclosure, robots.txt and the XML sitemap (following sitemap indexes) |
| **3. Lighthouse** | Mobile, desktop or both, in a separate Chrome. Scores, six metrics, the ten biggest opportunities and total page weight |
| **4. Crawl** | Breadth-first from the home page and sitemap URLs, three pages at a time. Each page: status, title, meta tags, headings, canonical, Open Graph, JSON-LD, images, links, failed resources, mixed content, console errors, timing and an axe-core WCAG 2.2 AA scan |
| **5. Links** | Every unique internal and external link checked once (HEAD, then GET), eight at a time, with retries on network errors. Social networks that block bots are marked *could not verify*, never broken |
| **6. Screenshots** | Mobile (iPhone 13), tablet (iPad Mini) and desktop (1440 px), in parallel |
| **7. Analyse** | Around 40 rules plus every failing axe-core rule produce issues with severity, plain-English description, fix and affected pages, alongside passed checks |
| **8. Compare** | The previous audit of the same site (by the same visitor on a public deployment) gives resolved issues, new issues and score changes |
| **9. Summarise and save** | The built-in writer produces the summary, quick wins and client email; everything is saved |

Crawling rules (`lib/url.js`): same host only, tracking parameters stripped,
`/` and `/index.html` treated as one page, and admin, cart, login and file URLs
skipped.

---

## How scores are calculated

Each area starts at 100 and loses points per issue:

| Severity | Points deducted | Meaning |
|---|---|---|
| Critical | 25 | Broken or risky right now |
| High | 12 | Noticeably hurts visitors, rankings or security |
| Medium | 6 | Worth fixing in the next round of work |
| Low | 2 | Minor refinement |

Where Lighthouse measures the same thing, its score is blended in:
performance is 60% Lighthouse and 40% rules, accessibility 50/50, SEO 40/60.

The overall score is a weighted average:

| Area | Weight |
|---|---|
| Performance | 25% |
| SEO | 25% |
| Accessibility | 20% |
| Security | 15% |
| Links & content | 15% |

Grades: **A** 90+, **B** 80–89, **C** 65–79, **D** 50–64, **F** below 50.
Issues are ordered by severity and then by the number of pages affected.
Source: [`lib/analyze.js`](lib/analyze.js).

---

## Exports

| Export | Endpoint | Contents |
|---|---|---|
| PDF report | `/api/audits/:id/export.pdf` | A4: cover with screenshots, summary, ranked action plan, findings by area, performance, technical checks, pages appendix, methodology |
| Interactive HTML | `/api/audits/:id/export.html` | One self-contained file with the full report, filters and screenshots |
| Issues | `/api/audits/:id/issues.csv` | One row per issue: priority, severity, area, occurrences, pages, impact, effort, why, fix, example pages |
| Issue locations | `/api/audits/:id/locations.csv` | One row per issue per affected page or element |
| Pages | `/api/audits/:id/pages.csv` | Per page: status, title and description with lengths, H1, words, canonical, indexability, images, links, timings, weight, requests, WCAG violations, JS errors |
| Links | `/api/audits/:id/links.csv` | Every link checked with its result, status, redirect target and the pages it was found on |

The PDF is a dedicated print layout ([`lib/pdf-report.js`](lib/pdf-report.js)),
not the web page printed. The cover is rendered separately without a footer and
merged with `pdf-lib`, so page numbers start on page two. CSVs include a UTF-8
BOM and CRLF line endings for Excel, and cells starting with formula characters
are escaped to prevent CSV injection.

---

## Open access and security

The app is designed to be shared publicly with no sign-up or password
([`lib/visitor.js`](lib/visitor.js)):

- **Anonymous visitors.** Each browser receives a random ID in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS). Audits store a salted SHA-256 hash of it, never the ID itself.
- **Private history.** On a public deployment, History lists only the visitor's own audits, comparisons use only their earlier audits, and deletion requires ownership (`403` otherwise).
- **Shareable, unguessable reports.** Audit IDs end in 12 random hex characters. Anyone with a link can view a report; the owner hash is stripped from every response.
- **Rate limiting.** A sliding one-hour window per IP address (`AUDITS_PER_HOUR`). It is held in memory, so on a serverless platform it applies per running instance.
- **SSRF protection.** Target hostnames are resolved and private, loopback, link-local and unique-local addresses are refused.
- **Contained output.** User-controlled text is escaped in the UI, the audit JSON embedded in HTML exports is escaped for `<script>`, and CSV cells are protected against formulas.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/config` | Features available on this deployment, page options, mode and storage status |
| `POST` | `/api/audits` | Queue an audit. Body: `{ url, maxPages, device: "mobile" \| "desktop" \| "both" }`. Returns `202 { id }` |
| `GET` | `/api/jobs/:id/events` | Server-Sent Events: a snapshot, then progress updates until `done` or `failed` |
| `POST` | `/api/audits/stream` | Run an audit in this request; newline-delimited JSON progress (serverless mode) |
| `GET` | `/api/audits` | The visitor's saved audits, newest first |
| `GET` | `/api/audits/:id` | One full audit, with `canDelete` |
| `DELETE` | `/api/audits/:id` | Delete an audit (owner only on public deployments) |
| `GET` | `/api/audits/:id/screenshots/:name.jpg` | `mobile`, `tablet` or `desktop` screenshot |
| `GET` | `/api/audits/:id/export.pdf` · `export.html` · `issues.csv` · `locations.csv` · `pages.csv` · `links.csv` | Exports |

Errors return `{ "error": "message" }` with `400` (invalid URL), `403`, `404`,
`429` (rate limit) or `503` (storage not set up).

---

## Project structure

```
app.js                 Express app: API, progress, exports, open-access rules
server.js              Local entry point with port-conflict handling
api/index.js           Vercel entry point (same app)
vercel.json            Function time limit, bundled files, routing
scripts/postinstall.mjs  Downloads Chromium locally, skipped on Vercel
lib/
  browser.js           Starts Chrome: Playwright locally, @sparticuz/chromium on Vercel
  jobs.js              Audit pipeline, queue and streamed runs, time budget
  crawler.js           Crawler, per-page extraction, axe-core, screenshots
  analyze.js           Rules engine: issues, severities, fixes, scores, comparison
  summary.js           Built-in summary, quick wins, client email, effort estimates
  pdf-report.js        PDF print layout and rendering
  exports.js           CSV exports
  storage.js           Local disk or Vercel Blob
  visitor.js           Anonymous visitor IDs and rate limiting
  url.js               URL validation, SSRF guard, crawl rules
  ai.js                Optional paid AI summary
  checks/
    lighthouse.js      Google Lighthouse
    links.js           Link checker
    site.js            SSL, redirects, headers, robots.txt, sitemap
    field-data.js      Chrome UX Report
public/
  index.html           App shell, theme bootstrap
  css/app.css          Design tokens, light and dark themes, layouts
  js/app.js            Routing, landing, new audit, history, progress
  js/render.js         Report renderer shared with the HTML export
docs/                  Brand mark and README screenshots
```

---

## Extending it

### Add an audit rule

1. Collect the data in `lib/crawler.js` (inside `extractPageData`, per page) or `lib/checks/site.js` (site-wide). If it is needed after the crawl, keep it in `slimPage()` in `lib/jobs.js`.
2. In `lib/analyze.js`, use `perPage(id, category, severity, test, title, description, fix, passTitle)` for per-page checks, or `add(...)` and `pass(...)` directly.
3. Write the description for a client: why it matters, then exactly what to do.
4. Add the id to `LOW_EFFORT` or `HIGH_EFFORT` in `lib/summary.js` if the fix is usually quick or slow.

### Change the design

All colour, type, spacing and motion values are tokens at the top of
`public/css/app.css`, with dark values in two blocks (system preference and the
explicit toggle). Motion uses `transform` and `opacity` only, with three
durations, one easing curve and full `prefers-reduced-motion` support.

### Upgrading Chromium on Vercel

`playwright-core` must match the Chromium version of `@sparticuz/chromium`.
Upgrade them together: check `browserVersion` in
`node_modules/playwright-core/browsers.json` against the `@sparticuz/chromium`
major version.

---

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| `npm start` exits immediately | Port 3000 is in use; the message says so. Close the other server or set `PORT` |
| *Setup needed* banner on Vercel | No Blob store connected, or no redeploy since connecting it. The banner lists any storage variables it can see |
| *Target page, context or browser has been closed* | Chromium crashed. Check that `playwright-core` matches `@sparticuz/chromium`, and that `lib/browser.js` still filters `--single-process` |
| Audit stops with a time-limit message | Choose fewer pages or a single Lighthouse device. Very slow sites take longer per page |
| *The server stopped unexpectedly after …* | Open the deployment's **Logs**. Every step is logged with an `[audit <id>]` prefix |
| PDF falls back to system fonts | The PDF waits for Google Fonts; offline machines use Georgia and Helvetica |
| Links reported *could not verify* | LinkedIn, Instagram and similar block automated requests; these are never counted as broken |

---

## Limitations

- **No automated test suite yet.** Changes are verified by running audits against real sites, rendering the PDF, and checking every page at widths from 320 px to 1280 px for overflow and accessibility violations.
- **Lighthouse varies** by a few points between runs as network and server conditions change.
- **Automated accessibility testing finds roughly a third of WCAG issues.** Keyboard and screen reader testing is still needed for compliance.
- **The rate limit is per instance** on serverless platforms; a shared store would make it global.
- **Pages behind logins or forms are not tested**, and single-page apps that render only after interaction may be partially read.
- **One audit runs at a time** on a local server; others wait in a queue.

Only audit websites you own or have permission to test.
