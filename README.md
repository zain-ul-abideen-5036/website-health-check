<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/mark-dark.svg" />
  <img src="docs/brand/mark.svg" alt="Website Health Check logo" width="88" height="88" />
</picture>

<h1>Website Health Check</h1>

<h3>Find what's holding a website back. Hand over a report the client can read.</h3>

<p>
  <b>Website Health Check audits a whole website in a real browser and explains every problem in plain English.</b><br />
  Performance, SEO, accessibility, security and broken links, ranked into an action plan,<br />
  with a designed PDF for the client and spreadsheets for the developer. Free, with no API keys.
</p>

<p>
  <a href="https://website-health-check-zeta.vercel.app"><b>Live app&nbsp;&rarr;</b></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="TECHNICAL_README.md"><b>Technical Documentation</b></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#quickstart">Quickstart</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#inside-the-app">Screenshots</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#what-you-can-do">Features</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#built-with">Built with</a>
</p>

</div>

<br />

<img src="docs/screenshots/landing.png" alt="The Website Health Check landing page: the headline Website audits your clients can actually read, a URL field with a Run audit button, and a miniature of the latest audit showing a score of 84, grade B and five area scores" width="100%" />

---

## The problem it solves

A typical website audit is a Lighthouse score, a spreadsheet of a thousand
warnings, and a lot of jargon. It tells a developer something. It tells the
business that owns the website almost nothing: which of these problems matter,
how much work they are, and what to do first.

That gap is where agency time goes. Someone runs four different tools, copies
the results into a document, translates "missing HSTS header" into English and
decides what to fix first, by hand, every time.

Website Health Check does that work in one pass. It crawls the site in a real
Chrome browser, runs Google Lighthouse and WCAG accessibility tests, checks
every link once, and turns everything it finds into **a ranked list of issues,
each with why it matters, how to fix it, roughly how long it takes, and exactly
which pages it affects.**

**Who it is for**

- Web agencies and freelancers who audit client sites before a redesign, a
  proposal or a monthly report
- Developers who want one place to see speed, SEO, accessibility and security,
  with the affected pages listed
- Site owners who want to know what is wrong with their website, in words they
  understand

**What makes it different**

| | |
| --- | --- |
| **Every issue is explained** | Each finding says why it matters to visitors, rankings or security, how to fix it, and which pages and elements it affects. No raw rule IDs. |
| **It ranks the work** | Issues are ordered by severity and reach, with an effort estimate, so the first three lines are the three things worth doing first. |
| **Reports a client can read** | A designed A4 PDF with a cover, a one-page summary and an action plan, plus a written summary and a draft client email. |
| **It measures, it doesn't guess** | Pages are loaded in a real browser. Speed comes from Lighthouse, accessibility from axe-core, and, with a free Google key, real-visitor data from the Chrome UX Report. |
| **Free and open by default** | No sign-up, no password and no API keys. Everything it uses is open source, and it runs on your computer or on Vercel's free plan. |

---

## Quickstart

**Requirements:** Node.js 22.17+. No database, no accounts, no API keys.

```bash
git clone https://github.com/zain-ul-abideen-5036/website-health-check.git
cd website-health-check
npm install      # also downloads Chromium for local use
npm start        # http://localhost:3000
```

