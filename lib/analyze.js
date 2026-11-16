/**
 * Turns raw crawl/Lighthouse/site data into a prioritised list of issues,
 * passed checks, and 0–100 scores per category.
 */

export const CATEGORIES = {
  performance: { label: 'Performance', weight: 25 },
  seo: { label: 'SEO', weight: 25 },
  accessibility: { label: 'Accessibility', weight: 20 },
  security: { label: 'Security', weight: 15 },
  links: { label: 'Links & Content', weight: 15 },
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const DEDUCTION = { critical: 25, high: 12, medium: 6, low: 2 };
const AXE_SEVERITY = { critical: 'critical', serious: 'high', moderate: 'medium', minor: 'low' };
// Axe rules we already report in more detail ourselves.
const AXE_SKIP = new Set(['image-alt', 'html-has-lang', 'heading-order']);

const MAX_AFFECTED = 100;
const CORE_VITALS_FIELD = ['LCP', 'INP', 'CLS'];
const KB = 1024;

export function analyze({ startUrl, site, lighthouse, pages, linkResults, fieldData }) {
  const issues = [];
  const passed = [];
  const okPages = pages.filter((p) => !p.error && p.status > 0 && p.status < 400 && /html/i.test(p.contentType || 'text/html'));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const add = (id, category, severity, title, description, fix, affected = []) => {
    issues.push({ id, category, severity, title, description, fix, affected: affected.slice(0, MAX_AFFECTED), count: affected.length || 1 });
  };
  const pass = (category, title) => passed.push({ category, title });

  /** Check every page; add one issue listing the failing pages, or record a pass. */
  const perPage = (id, category, severity, test, title, description, fix, passTitle) => {
    const affected = okPages.map((p) => ({ url: p.finalUrl, detail: test(p) })).filter((a) => a.detail);
    if (affected.length) add(id, category, severity, typeof title === 'function' ? title(affected.length) : title, description, fix, affected);
    else if (passTitle && okPages.length) pass(category, passTitle);
  };

  // ------------------------------------------------------------ Page availability
  const failedPages = pages.filter((p) => p.error || p.status >= 400 || p.status === 0);
  if (failedPages.length) {
    const start = failedPages.find((p) => p.url === startUrl);
    add('page-errors', 'links', start ? 'critical' : 'high', `${plural(failedPages.length, 'page')} failed to load`,
      'These pages returned an error status or could not be loaded. Visitors and search engines see an error instead of content.',
      'Check the server logs, fix or redirect (301) removed pages, and update any links pointing at them.',
      failedPages.map((p) => ({ url: p.url, detail: p.error || `HTTP ${p.status}` })));
  } else pass('links', 'All crawled pages loaded successfully');

  // ------------------------------------------------------------ SEO
  perPage('title-missing', 'seo', 'high', (p) => !p.title && 'No <title> tag',
    (n) => `${plural(n, 'page')} missing a page title`,
    'The title is the clickable headline in Google results and the browser tab text. Without one, search engines guess.',
    'Add a unique, descriptive <title> of about 30–60 characters to every page (most SEO plugins, e.g. Yoast or Rank Math, do this).',
    'Every page has a title');

  perPage('title-length', 'seo', 'low', (p) => p.title && (p.title.length > 60 ? `${p.title.length} chars (too long): "${p.title}"` : p.title.length < 20 ? `${p.title.length} chars (too short): "${p.title}"` : null),
    (n) => `${plural(n, 'title')} too long or too short`,
    'Google shows roughly the first 60 characters of a title. Long titles get cut off; very short ones waste the space.',
    'Keep titles between 20 and 60 characters, with the main keyword near the start and the brand name at the end.',
    'Page titles are a good length');

  perPage('meta-description-missing', 'seo', 'medium', (p) => !p.metaDescription && 'No meta description',
    (n) => `${plural(n, 'page')} missing a meta description`,
    'The meta description is the summary under the title in search results. Without it Google picks random text from the page, which lowers click-through rate.',
    'Write a unique 70–160 character description for each page that summarises it and encourages the click.',
    'Every page has a meta description');

  perPage('meta-description-length', 'seo', 'low', (p) => p.metaDescription && (p.metaDescription.length > 160 ? `${p.metaDescription.length} chars (too long)` : p.metaDescription.length < 70 ? `${p.metaDescription.length} chars (too short)` : null),
    (n) => `${plural(n, 'meta description')} outside the ideal length`,
    'Descriptions over ~160 characters are truncated in results; under ~70 characters they underuse the space.',
    'Rewrite them to 70–160 characters.', 'Meta descriptions are a good length');

  duplicates('title', 'duplicate-titles', 'Duplicate page titles', 'medium',
    'Several pages share the same title, so search engines struggle to tell which page to rank for a query.', 'Give every page its own title that describes that page specifically.');
  duplicates('metaDescription', 'duplicate-descriptions', 'Duplicate meta descriptions', 'low',
    'Several pages share the same meta description.', 'Write a unique description for each page.');

  perPage('h1-missing', 'seo', 'medium', (p) => !p.headings.some((h) => h.level === 1) && 'No visible <h1>',
    (n) => `${plural(n, 'page')} without an H1 heading`,
    'The H1 is the main heading. It tells visitors and search engines what the page is about.',
    'Add exactly one H1 per page containing the page\'s main topic.', 'Every page has an H1 heading');

  perPage('h1-multiple', 'seo', 'low', (p) => { const n = p.headings.filter((h) => h.level === 1).length; return n > 1 && `${n} H1 headings`; },
    (n) => `${plural(n, 'page')} with more than one H1`,
    'Multiple H1s dilute the main topic of the page and confuse the heading structure.',
    'Keep one H1 and change the others to H2 or H3.');

  perPage('heading-skip', 'accessibility', 'low', (p) => {
    for (let i = 1; i < p.headings.length; i++) {
      if (p.headings[i].level - p.headings[i - 1].level > 1) return `H${p.headings[i - 1].level} → H${p.headings[i].level} ("${p.headings[i].text}")`;
    }
    return null;
  }, (n) => `Heading levels skipped on ${plural(n, 'page')}`,
  'Jumping from e.g. H2 straight to H4 breaks the outline that screen-reader users navigate by.',
  'Use headings in order (H1 → H2 → H3). Style them with CSS instead of picking a level for its size.', 'Heading structure is in logical order');

  perPage('noindex', 'seo', 'high', (p) => (/noindex/i.test(p.metaRobots) || /noindex/i.test(p.xRobotsTag)) && `robots: ${p.metaRobots || p.xRobotsTag}`,
    (n) => `${plural(n, 'page')} blocked from Google (noindex)`,
    'These pages tell search engines not to index them, so they will not appear in search results. This is often left on by mistake after a site launch.',
    'Remove "noindex" unless the page should stay hidden. In WordPress, untick Settings → Reading → "Discourage search engines".', 'No pages are accidentally hidden from search engines');

  perPage('canonical-missing', 'seo', 'low', (p) => !p.canonical && 'No canonical link',
    (n) => `${plural(n, 'page')} without a canonical URL`,
    'A canonical tag tells search engines which version of a URL is the "real" one, avoiding duplicate-content problems (www vs non-www, URL parameters).',
    'Add <link rel="canonical" href="..."> pointing to the preferred URL of each page.', 'Canonical URLs are set');

  perPage('lang-missing', 'accessibility', 'medium', (p) => !p.lang && 'No lang attribute on <html>',
    (n) => `${plural(n, 'page')} missing the language attribute`,
    'Screen readers use the lang attribute to pronounce content correctly, and search engines use it for language targeting.',
    'Add lang="en-GB" (or the right language) to the <html> tag.', 'Page language is declared');

  perPage('viewport-missing', 'seo', 'high', (p) => !p.viewport && 'No viewport meta tag',
    (n) => `${plural(n, 'page')} not set up for mobile`,
    'Without a viewport tag, phones show a zoomed-out desktop page. Google uses mobile-first indexing, so this hurts rankings.',
    'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.', 'Pages are mobile-friendly (viewport set)');

  perPage('og-missing', 'seo', 'low', (p) => { const m = ['title', 'description', 'image'].filter((k) => !p.og?.[k]); return m.length && `Missing og:${m.join(', og:')}`; },
    (n) => `${plural(n, 'page')} missing social sharing tags`,
    'Open Graph tags control the title, description and image shown when a page is shared on Facebook, LinkedIn, WhatsApp, etc.',
    'Add og:title, og:description and og:image (1200×630px) to every page; SEO plugins can do this automatically.', 'Social sharing (Open Graph) tags are set');

  perPage('thin-content', 'seo', 'low', (p) => p.wordCount < 250 && `${p.wordCount} words`,
    (n) => `${plural(n, 'page')} with thin content`,
    'Pages with very little text give search engines little to understand or rank.',
    'Where it makes sense, expand key pages to 300+ words of useful, original content.');

  if (okPages.length) {
    if (okPages.some((p) => p.jsonLd?.length)) pass('seo', 'Structured data (schema.org) found');
    else add('no-structured-data', 'seo', 'low', 'No structured data (schema markup)',
      'Structured data helps Google show rich results such as star ratings, business details, FAQs and breadcrumbs.',
      'Add JSON-LD schema, e.g. LocalBusiness or Organization on the home page, and Article/Product/FAQ where relevant.');
    if (okPages.some((p) => p.jsonLd?.includes('Invalid JSON-LD'))) {
      add('invalid-structured-data', 'seo', 'medium', 'Invalid structured data',
        'Some JSON-LD blocks could not be parsed, so search engines will ignore them.',
        'Validate the markup with Google\'s Rich Results Test and fix the JSON syntax.',
        okPages.filter((p) => p.jsonLd?.includes('Invalid JSON-LD')).map((p) => ({ url: p.finalUrl, detail: 'JSON-LD parse error' })));
    }
  }

  perPage('favicon-missing', 'seo', 'low', (p) => p.finalUrl === okPages[0]?.finalUrl && !p.favicon && 'No favicon link',
    'No favicon found', 'The favicon appears in browser tabs, bookmarks and Google mobile results.',
    'Add a favicon (e.g. <link rel="icon" href="/favicon.png">); WordPress: Appearance → Customize → Site Identity.', 'Favicon is set');

  // Site-level SEO
  if (!site.robots.found) add('robots-missing', 'seo', 'low', 'No robots.txt file',
    'robots.txt tells search engines what they can crawl and where the sitemap is.',
    'Create /robots.txt allowing crawling and listing the sitemap URL.');
  else if (site.robots.blocksAll) add('robots-blocks-all', 'seo', 'critical', 'robots.txt blocks the entire site',
    'robots.txt contains "Disallow: /" for all crawlers, so search engines are told not to crawl any page.',
    'Remove the "Disallow: /" rule (unless this is a staging site).');
  else pass('seo', 'robots.txt found and allows crawling');

  if (!site.sitemap.found) add('sitemap-missing', 'seo', 'medium', 'No XML sitemap found',
    'A sitemap lists all pages so search engines can find them faster.',
    'Generate a sitemap (WordPress creates /wp-sitemap.xml; Yoast/Rank Math create /sitemap_index.xml), list it in robots.txt and submit it in Google Search Console.');
  else pass('seo', `XML sitemap found (${site.sitemap.urlCount} URLs)`);

  // ------------------------------------------------------------ Accessibility
  {
    const affected = okPages.flatMap((p) => p.images.filter((i) => i.alt === null && i.visible).map((i) => ({ url: p.finalUrl, detail: i.src })));
    if (affected.length) add('img-alt-missing', 'accessibility', 'high', `${plural(affected.length, 'image')} missing alt text`,
      'Screen readers cannot describe these images to blind users, and search engines cannot understand them. Missing alt text is also a common WCAG failure.',
      'Add an alt attribute describing each image. Use alt="" only for purely decorative images.', affected);
    else if (okPages.length) pass('accessibility', 'All images have alt attributes');
  }

  // Merge axe violations across pages by rule.
  const axeByRule = new Map();
  for (const p of okPages) {
    for (const v of p.axe?.violations ?? []) {
      if (AXE_SKIP.has(v.id)) continue;
      const entry = axeByRule.get(v.id) || { ...v, affected: [], total: 0 };
      entry.total += v.nodes;
      for (const s of v.samples) entry.affected.push({ url: p.finalUrl, detail: s.target, html: s.html });
      axeByRule.set(v.id, entry);
    }
  }
  for (const v of axeByRule.values()) {
    add(`axe-${v.id}`, 'accessibility', AXE_SEVERITY[v.impact] || 'low', `${v.help} (${plural(v.total, 'element')})`,
      v.description, `See how to fix it: ${v.helpUrl}`, v.affected);
  }
  if (okPages.length && axeByRule.size === 0 && okPages.some((p) => p.axe && !p.axe.error)) pass('accessibility', 'No automated WCAG violations detected');

  // ------------------------------------------------------------ Performance
  const lhMain = lighthouse.mobile && !lighthouse.mobile.error ? lighthouse.mobile : lighthouse.desktop && !lighthouse.desktop.error ? lighthouse.desktop : null;
  if (lhMain) {
    const perf = lhMain.scores.performance;
    const label = lhMain.formFactor === 'mobile' ? 'mobile' : 'desktop';
    if (perf !== null && perf < 50) add('lh-performance-poor', 'performance', 'high', `Poor ${label} performance score (${perf}/100)`,
      'The home page loads slowly. Slow pages lose visitors (53% of mobile users leave after 3 seconds) and rank lower on Google.',
      'Work through the Lighthouse opportunities below, starting with the largest savings.');
    else if (perf !== null && perf < 90) add('lh-performance-ok', 'performance', 'medium', `${label[0].toUpperCase() + label.slice(1)} performance needs improvement (${perf}/100)`,
      'The home page performance is average. Improving it will help both user experience and rankings.', 'See the Lighthouse opportunities below for specific fixes.');
    else if (perf !== null) pass('performance', `Excellent ${label} performance score (${perf}/100)`);

    const m = Object.fromEntries(lhMain.metrics.map((x) => [x.short, x]));
    const cwv = [
      ['LCP', 2500, 4000, 'Largest Contentful Paint', 'how long the main content takes to appear', 'Optimise and preload the hero image, use a CDN, reduce server response time and remove render-blocking CSS/JS.'],
      ['CLS', 0.1, 0.25, 'Cumulative Layout Shift', 'how much the layout jumps around while loading', 'Set width/height on images and embeds, reserve space for ads/banners and avoid inserting content above existing content.'],
      ['TBT', 200, 600, 'Total Blocking Time', 'how long the page is frozen by JavaScript', 'Remove unused plugins/scripts, defer non-critical JavaScript and split large bundles.'],
    ];
    for (const [key, good, poor, name, what, fix] of cwv) {
      const metric = m[key];
      if (!metric || metric.value === null) continue;
      if (metric.value > poor) add(`cwv-${key.toLowerCase()}`, 'performance', 'high', `${name} is poor (${metric.display})`, `${name} measures ${what}. It is a Google Core Web Vital.`, fix);
      else if (metric.value > good) add(`cwv-${key.toLowerCase()}`, 'performance', 'medium', `${name} needs improvement (${metric.display})`, `${name} measures ${what}. It is a Google Core Web Vital.`, fix);
      else pass('performance', `${name} is good (${metric.display})`);
    }

    for (const o of lhMain.opportunities.slice(0, 6)) {
      add(`lh-${o.id}`, 'performance', o.savingsMs >= 1000 ? 'medium' : 'low',
        `${o.title}${o.savingsMs ? ` (save ~${(o.savingsMs / 1000).toFixed(1)}s)` : o.savingsBytes ? ` (save ~${Math.round(o.savingsBytes / KB)} KB)` : ''}`,
        o.description, 'Lighthouse estimates this change would make the page load faster.');
    }
  }

  {
    const big = okPages.flatMap((p) => p.images.filter((i) => i.bytes > 200 * KB).map((i) => ({ url: p.finalUrl, detail: `${Math.round(i.bytes / KB)} KB: ${i.src}`, bytes: i.bytes })))
      .sort((a, b) => b.bytes - a.bytes);
    const uniqueBig = [...new Map(big.map((b) => [b.detail, b])).values()];
    if (uniqueBig.length) add('large-images', 'performance', uniqueBig.some((b) => b.bytes > 1024 * KB) ? 'high' : 'medium', `${plural(uniqueBig.length, 'image')} larger than 200 KB`,
      'Large images are the most common cause of slow websites, especially on mobile data.',
      'Compress and resize images (e.g. to max 1920px wide), and convert them to WebP/AVIF. Plugins like ShortPixel or Imagify can do this automatically.', uniqueBig);
    else if (okPages.length) pass('performance', 'No oversized images (all under 200 KB)');

    const oversized = okPages.flatMap((p) => p.images.filter((i) => i.visible && i.displayWidth > 0 && i.naturalWidth > i.displayWidth * 2.5 && i.naturalWidth > 800)
      .map((i) => ({ url: p.finalUrl, detail: `${i.naturalWidth}px served, shown at ${i.displayWidth}px: ${i.src}` })));
    if (oversized.length) add('images-oversized-dimensions', 'performance', 'low', `${plural(oversized.length, 'image')} much wider than displayed`,
      'These images are downloaded at far higher resolution than they are shown, wasting bandwidth.',
      'Serve appropriately sized images using srcset/sizes, or resize them before uploading.', oversized);

    const noDims = okPages.flatMap((p) => p.images.filter((i) => i.visible && !i.hasDimensions).map((i) => ({ url: p.finalUrl, detail: i.src })));
    if (noDims.length) add('images-no-dimensions', 'performance', 'low', `${plural(noDims.length, 'image')} without width/height`,
      'Images without dimensions make the layout jump as they load (layout shift).', 'Add width and height attributes to <img> tags.', noDims);

    const noLazy = okPages.flatMap((p) => p.images.filter((i) => i.visible && !i.aboveFold && i.loading !== 'lazy').map((i) => ({ url: p.finalUrl, detail: i.src })));
    if (noLazy.length > 3) add('images-not-lazy', 'performance', 'low', `${plural(noLazy.length, 'below-the-fold image')} not lazy-loaded`,
      'Images further down the page are downloaded straight away, slowing the initial load.', 'Add loading="lazy" to images below the fold (but not to the hero image).', noLazy);

    const heavy = okPages.filter((p) => p.transferBytes > 3 * 1024 * KB).map((p) => ({ url: p.finalUrl, detail: `${(p.transferBytes / 1024 / KB).toFixed(1)} MB` }));
    if (heavy.length) add('heavy-pages', 'performance', 'medium', `${plural(heavy.length, 'page')} heavier than 3 MB`,
      'Heavy pages are slow on mobile networks and use up visitors\' data.', 'Compress images, remove unused scripts/plugins and enable text compression (gzip/brotli).', heavy);

    const slow = okPages.filter((p) => p.timing?.ttfb > 800).map((p) => ({ url: p.finalUrl, detail: `Server response ${p.timing.ttfb} ms` }));
    if (slow.length) add('slow-server', 'performance', 'medium', `Slow server response on ${plural(slow.length, 'page')}`,
      'The server takes over 800 ms to start sending the page, before anything else can load.', 'Enable page caching (e.g. WP Rocket, LiteSpeed Cache), use a CDN, or upgrade hosting.', slow);
    else if (okPages.length) pass('performance', 'Fast server response times');
  }

  if (site.headers.checked && !site.headers.compression) add('no-compression', 'performance', 'medium', 'Text compression not enabled',
    'The HTML is sent uncompressed. Gzip or Brotli typically shrinks it by 70%.', 'Enable gzip/Brotli compression on the server or CDN.');
  else if (site.headers.compression) pass('performance', `Text compression enabled (${site.headers.compression})`);

  // ------------------------------------------------------------ Links & content
  const linkSources = new Map(); // href -> [{page, text, internal}]
  for (const p of okPages) {
    for (const [kind, list] of [['internal', p.links.internal], ['external', p.links.external]]) {
      for (const l of list) {
        if (!linkSources.has(l.href)) linkSources.set(l.href, []);
        linkSources.get(l.href).push({ page: p.finalUrl, text: l.text, kind });
      }
    }
  }
  const brokenInternal = [], brokenExternal = [], redirects = [];
  for (const [href, sources] of linkSources) {
    const r = linkResults[href];
    if (!r) continue;
    const kind = sources[0].kind;
    if (!r.ok) {
      for (const s of sources.slice(0, 5)) (kind === 'internal' ? brokenInternal : brokenExternal).push({ url: s.page, detail: `[${r.status}] ${href}${s.text ? ` ("${s.text}")` : ''}`, target: href, status: r.status, text: s.text });
    } else if (r.redirectedTo && kind === 'internal') {
      redirects.push({ url: sources[0].page, detail: `${href} → ${r.redirectedTo}` });
    }
  }
  if (brokenInternal.length) add('broken-internal-links', 'links', 'high', `${plural(new Set(brokenInternal.map((b) => b.target)).size, 'broken internal link')}`,
    'Links to pages on your own site that return an error. Visitors hit dead ends and search engines waste crawl budget.',
    'Fix the link URL, restore the page, or add a 301 redirect to the right page.', brokenInternal);
  if (brokenExternal.length) add('broken-external-links', 'links', 'medium', `${plural(new Set(brokenExternal.map((b) => b.target)).size, 'broken external link')}`,
    'Links to other websites that no longer work. This looks unmaintained and frustrates visitors.',
    'Update the links to the correct address or remove them.', brokenExternal);
  if (!brokenInternal.length && !brokenExternal.length && linkSources.size) pass('links', `No broken links (${linkSources.size} checked)`);
  if (redirects.length) add('internal-redirects', 'links', 'low', `${plural(redirects.length, 'internal link')} go through a redirect`,
    'These links work but bounce through a redirect first, adding a little delay.', 'Update links to point straight at the final URL.', redirects);

  const brokenRes = okPages.flatMap((p) => p.failedResources.map((r) => ({ url: p.finalUrl, detail: `[${r.status}] ${r.type}: ${r.url}` })));
  if (brokenRes.length) add('broken-resources', 'links', 'high', `${plural(brokenRes.length, 'broken resource')} (images, scripts, styles)`,
    'Files the page tries to load but fail: broken images, missing scripts or stylesheets. These can break layout or features.',
    'Re-upload the missing files or remove the references from the theme/page.', brokenRes);
  else if (okPages.length) pass('links', 'All images, scripts and styles load correctly');

  const jsErrors = okPages.flatMap((p) => p.consoleErrors.map((e) => ({ url: p.finalUrl, detail: e })));
  if (jsErrors.length) add('console-errors', 'links', 'medium', `${plural(jsErrors.length, 'JavaScript error')} in the browser console`,
    'Errors in the page\'s JavaScript can break forms, menus, sliders or tracking without anyone noticing.',
    'Open the browser DevTools console on the affected pages, then fix or remove the failing script/plugin.', jsErrors);
  else if (okPages.length) pass('links', 'No JavaScript errors');

  // ------------------------------------------------------------ Real-visitor Core Web Vitals (optional, CrUX)
  if (fieldData?.available) {
    const where = fieldData.scope === 'page' ? 'on the home page' : 'across the site';
    const who = fieldData.formFactor === 'DESKTOP' ? 'desktop' : 'mobile';
    const FIX = {
      LCP: 'Optimise and preload the main image, use a CDN and caching, and reduce server response time.',
      INP: 'Reduce heavy JavaScript: remove unused plugins, break up long tasks and defer third-party scripts such as chat widgets and trackers.',
      CLS: 'Give images, videos, ads and embeds fixed dimensions and avoid inserting banners above existing content.',
    };
    for (const m of fieldData.metrics.filter((x) => CORE_VITALS_FIELD.includes(x.short))) {
      if (m.rating === 'good') continue;
      const pct = Math.round((m.distribution.good || 0) * 100);
      add(`field-${m.short.toLowerCase()}`, 'performance', m.rating === 'poor' ? 'high' : 'medium',
        `Real ${who} visitors: ${m.name} ${m.rating === 'poor' ? 'is poor' : 'needs improvement'} (${m.display})`,
        `Measured from real Chrome users ${where} over the last 28 days, which is the data Google uses for rankings. Only ${pct}% of visits had a good ${m.short}.`,
        FIX[m.short]);
    }
    if (fieldData.passesCoreWebVitals) pass('performance', `Passes Core Web Vitals for real ${who} visitors`);
  }

  // ------------------------------------------------------------ Security
  const { https, ssl, headers } = site;
  if (!https.usesHttps) add('no-https', 'security', 'critical', 'Site is not served over HTTPS',
    'Browsers mark the site "Not secure", data sent through forms is unencrypted and Google ranks it lower.',
    'Install an SSL certificate (free with Let\'s Encrypt; most hosts do it in one click) and redirect all HTTP traffic to HTTPS.');
  else {
    pass('security', 'Site uses HTTPS');
    if (!https.httpRedirectsToHttps) add('no-https-redirect', 'security', 'high', 'HTTP version does not redirect to HTTPS',
      'Visitors typing the address without https:// may land on an insecure version of the site.', 'Add a permanent 301 redirect from http:// to https:// (server config or a plugin like Really Simple SSL).');
    else pass('security', 'HTTP redirects to HTTPS');
  }
  if (ssl.checked) {
    if (!ssl.valid) add('ssl-invalid', 'security', 'critical', 'SSL certificate problem',
      `Browsers will show a security warning: ${ssl.error}.`, 'Renew or reinstall the certificate and make sure it covers this domain (including www).');
    else if (ssl.daysLeft !== null && ssl.daysLeft < 14) add('ssl-expiring', 'security', 'critical', `SSL certificate expires in ${ssl.daysLeft} days`,
      'When it expires, visitors see a full-page security warning.', 'Renew the certificate now and enable auto-renewal.');
    else if (ssl.daysLeft !== null && ssl.daysLeft < 30) add('ssl-expiring', 'security', 'high', `SSL certificate expires in ${ssl.daysLeft} days`,
      'Make sure it renews before then.', 'Check that auto-renewal is working.');
    else pass('security', `Valid SSL certificate (${ssl.daysLeft} days left, ${ssl.issuer})`);
  }

  const mixed = okPages.flatMap((p) => p.mixedContent.map((u) => ({ url: p.finalUrl, detail: u })));
  if (mixed.length) add('mixed-content', 'security', 'high', `${plural(mixed.length, 'insecure (http://) resource')} on HTTPS pages`,
    'Loading files over plain HTTP on a secure page triggers browser warnings or blocks the files.', 'Change the resource URLs to https:// (a search-and-replace on the database fixes most WordPress cases).', mixed);
  else if (https.usesHttps && okPages.length) pass('security', 'No mixed content');

  if (headers.checked) {
    const severity = { 'strict-transport-security': 'medium', 'content-security-policy': 'low', 'x-content-type-options': 'low', 'x-frame-options': 'medium', 'referrer-policy': 'low', 'permissions-policy': 'low' };
    for (const h of headers.list) {
      if (h.present) pass('security', `${h.name} header set`);
      else if (!(h.key === 'strict-transport-security' && !https.usesHttps)) {
        add(`header-${h.key}`, 'security', severity[h.key], `Missing ${h.name} header`, h.why,
          `Add the ${h.name} response header in the server config, .htaccess, CDN (e.g. Cloudflare) or a security plugin.`);
      }
    }
    if (headers.disclosure.length) add('server-disclosure', 'security', 'low', 'Server software version is exposed',
      `Response headers reveal: ${headers.disclosure.join('; ')}. This helps attackers target known vulnerabilities.`, 'Hide version numbers in the server configuration (e.g. ServerTokens Prod, expose_php = Off).');
  }

  // ------------------------------------------------------------ Scores
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count);
  const scores = scoreCategories(issues, lhMain);
  const overall = Math.round(Object.entries(CATEGORIES).reduce((s, [k, c]) => s + scores[k] * c.weight, 0) / 100);

  return {
    issues,
    passed,
    scores,
    overall,
    grade: overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 65 ? 'C' : overall >= 50 ? 'D' : 'F',
    counts: Object.fromEntries(Object.keys(SEVERITY_ORDER).map((s) => [s, issues.filter((i) => i.severity === s).length])),
  };

  function duplicates(field, id, title, severity, description, fix) {
    const groups = new Map();
    for (const p of okPages) if (p[field]) groups.set(p[field], [...(groups.get(p[field]) || []), p.finalUrl]);
    const affected = [...groups].filter(([, urls]) => urls.length > 1).flatMap(([value, urls]) => urls.map((u) => ({ url: u, detail: `"${value.slice(0, 90)}" (used on ${urls.length} pages)` })));
    if (affected.length) add(id, 'seo', severity, title, description, fix, affected);
  }
}

