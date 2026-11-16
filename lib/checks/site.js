import tls from 'node:tls';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 WebsiteHealthCheck';

async function get(url, opts = {}) {
  return fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: opts.redirect ?? 'follow',
    method: opts.method ?? 'GET',
    signal: AbortSignal.timeout(opts.timeout ?? 12000),
  });
}

/** Site-wide checks that don't need a browser: robots.txt, sitemap, HTTPS, SSL, security headers. */
export async function runSiteChecks(startUrl) {
  const url = new URL(startUrl);
  const [robots, https, ssl, headers] = await Promise.all([
    checkRobots(url.origin),
    checkHttpsRedirect(url),
    url.protocol === 'https:' ? checkCertificate(url.hostname) : Promise.resolve({ checked: false }),
    checkHeaders(startUrl),
  ]);
  const sitemap = await checkSitemap(url.origin, robots.sitemaps);
  return { robots, sitemap, https, ssl, headers };
}

async function checkRobots(origin) {
  try {
    const res = await get(`${origin}/robots.txt`);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || type.includes('text/html')) return { found: false, sitemaps: [] };
    const text = (await res.text()).slice(0, 200_000);

    // Does the "User-agent: *" group block the whole site?
    let inStarGroup = false, blocksAll = false;
    const sitemaps = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split('#')[0].trim();
      const [k, ...rest] = line.split(':');
      const key = k?.toLowerCase().trim();
      const value = rest.join(':').trim();
      if (key === 'user-agent') inStarGroup = value === '*';
      else if (key === 'disallow' && inStarGroup && value === '/') blocksAll = true;
      else if (key === 'sitemap' && value) sitemaps.push(value);
    }
    return { found: true, blocksAll, sitemaps, size: text.length };
  } catch {
    return { found: false, sitemaps: [] };
  }
}

async function checkSitemap(origin, fromRobots = []) {
  const candidates = [...fromRobots, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const res = await get(candidate);
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 5_000_000);
      if (!/<(urlset|sitemapindex)\b/i.test(xml)) continue;

      let urls = locs(xml);
      const isIndex = /<sitemapindex\b/i.test(xml);
      if (isIndex) {
        // Follow up to 3 child sitemaps to collect page URLs for crawling.
        const children = urls.slice(0, 3);
        urls = [];
        for (const child of children) {
          try {
            const c = await get(child);
            if (c.ok) urls.push(...locs(await c.text()));
          } catch { /* skip */ }
        }
      }
      return { found: true, url: candidate, isIndex, urlCount: urls.length, urls: urls.slice(0, 500) };
    } catch { /* try next */ }
  }
  return { found: false, urls: [] };
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map((m) => m[1].trim());

async function checkHttpsRedirect(url) {
  const httpUrl = `http://${url.host}${url.pathname}`;
  try {
    const res = await get(httpUrl);
    return { usesHttps: url.protocol === 'https:', httpRedirectsToHttps: res.url.startsWith('https://') };
  } catch {
    // HTTP port closed entirely: fine as long as the site is served over HTTPS.
    return { usesHttps: url.protocol === 'https:', httpRedirectsToHttps: url.protocol === 'https:', httpUnavailable: true };
  }
}

function checkCertificate(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      resolve({
        checked: true,
        valid: socket.authorized,
        error: socket.authorized ? null : String(socket.authorizationError),
        issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
        subject: cert.subject?.CN || hostname,
        validFrom: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
        validTo: validTo?.toISOString() ?? null,
        daysLeft: validTo ? Math.floor((validTo - Date.now()) / 86_400_000) : null,
        protocol: socket.getProtocol(),
      });
      socket.end();
    });
    socket.on('error', (err) => resolve({ checked: true, valid: false, error: err.message }));
    socket.on('timeout', () => { socket.destroy(); resolve({ checked: true, valid: false, error: 'Connection timed out' }); });
  });
}

const SECURITY_HEADERS = [
  { key: 'strict-transport-security', name: 'Strict-Transport-Security (HSTS)', why: 'Forces browsers to always use HTTPS.' },
  { key: 'content-security-policy', name: 'Content-Security-Policy', why: 'Limits which scripts can run, reducing XSS risk.' },
  { key: 'x-content-type-options', name: 'X-Content-Type-Options', why: 'Stops browsers guessing file types (MIME sniffing).' },
  { key: 'x-frame-options', name: 'X-Frame-Options', why: 'Prevents the site being embedded to trick users (clickjacking).' },
  { key: 'referrer-policy', name: 'Referrer-Policy', why: 'Controls how much URL data is shared with other sites.' },
  { key: 'permissions-policy', name: 'Permissions-Policy', why: 'Restricts access to camera, microphone, location, etc.' },
];

async function checkHeaders(url) {
  try {
    const res = await get(url);
    res.body?.cancel().catch(() => {});
    const h = res.headers;
    const csp = h.get('content-security-policy') || '';
    const list = SECURITY_HEADERS.map((s) => {
      let value = h.get(s.key);
      // CSP frame-ancestors is the modern replacement for X-Frame-Options.
      if (!value && s.key === 'x-frame-options' && /frame-ancestors/i.test(csp)) value = 'via CSP frame-ancestors';
      return { ...s, present: Boolean(value), value: value || null };
    });
    const server = h.get('server');
    const poweredBy = h.get('x-powered-by');
    return {
      checked: true,
      status: res.status,
      list,
      disclosure: [server && /\d/.test(server) ? `Server: ${server}` : null, poweredBy ? `X-Powered-By: ${poweredBy}` : null].filter(Boolean),
      compression: h.get('content-encoding') || null,
      cacheControl: h.get('cache-control') || null,
    };
  } catch (err) {
    return { checked: false, error: err.message, list: [], disclosure: [] };
  }
}
