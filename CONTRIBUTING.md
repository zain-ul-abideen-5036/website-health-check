# Contributing to Website Health Check

Thanks for your interest in improving Website Health Check. Bug reports, ideas, documentation fixes and code are all welcome.

## Ways to help

- **Report a bug**: open an issue using the *Bug report* template. Include the URL you audited (if it's public), what you expected and what happened.
- **Suggest a feature**: open an issue using the *Feature request* template and describe the problem it solves.
- **Improve the docs**: typos, clearer explanations and better examples are always useful.
- **Write code**: pick an open issue, or open one first for larger changes so we can agree on the approach.

## Development setup

Requires Node.js 22.17 or newer.

```bash
git clone https://github.com/zain-ul-abideen-5036/website-health-check.git
cd website-health-check
npm install      # also downloads Chromium for local use
npm start        # http://localhost:3000
```

To test the Vercel-style streamed audits locally, start with `AUDIT_MODE=stream`. To test the public-deployment rules (per-browser history, rate limit), add `PUBLIC_MODE=1`.

## Project layout

- `lib/checks/` holds individual checks (Lighthouse, links, site-wide, Chrome UX Report).
- `lib/analyze.js` turns raw results into issues and scores. **New audit rules go here.**
- `lib/pdf-report.js` and `lib/exports.js` produce the PDF and CSV exports.
- `public/` is the web app: vanilla JavaScript, no build step.

## Adding an audit rule

1. Collect any new data you need in `lib/crawler.js` (per page) or `lib/checks/site.js` (site-wide).
2. Add the rule in `lib/analyze.js` with `add(id, category, severity, title, description, fix, affected)`, or record a pass with `pass(category, title)`.
3. Write the description and fix in plain English for a non-technical client: say why it matters, then exactly what to do.
4. If the fix is usually quick or slow, add the rule's id to the effort lists in `lib/summary.js`.

## Code style

- Modern JavaScript (ES modules), two-space indentation, single quotes, semicolons.
- Keep functions small and comment the *why*, not the *what*.
- UI text uses sentence case and plain English. Avoid jargon in anything a client will read.
- Colours, spacing and motion in the UI come from the CSS tokens at the top of `public/css/app.css`.

## Pull requests

1. Fork the repository and create a branch from `main`, e.g. `feature/broken-anchor-check`.
2. Make focused commits with clear messages (`Add check for missing hreflang tags`).
3. Run an audit locally against a couple of real sites and check the report, PDF and CSVs.
4. Open a pull request and fill in the template, with screenshots for UI changes.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