Open <http://localhost:3000>, type a website address and press **Run audit**.
A one-page audit takes about 30 seconds and a ten-page audit about two minutes.
Results are saved locally, so you can reopen, export or re-run them later.
Full setup, every environment variable and deploying to Vercel:
**[Technical Documentation →](TECHNICAL_README.md#getting-started)**

---

## Inside the app

Real captures from the **deployed app at
[website-health-check-zeta.vercel.app](https://website-health-check-zeta.vercel.app)**,
auditing [books.toscrape.com](https://books.toscrape.com), a public sandbox site
built for testing crawlers. Every figure is one the live app produced: 10 pages,
200 links, Lighthouse on mobile and desktop, 25 issues, in 53 seconds on Vercel.

### The report: scores, verdict and the summary

Five areas scored 0–100 and an overall grade, with the change since the last
audit of the same site. Each score row opens the issues behind it.

<img src="docs/screenshots/overview.png" alt="The report overview: an overall score of 84 out of 100, grade B, up 4 since the previous audit, the five area scores as bars, the verdict No critical problems but 4 high-priority fixes are worth scheduling, issues by severity, and the start of the written summary" width="100%" />

### A ranked action plan, explained

Every issue has a severity, the reason it matters, the fix, and the exact pages
and elements it affects. Filter by severity or area, or search.

<img src="docs/screenshots/issues.png" alt="The All issues tab: a search box, severity filters and an area menu above a ranked list, with the issue 10 insecure http resources on HTTPS pages expanded to show why it matters, how to fix it, and a table of the affected pages and resource URLs" width="100%" />

### From a URL to a report, live

<table>
<tr>
<td width="50%"><img src="docs/screenshots/new-audit.png" alt="The New audit page: a URL field, a choice of how many pages to crawl, a choice of mobile, desktop or both for Lighthouse, and a side panel listing what will happen with an estimated time" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/running.png" alt="An audit of books.toscrape.com in progress on the live site: a progress bar part way through with the elapsed time, the steps marked done and in progress, and a live log of pages being scanned" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>New audit</b>: pages, Lighthouse device and an honest time estimate</td>
<td align="center"><b>Live progress</b>: each step as it happens, with a running log</td>
</tr>
</table>

### A PDF made for the client, not printed from a web page

<table>
<tr>
<td width="25%"><img src="docs/screenshots/pdf-cover.png" alt="PDF page 1: a cover prepared for books.toscrape.com with the overall score 84 and grade B, the five area scores and desktop and mobile screenshots" width="100%" /></td>
<td width="25%"><img src="docs/screenshots/pdf-summary.png" alt="PDF page 2: the written summary, key figures, a table of scores by area with what each covers, and issues by severity" width="100%" /></td>
<td width="25%"><img src="docs/screenshots/pdf-action-plan.png" alt="PDF page 3: the action plan, a ranked table of every issue with area, severity, effort and pages affected" width="100%" /></td>
<td width="25%"><img src="docs/screenshots/pdf-findings.png" alt="PDF page 5: detailed findings for an area, each issue with why it matters, how to fix it and example pages" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Cover</b></td>
<td align="center"><b>Summary</b></td>
<td align="center"><b>Action plan</b></td>
<td align="center"><b>Findings</b></td>
</tr>
</table>

Followed by performance, technical checks, every page scanned and a
methodology appendix: 18 pages for this audit, rendered by the deployed app. The same audit also exports as
an interactive HTML file and four Excel-ready spreadsheets.

<img src="docs/screenshots/export-menu.png" alt="The Export menu open on a report: PDF report and Interactive HTML for the client, then Issues, Issue locations, Pages and Links spreadsheets, each with a one-line description" width="60%" />

### Each area in depth

<table>
<tr>
<td width="50%"><img src="docs/screenshots/performance.png" alt="The Performance tab: Lighthouse scores for performance, accessibility, best practices and SEO with a mobile and desktop switch, Core Web Vitals against Google's good and poor ranges, and the biggest speed opportunities with estimated savings" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/seo.png" alt="The SEO tab: site-wide checks for robots.txt, sitemap, structured data and HTTPS, a Google search result preview, and a page-by-page table of titles, descriptions, H1s, word counts and canonical tags" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Performance</b>: Lighthouse, Core Web Vitals against Google's thresholds, where the time goes</td>
<td align="center"><b>SEO</b>: site-wide setup, a search result preview and every page's tags</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/security.png" alt="The Security tab: SSL certificate validity, expiry, issuer and protocol, HTTPS checks, and each security header marked present or missing with what it does" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/accessibility.png" alt="The Accessibility tab: the Lighthouse accessibility score, the number of failing WCAG rules and images without alt text, a note on the limits of automated testing, and the accessibility issues" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Security</b>: certificate, HTTPS and every security header</td>
<td align="center"><b>Accessibility</b>: WCAG 2.2 AA results, honest about what automation misses</td>
</tr>
</table>

<details>
<summary><b>More of the product</b>: the written summary, history, pages, screenshots, the landing page showcase and the full landing page</summary>

<br />

**A written summary and a draft client email**, generated on your machine
from the audit results, with no AI service involved.

<img src="docs/screenshots/summary.png" alt="The Summary section: a plain-English overview of the audit, a list of quick wins, and a draft email to the client with a Copy button" width="100%" />

<table>
<tr>
<td width="50%"><img src="docs/screenshots/history.png" alt="The History page: totals for audits saved, websites and average score, a card per website with its latest score and a trend line, and a searchable, sortable table of every audit" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/pages.png" alt="The Pages tab: every page crawled with status, title, words, images, links, weight, load time, WCAG violations and JavaScript errors" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>History</b>: every audit, with a score trend for each website</td>
<td align="center"><b>Pages</b>: everything measured on every page crawled</td>
</tr>
</table>

**Screenshots** on three devices, captured during the audit.

<img src="docs/screenshots/device-screenshots.png" alt="The Screenshots tab showing the home page as captured on a desktop monitor, a tablet and a phone" width="100%" />

**The landing page showcase**: real screenshots in a browser and a phone frame, switching between light and dark images with the theme.

<img src="docs/screenshots/section-showcase.png" alt="The See it in action section of the landing page: a report overview in a desktop browser frame with the same report on a phone overlapping it, and three cards below for ranked issues, the PDF report and history" width="100%" />

**The complete landing page**, top to bottom.

<img src="docs/screenshots/landing-full.png" alt="The full landing page: the hero, key figures, the product showcase, how it works, what it checks, what you get, free and private, recent audits and the closing call to action" width="100%" />

</details>

---

### Two themes, tuned separately

Light and dark are two sets of tokens rather than one inverted into the other,
so the score colours stay legible in both. The app follows the system setting,
or you can pick **Light**, **Dark** or **System** in the top bar.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/landing-dark.png" alt="The landing page in the dark theme" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/overview-dark.png" alt="The report overview in the dark theme" width="100%" /></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/issues-dark.png" alt="The issues list with an expanded issue in the dark theme" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/history-dark.png" alt="The History page in the dark theme" width="100%" /></td>
</tr>
</table>

### Built for a phone, not shrunk onto one

Tables become stacked rows, menus open the right way, and nothing scrolls
sideways, checked on every page from 320 px up.

<table>
<tr>
<td width="25%"><img src="docs/screenshots/mobile-landing.png" alt="The landing page on a phone" width="100%" /></td>
<td width="25%"><img src="docs/screenshots/mobile-report.png" alt="A report on a phone" width="100%" /></td>
<td width="25%"><img src="docs/screenshots/mobile-issues.png" alt="An expanded issue on a phone, with the affected elements stacked as blocks" width="100%" /></td>
<td width="25%"><img src="docs/screenshots/mobile-history.png" alt="The History page on a phone, with each audit as a compact row" width="100%" /></td>
</tr>
</table>

---

## What you can do

<table>
<tr>
<td width="33%" valign="top">

**Audit a whole site**

Crawl 1 to 50 pages in a real Chrome browser, starting from the home page and
the XML sitemap. Duplicate URLs, tracking parameters and admin pages are
skipped automatically.

</td>
<td width="33%" valign="top">

**Measure real speed**

Google Lighthouse on mobile, desktop or both: Core Web Vitals against Google's
thresholds, the biggest speed opportunities with estimated savings, and load
time, weight and server response for every page.

</td>
<td width="33%" valign="top">

**Test accessibility**

axe-core WCAG 2.2 AA tests on every page, plus images missing alt text,
grouped into issues with the failing elements listed.

</td>
</tr>
<tr>
<td width="33%" valign="top">

**Check the SEO basics**

Titles and descriptions (missing, too long, duplicated), H1s and heading order,
canonicals, noindex, language, Open Graph, structured data, thin content,
robots.txt and the sitemap.

</td>
<td width="33%" valign="top">

**Find broken links**

Every internal and external link checked once, with retries on network errors,
plus broken images, scripts and stylesheets, and JavaScript errors in the
console.

</td>
<td width="33%" valign="top">

**Review security**

SSL validity and expiry, HTTP to HTTPS redirects, mixed content, the six key
security headers and exposed server versions.

</td>
</tr>
<tr>
<td width="33%" valign="top">

**Hand over a report**

A designed PDF, an interactive HTML file, and four CSVs: issues, issue
locations, pages and links. Add your agency name to the PDF cover.

</td>
<td width="33%" valign="top">

**Show progress**

Re-run an audit and see what was fixed, what is new and how each score moved
since the last audit of the same site.

</td>
<td width="33%" valign="top">

**See what real visitors get**

With a free Google key, add real-visitor Core Web Vitals from the Chrome UX
Report, including INP, which a lab test cannot measure.

</td>
</tr>
</table>

---

## How it works

<img src="docs/screenshots/section-how-it-works.png" alt="From a URL to a client-ready report in about two minutes, in three steps. 01 Enter a website: choose how many pages to crawl and whether to test mobile, desktop or both. 02 It tests every page: each page is loaded in Chromium, tested with axe-core and checked against 50+ rules, Lighthouse measures speed and every link is checked once. 03 Share the results: issues are ranked by severity and effort, with a plain-English explanation and fix for each, exported as a PDF for the client and CSVs for the developer." width="100%" />

---

## The part that matters

An audit is only useful if someone acts on it. So the product is built around
the step most tools leave out: **turning findings into decisions.**

Each issue is written for the person paying for the fix, not the person running
the tool. Here is real output from the sample audit:

> **HTTP version does not redirect to HTTPS** · High · Security
>
> **Why it matters:** Visitors typing the address without https:// may land on
> an insecure version of the site.
>
> **How to fix:** Add a permanent 301 redirect from http:// to https:// (server
> config or a plugin like Really Simple SSL).
>
> **Effort:** Quick fix · **Where:** site-wide

And issues are scored the same way every time, so a number means something
from one audit to the next:

| Severity | Points | Meaning |
| --- | --- | --- |
| **Critical** | −25 | Broken or risky right now. Fix immediately |
| **High** | −12 | Noticeably hurts visitors, rankings or security. Fix this month |
| **Medium** | −6 | Worth fixing in the next round of work |
| **Low** | −2 | Minor refinement. Fix when convenient |

Each area starts at 100. Where Lighthouse measures the same thing, its score is
blended in, and the overall grade is a weighted average: performance and SEO
25% each, accessibility 20%, security and links 15% each. The full method is
printed in every PDF's appendix and documented in
[How scores are calculated](TECHNICAL_README.md#how-scores-are-calculated).

### Open to anyone, private to each person

No sign-up and no password. Each browser gets an anonymous ID in a secure
cookie, so **History shows only your own audits** and only you can delete them.
Reports are **shareable by link** with long random IDs that cannot be guessed.
An hourly limit per visitor keeps a free hosting plan under control, and
private network addresses are refused, so the app cannot be pointed at internal
systems. [How it works →](TECHNICAL_README.md#open-access-and-security)

---

## Built with

<div align="center">

<h4>Runtime and server</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E/5FA04E" width="42" height="42" alt="Node.js" /><br /><sub><b>Node.js</b><br />22.17+</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/express/000000/ffffff" width="42" height="42" alt="Express" /><br /><sub><b>Express</b><br />5</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/javascript/F7DF1E/F7DF1E" width="42" height="42" alt="JavaScript" /><br /><sub><b>JavaScript</b><br />ES modules</sub></td>
</tr>
</table>

<h4>Auditing engine</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/lighthouse/F44B21/F44B21" width="42" height="42" alt="Lighthouse" /><br /><sub><b>Lighthouse</b><br />13.6</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/googlechrome/4285F4/4285F4" width="42" height="42" alt="Chromium" /><br /><sub><b>Chromium</b><br />headless</sub></td>
</tr>
</table>

<h4>Interface</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/html5/E34F26/E34F26" width="42" height="42" alt="HTML5" /><br /><sub><b>HTML</b><br />no framework</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/css/663399/9b6fd6" width="42" height="42" alt="CSS" /><br /><sub><b>CSS</b><br />design tokens</sub></td>
</tr>
</table>

<h4>Delivery</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/vercel/000000/ffffff" width="42" height="42" alt="Vercel" /><br /><sub><b>Vercel</b><br />Functions + Blob</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/github/181717/ffffff" width="42" height="42" alt="GitHub" /><br /><sub><b>GitHub</b><br />repository</sub></td>
</tr>
</table>

</div>

Also in use, and carrying a good deal of the weight, but without a brand mark
of their own: **Playwright** (`playwright-core`) drives the crawler and
screenshots; **axe-core** runs the WCAG tests; **chrome-launcher** starts
Chrome for Lighthouse; **@sparticuz/chromium** provides Chromium inside Vercel
Functions; **pdf-lib** assembles the PDF; **@vercel/blob** stores audits on
Vercel; and the **Chrome UX Report API** supplies real-visitor data. Type is
set in **Newsreader**, **Geist** and **Geist Mono**.

The full breakdown, with the role each one plays, is in the
[technical documentation](TECHNICAL_README.md#architecture).

---

## Where it is useful

- **Before a redesign or a proposal.** A dated, scored baseline of what is wrong
  with the current site, and evidence for why the work is worth doing.
- **Monthly client reporting.** Re-run the audit and the report shows what was
  fixed, what is new and which scores moved.
- **Handing work to a developer.** The CSVs list every issue with the exact
  pages and elements affected, ready to turn into tickets.
- **Checking a site before launch.** Broken links, missing titles, contrast
  failures and missing security headers, caught before visitors do.
- **As a reference implementation.** A Node.js app that orchestrates Playwright,
  Lighthouse and axe-core, generates PDFs, and runs the same code locally and
  on serverless functions.

Website Health Check reports what it can measure automatically. It does not
replace manual accessibility testing, it cannot see pages behind a login, and
Lighthouse scores vary a little from run to run.

---

## Project highlights

| | |
| --- | --- |
| **One pass, five disciplines** | Lighthouse, axe-core, a crawler, a link checker and TLS and header checks run in one pipeline and feed one rules engine, so every finding uses the same severities and the same report. |
| **Findings, not data** | Around 40 built-in rules plus every failing axe-core rule become issues with a plain-English description, a fix, an effort estimate and the affected pages. Passes are listed too, so the report shows what is already working. |
| **A PDF designed for paper** | A dedicated A4 layout, not a printed web page: a full-bleed cover rendered separately and merged with pdf-lib so numbering starts on page two, tables that repeat their headers, and findings that never split across pages. |
| **The same code, local and serverless** | A queue with Server-Sent Events on your machine; on Vercel, the audit runs inside one streamed request with a time budget that trims the crawl rather than failing, and says what it trimmed. |
| **Diagnosed in production** | The serverless Chromium build's `--single-process` flag crashed multi-page crawls; the fix pins `playwright-core` to the exact Chromium version and removes flags that would also have hidden mixed-content problems. |
| **Open without being exposed** | Anonymous visitor cookies, hashed ownership, unguessable report links, a per-visitor rate limit, an SSRF guard on every URL and CSV formula escaping. |
| **Accessible and responsive** | Checked with axe-core in both themes, keyboard-reachable controls, reduced-motion support, and no horizontal overflow at any width from 320 px to 1280 px. |

---

## Documentation

Complete engineering detail, from setup and environment variables to
architecture, scoring, security and deployment, lives in one place:

<div align="center">

### [Technical Documentation &rarr;](TECHNICAL_README.md)

</div>

| Looking for | Go to |
| --- | --- |
| Running it locally | [Getting started](TECHNICAL_README.md#getting-started) |
| Every environment variable | [Environment variables](TECHNICAL_README.md#environment-variables) |
| Adding real-visitor data for free | [Free Google key](TECHNICAL_README.md#real-visitor-data-with-a-free-google-key) |
| Putting it online | [Deploying to Vercel](TECHNICAL_README.md#deploying-to-vercel) |
| How the pieces fit together | [Architecture](TECHNICAL_README.md#architecture) |
| What each audit step does | [The audit pipeline](TECHNICAL_README.md#the-audit-pipeline) |
| How scores are calculated | [Scoring](TECHNICAL_README.md#how-scores-are-calculated) |
| Every export, field by field | [Exports](TECHNICAL_README.md#exports) |
| Open access and security | [Security](TECHNICAL_README.md#open-access-and-security) |
| The HTTP API | [API reference](TECHNICAL_README.md#api-reference) |
| Adding an audit rule | [Extending it](TECHNICAL_README.md#extending-it) |
| Contributing | [Contributing guide](CONTRIBUTING.md) |

---

## Project status

Deployed and running at
**[website-health-check-zeta.vercel.app](https://website-health-check-zeta.vercel.app)**
on Vercel, with audits stored in Vercel Blob, and runnable on any machine with
Node.js. Every screenshot above was captured from the live deployment: a full
10-page audit with Lighthouse on mobile and desktop completes there in under a
minute, and the PDF is rendered by the serverless function itself.

- Complete audit pipeline: site checks, Lighthouse, crawl with axe-core, link
  checking, screenshots, scoring, comparison and the written summary
- PDF, HTML and four CSV exports
- Light and dark themes, responsive from 320 px, open access with per-browser
  history
- Verified by auditing real sites end to end, rendering the PDF, and scanning
  every page at six screen widths for overflow and accessibility violations

Known gaps, stated plainly:

- **There is no automated test suite yet.** Verification has been by running
  audits against real sites rather than by unit tests.
- **Audits on the live instance are capped at 10 pages and 200 links** to fit
  Vercel's five-minute function limit; slow sites may be trimmed further, and the report
  says when they are. Run it locally for up to 50 pages.
- **The rate limit is per running instance** on Vercel, so it is a speed bump
  rather than a strict quota.
- **Automated accessibility testing finds roughly a third of WCAG issues.**
  The report says so, and manual testing is still needed for compliance.
- **Pages behind logins or forms are not tested.**

---

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/mark-dark.svg" />
  <img src="docs/brand/mark.svg" alt="" width="40" height="40" />
</picture>

**Website Health Check**: website audits your clients can actually read

Built by [Zain Ul Abideen](https://github.com/zain-ul-abideen-5036)

[Repository](https://github.com/zain-ul-abideen-5036/website-health-check)
&nbsp;·&nbsp;
[Technical Documentation](TECHNICAL_README.md)
&nbsp;·&nbsp;
[MIT Licence](LICENSE)

<br />

<sub><i>An audit is only finished when someone knows what to fix first.</i></sub>

</div>
