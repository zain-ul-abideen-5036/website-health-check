/**
 * Free, offline summary: turns audit results into a plain-English overview,
 * priorities, quick wins and a client email. No API or key needed.
 * Same shape as the optional AI summary, so the report renders either one.
 */
import { CATEGORIES } from './analyze.js';

// Rough effort per issue type, based on typical fixes for small business sites.
const LOW_EFFORT = [
  /^title-length$/, /^meta-description/, /^img-alt-missing$/, /^og-missing$/, /^canonical-missing$/, /^lang-missing$/,
  /^viewport-missing$/, /^favicon-missing$/, /^robots-/, /^sitemap-missing$/, /^header-/, /^no-compression$/,
  /^images-no-dimensions$/, /^images-not-lazy$/, /^noindex$/, /^server-disclosure$/, /^internal-redirects$/,
  /^h1-/, /^duplicate-/, /^no-https-redirect$/, /^broken-external-links$/, /^no-structured-data$/,
];
const HIGH_EFFORT = [/^lh-performance-poor$/, /^field-/, /^cwv-/, /^slow-server$/, /^heavy-pages$/, /^no-https$/, /^axe-color-contrast$/, /^thin-content$/];

export const effortOf = (id) => (LOW_EFFORT.some((r) => r.test(id)) ? 'low' : HIGH_EFFORT.some((r) => r.test(id)) ? 'high' : 'medium');
export const impactOf = (sev) => (sev === 'critical' || sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : 'low');

export const WHY_AREA = {
  performance: 'how fast pages load, which affects both visitors and Google rankings',
  seo: 'how well the site can be found on Google',
  accessibility: 'whether everyone, including people using screen readers, can use the site',
  security: 'visitor trust and protection from common attacks',
  links: 'whether visitors hit errors or dead ends',
};

const plural = (n, w) => `${n} ${n === 1 ? w : /(s|x|ch|sh)$/.test(w) ? `${w}es` : `${w}s`}`;
const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

export function buildSummary(audit) {
  const { analysis, pages, lighthouse } = audit;
  const host = new URL(audit.finalUrl).host;
  const { issues, scores, overall, grade, counts } = analysis;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestKey, bestScore] = ranked[0];
  const [worstKey, worstScore] = ranked.at(-1);
  const lh = lighthouse.mobile && !lighthouse.mobile.error ? lighthouse.mobile : lighthouse.desktop && !lighthouse.desktop.error ? lighthouse.desktop : null;
  const lcp = lh?.metrics.find((m) => m.short === 'LCP');

  // ---- executive summary
  const parts = [];
  parts.push(`${host} scored ${overall}/100 (grade ${grade}) across ${plural(pages.length, 'page')} checked.`);
  parts.push(bestKey === worstKey
    ? `All areas scored about the same.`
    : `Its strongest area is ${CATEGORIES[bestKey].label.toLowerCase()} (${bestScore}/100) and its weakest is ${CATEGORIES[worstKey].label.toLowerCase()} (${worstScore}/100), which affects ${WHY_AREA[worstKey]}.`);
  if (lh?.scores.performance !== null && lh?.scores.performance !== undefined) {
    parts.push(`On ${lh.formFactor}, Google Lighthouse rates performance ${lh.scores.performance}/100${lcp ? `, with the main content appearing after ${lcp.display}` : ''}.`);
  }
  if (counts.critical) parts.push(`There ${counts.critical === 1 ? 'is' : 'are'} ${plural(counts.critical, 'critical problem')} that should be fixed straight away.`);
  else if (counts.high) parts.push(`There are no critical problems, but ${plural(counts.high, 'high-priority issue')} would make a noticeable difference once fixed.`);
  else if (issues.length) parts.push('There are no serious problems; the remaining issues are refinements.');
  else parts.push('No issues were found.');

  // ---- priorities: most severe first, preferring different areas so the list isn't all one category
  const priorities = [];
  const usedCats = new Map();
  for (const i of issues) {
    if (priorities.length >= 5) break;
    if ((usedCats.get(i.category) || 0) >= 2 && issues.length > 6) continue;
    usedCats.set(i.category, (usedCats.get(i.category) || 0) + 1);
    priorities.push({
      title: i.title,
      why_it_matters: i.description,
      how_to_fix: i.fix,
      impact: impactOf(i.severity),
      effort: effortOf(i.id),
    });
  }

  // ---- quick wins: low-effort fixes not already listed as priorities
  const priorityTitles = new Set(priorities.map((p) => p.title));
  const quickWins = issues
    .filter((i) => effortOf(i.id) === 'low' && !priorityTitles.has(i.title))
    .slice(0, 5)
    // First sentence of the fix; don't split on abbreviations like "e.g." or "i.e.".
    .map((i) => `${i.title}: ${i.fix.split(/(?<!\b(?:e\.g|i\.e|etc))\.\s+(?=[A-Z])/)[0].replace(/\.$/, '')}.`);

  // ---- client email
  const topThree = priorities.slice(0, 3).map((p) => `- ${p.title}`).join('\n');

  // Praise only clear, headline wins, and never something that contradicts an open issue
  // (e.g. "descriptions are a good length" while a page has no description at all).
  const openCats = new Set(issues.filter((i) => i.severity !== 'low').map((i) => i.category));
  const HEADLINE = /HTTPS|SSL certificate|performance score|No broken links|loaded successfully|alt attributes|mobile-friendly|No JavaScript errors|Fast server/i;
  const good = analysis.passed
    .filter((p) => HEADLINE.test(p.title) && !/good length/i.test(p.title))
    .sort((a, b) => Number(openCats.has(a.category)) - Number(openCats.has(b.category)))
    .slice(0, 3)
    .map((p) => p.title.charAt(0).toLowerCase() + p.title.slice(1));

  const AREA_BENEFIT = {
    performance: 'how quickly pages load',
    seo: 'how the site appears on Google',
    accessibility: 'how easy the site is for every visitor to use',
    security: 'how secure and trustworthy the site is for visitors',
    links: 'removing errors and dead ends for visitors',
  };
  const benefitAreas = [...new Set(priorities.slice(0, 3).map((p) => issues.find((i) => i.title === p.title)?.category))].filter(Boolean);
  const benefit = benefitAreas.length ? `Fixing these will improve ${list(benefitAreas.map((c) => AREA_BENEFIT[c]))}.` : '';
  const email = `Hi,

We've run a health check on ${host}, covering speed, search visibility (SEO), accessibility, security and broken links across ${plural(pages.length, 'page')}.

The site scored ${overall}/100 overall (grade ${grade}).${good.length ? ` The good news: ${list(good)}.` : ''}

${priorities.length ? `The areas we'd recommend looking at first are:\n${topThree}\n\n${counts.critical || counts.high ? benefit : `None of these are urgent, but ${benefit.charAt(0).toLowerCase()}${benefit.slice(1)}`} ` : ''}The full report is attached with details of each issue and where it appears.

We'd be happy to talk through the findings or take care of the fixes for you. Just reply to this email.

Kind regards`;

  return {
    executive_summary: parts.join(' '),
    top_priorities: priorities,
    quick_wins: quickWins,
    client_email: email,
    source: 'built-in',
  };
}
