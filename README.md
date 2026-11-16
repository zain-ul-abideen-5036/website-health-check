# Website Health Check

**Audit any website for performance, SEO, accessibility, security and broken links, then hand the client a report they can actually read.**

[![Live demo](https://img.shields.io/badge/demo-live-23634c?style=flat-square)](https://website-health-check-zeta.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-1b1a17?style=flat-square)](LICENSE)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.17-1b1a17?style=flat-square&logo=node.js&logoColor=white)
![Lighthouse](https://img.shields.io/badge/Google-Lighthouse-1b1a17?style=flat-square&logo=lighthouse&logoColor=white)
![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2%20AA-1b1a17?style=flat-square)
![Deploy on Vercel](https://img.shields.io/badge/deploy-Vercel-1b1a17?style=flat-square&logo=vercel&logoColor=white)

Enter a URL and the app crawls the site in a real Chrome browser, runs Google Lighthouse and WCAG accessibility tests, checks every link, and produces a prioritised fix list with plain-English explanations. Export a designed PDF for the client and CSV spreadsheets for the developer. It runs on your own computer or on Vercel, needs no API keys, and costs nothing to run.

**[Try the live demo →](https://website-health-check-zeta.vercel.app)**

### Highlights

- **50+ checks** across five areas, each scored 0–100 and graded A–F
- **Ranked action plan**: every issue has a severity, an effort estimate, why it matters, how to fix it and the exact pages affected
- **Client-ready PDF** with cover page, summary, findings and methodology, plus four Excel-friendly CSVs
- **Before/after comparison** against the previous audit of the same site
- **Open access**: no sign-up and no password. History is private to each browser, and reports are shareable by link
- **Free**: Lighthouse, axe-core and Playwright are open source; optional real-visitor data uses a free Google key

### Built with

Node.js · Express · Playwright · Google Lighthouse · axe-core · pdf-lib · Vercel Blob · vanilla JavaScript (no build step)

## What it checks

| Area | Checks |
|---|---|
| **Performance** | Lighthouse (mobile, desktop or both), Core Web Vitals (LCP, CLS, TBT, FCP, SI, TTI), speed opportunities, image weight, oversized images, missing width/height, lazy-loading, page weight, server response time, compression |
| **SEO** | Titles and meta descriptions (missing, length, duplicates), H1s, heading order, noindex, canonical, `lang`, viewport, Open Graph, structured data (JSON-LD), thin content, favicon, robots.txt, XML sitemap |
| **Accessibility** | axe-core WCAG 2.2 AA tests on every page, plus images missing alt text |
| **Links and content** | Every internal and external link (deduplicated, retried on network errors), broken images/scripts/styles, JavaScript console errors, internal redirects |
| **Security** | HTTPS, HTTP→HTTPS redirect, SSL validity and expiry, mixed content, security headers (HSTS, CSP, X-Frame-Options, etc.), server version disclosure |

Each issue includes a severity (critical, high, medium or low), an explanation in plain English, how to fix it, and the pages it affects. Scores are given per area and overall (0–100, graded A–F).

**Other features**
- Multi-page crawl (1–50 pages, seeded from the sitemap)
- Live progress while an audit runs
- Saved history, with a **before/after comparison** against the previous audit of the same site
- Mobile, tablet and desktop screenshots
- Landing page, a dedicated **New audit** page (with time estimate) and a **History** page with per-site score trends, search and sorting
- Optional **real-visitor Core Web Vitals** (LCP, INP, CLS) from Google's Chrome UX Report, using a free API key
- **Written summary** for every audit: a plain-English overview, quick wins and a draft client email, generated on your computer with no API key and no cost
- Light, dark or system theme, switchable in the top bar

## Exports

| File | For | Contents |
|---|---|---|
| **PDF report** | Client | Cover page with screenshots, one-page summary, ranked action plan, findings with fixes, performance, technical checks, pages appendix and methodology |
| **Interactive HTML** | Client | The full filterable report in one self-contained file |
| `issues.csv` | Developer | One row per issue in priority order: severity, area, impact, effort, why, how to fix, example pages |
| `locations.csv` | Developer | One row per issue per affected page or element |
| `pages.csv` | Developer / SEO | Per-page title, description, H1, words, canonical, indexability, images, links, timings, weight, WCAG violations |
| `links.csv` | Developer | Every link checked, with broken, redirected and unverifiable ones first and the pages they were found on |

CSVs open directly in Excel. Set `REPORT_BRAND` (for example `set REPORT_BRAND=Extrasol`) to put your agency name on the PDF cover.

## Run it on your computer

Requires Node.js 22.17 or newer.

```bash
npm install     # also downloads Chromium for local use
npm start       # http://localhost:3000
```

**Everything is free.** Lighthouse, axe-core, Playwright and the summary writer are open source. No accounts or API keys are needed.

If port 3000 is busy, the app tells you. Start it on another port with `set PORT=3001 && npm start` (Windows) or `PORT=3001 npm start`.

## Free Google API key: real-visitor speed data (optional)

Lighthouse measures one test load. Google ranks sites on what **real visitors** experience, which comes from the Chrome UX Report (CrUX). With a free key, the report and PDF add real-visitor Core Web Vitals, including INP, which Lighthouse cannot measure.

**Get the key (about 3 minutes, no card or billing account):**

1. Go to https://console.cloud.google.com/ and sign in with a Google account.
2. Click the project picker at the top, then **New project**. Name it, for example `website-health-check`, and click **Create**.
3. Open https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com, make sure your new project is selected, and click **Enable**.
4. Go to **APIs & Services → Credentials**, click **Create credentials → API key**, and copy the key.
5. Recommended: click the key, under **API restrictions** choose **Restrict key**, tick **Chrome UX Report API** only, and **Save**. A leaked key then can't be used for anything else.

**Use it locally:**

```powershell
# PowerShell (this terminal only)
$env:GOOGLE_API_KEY = "paste-your-key"
npm start
```

The terminal prints `Real-visitor data (Chrome UX Report): enabled`. **On Vercel**, add it as an environment variable (step 4 below).

Small or new sites often have too little traffic for Google to publish data; the report says so when that happens. The free quota is far beyond what an agency needs.

## Deploy to Vercel

The app runs on Vercel's free Hobby plan. On Vercel it works slightly differently from your computer:

| | Your computer | Vercel |
|---|---|---|
| Browser | Playwright's Chromium | `@sparticuz/chromium` (serverless build) |
| Saved audits | `data/audits` folder | Vercel Blob (private storage) |
| Pages per audit | up to 50 | up to 10 (each audit must finish within 5 minutes) |
| Progress | queue and live events | one streamed request per audit |

### 1. Put the project on GitHub

```bash
git init
git add .
git commit -m "Website Health Check"
```

Create an empty repository on GitHub, then follow its "push an existing repository" commands. `node_modules`, `data` and `.env` are excluded by `.gitignore`.

### 2. Import it into Vercel

1. Sign in at https://vercel.com with GitHub and click **Add New → Project**.
2. Select the repository and click **Import**.
3. Leave **Framework Preset** as **Other** and the build settings empty. `vercel.json` already configures everything.
4. Click **Deploy**. The first deploy finishes, but audits won't run until storage is connected (next step); the site shows a "Setup needed" banner until then.

### 3. Connect Blob storage (free)

1. In the project, open the **Storage** tab, click **Create Database**, and choose **Blob**.
2. Choose **Private** access, give it a name and click **Create**, then connect it to the project for all environments.
3. This adds `BLOB_READ_WRITE_TOKEN` to the project automatically.

### 4. Add environment variables

In **Settings → Environment Variables**, add:

| Name | Value | Why |
|---|---|---|
| `AUDITS_PER_HOUR` | for example `6` | Optional: how many audits one visitor can run per hour (default 6) |
| `GOOGLE_API_KEY` | your key from above | Optional: real-visitor data |
| `REPORT_BRAND` | for example `Extrasol` | Optional: name on the PDF cover |

No password is needed: anyone with the link can use the app. See [Open access](#open-access-no-password) for how it stays safe.

### 5. Redeploy

Open **Deployments**, click **⋯** on the latest one and choose **Redeploy**. Environment variables and storage only take effect after a redeploy.

### If something goes wrong

- **Audit stops at about 5 minutes**: choose fewer pages or a single Lighthouse device. The Hobby plan allows 300 seconds per request.
- **"Storage is not set up"**: the Blob store isn't connected to this project, or you haven't redeployed since connecting it.
- **Browser fails to start**: open the deployment's **Logs** tab and look for the error. `@sparticuz/chromium` must be a version that works with the installed `playwright-core`.
- Vercel's Hobby plan is for personal, non-commercial use. For client work at an agency, use the agency's Pro account.

## Open access (no password)

The app is designed to be shared publicly without accounts or passwords:

- **Private history per browser.** Each browser gets a random, anonymous ID in a secure cookie. History shows only the audits run from that browser, and only that browser can delete them.
- **Shareable reports.** Report links use long random IDs, so anyone you send a link to can view it, but links can't be guessed.
- **Rate limit.** Each visitor can run a limited number of audits per hour (`AUDITS_PER_HOUR`, default 6), which keeps usage of a free hosting plan under control.
- **Safe targets only.** Private and local network addresses are blocked, so the app can't be used to probe internal systems.

On your own computer you see every audit; the per-browser rules apply on Vercel (or set `PUBLIC_MODE=1`).

## Optional (paid): Claude-written summaries

The Claude API has no free tier, so this is off unless you add a key. The built-in summary writer covers the same ground for free. To use Claude, set `ANTHROPIC_API_KEY` before starting (or add it in Vercel); an **AI summary** switch then appears on the New audit page. It uses `claude-opus-5-5` by default; override with `CLAUDE_MODEL`.

## Settings reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Local port |
| `GOOGLE_API_KEY` | none | Real-visitor data from the Chrome UX Report (free) |
| `AUDITS_PER_HOUR` | `6` | Audits per visitor per hour on a public deployment |
| `PUBLIC_MODE` | off | `1` applies per-browser history and rate limits outside Vercel |
| `REPORT_BRAND` | `Website Health Check` | Name on the PDF cover |
| `BLOB_READ_WRITE_TOKEN` | none | Vercel Blob storage (added automatically on Vercel) |
| `BLOB_ACCESS` | `private` | Set to `public` only if your Blob store was created as public |
| `AUDIT_MODE` | `queue` | `stream` runs each audit inside one streamed request (automatic on Vercel) |
| `ANTHROPIC_API_KEY` | none | Optional paid Claude summaries |

## Project structure

```
app.js                 Express app: API, progress, PDF/HTML/CSV exports, open-access rules
server.js              Starts the app on your computer
api/index.js           Vercel entry point (same app)
vercel.json            Vercel configuration: function time limit, bundled files, routing
lib/browser.js         Starts Chrome: Playwright locally, @sparticuz/chromium on Vercel
lib/jobs.js            Audit pipeline, queue (local) and streamed runs (Vercel)
lib/crawler.js         Crawler: per-page analysis, axe-core, screenshots
lib/analyze.js         Rules engine: issues, severities, fixes, scores, comparison
lib/summary.js         Free built-in summary, quick wins and client email
lib/pdf-report.js      Print layout for the PDF report
lib/exports.js         CSV exports (issues, locations, pages, links)
lib/storage.js         Saved audits: local disk or Vercel Blob
lib/visitor.js         Anonymous visitor IDs and rate limiting
lib/ai.js              Optional Claude summary
lib/checks/            Lighthouse, link checker, site-wide checks, Chrome UX Report
lib/url.js             URL validation (blocks private/local addresses), crawl rules
public/                Web app (vanilla JS, no build step)
public/js/render.js    Report renderer, shared by the app and exported reports
```

## Notes and limitations

- Lighthouse scores vary by a few points between runs; this is normal.
- Automated accessibility testing finds roughly a third of WCAG issues. Manual testing is still needed for compliance.
- Social networks block automated link checks, so those links are marked "could not verify" rather than broken.
- Only audit sites you own or have permission to test.

## Contributing

Contributions are welcome. Read the [contributing guide](CONTRIBUTING.md) to get started, and please follow the [code of conduct](CODE_OF_CONDUCT.md). To report a security problem privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Zain Ul Abideen