function scoreCategories(issues, lh) {
  const out = {};
  for (const cat of Object.keys(CATEGORIES)) {
    const deduction = issues.filter((i) => i.category === cat).reduce((s, i) => s + DEDUCTION[i.severity], 0);
    out[cat] = Math.max(0, 100 - deduction);
  }
  // Blend in Lighthouse's own scores where it measures the same thing.
  if (lh?.scores) {
    if (lh.scores.performance !== null) out.performance = Math.round(lh.scores.performance * 0.6 + out.performance * 0.4);
    if (lh.scores.accessibility !== null) out.accessibility = Math.round(lh.scores.accessibility * 0.5 + out.accessibility * 0.5);
    if (lh.scores.seo !== null) out.seo = Math.round(lh.scores.seo * 0.4 + out.seo * 0.6);
  }
  return out;
}

/** Compare against a previous audit of the same site. */
export function compareAudits(current, previous) {
  if (!previous) return null;
  const key = (i) => i.id;
  const prevIds = new Set(previous.analysis.issues.map(key));
  const curIds = new Set(current.issues.map(key));
  return {
    previousId: previous.id,
    previousDate: previous.createdAt,
    overallDelta: current.overall - previous.analysis.overall,
    scoreDeltas: Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, current.scores[k] - (previous.analysis.scores[k] ?? 0)])),
    fixed: previous.analysis.issues.filter((i) => !curIds.has(key(i))).map((i) => i.title),
    newIssues: current.issues.filter((i) => !prevIds.has(key(i))).map((i) => i.title),
  };
}
