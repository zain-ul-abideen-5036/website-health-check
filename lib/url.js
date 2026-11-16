import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Accept "example.com" or a full URL; reject non-http(s) and private/local addresses. */
export async function normaliseUrl(input) {
  if (!input || typeof input !== 'string') throw new Error('Please enter a URL.');
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url;
  try { url = new URL(raw); } catch { throw new Error("That doesn't look like a valid URL."); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https URLs are supported.');
  if (!url.hostname.includes('.') && !isIP(url.hostname)) throw new Error("That doesn't look like a valid domain.");

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let address = host;
  if (!isIP(host)) {
    try { ({ address } = await lookup(host)); } catch { throw new Error(`Could not find the site "${host}". Check the spelling.`); }
  }
  if (isPrivateAddress(address)) throw new Error("Local and private network addresses can't be audited.");
  url.hash = '';
  return url.href;
}

export function isPrivateAddress(ip) {
  if (ip === '::1' || ip === '::' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip)) return true;
  const v4 = ip.replace(/^::ffff:/i, '').split('.').map(Number);
  if (v4.length !== 4) return false;
  const [a, b] = v4;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

const SKIP_EXT = /\.(pdf|zip|rar|7z|gz|tar|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|mp[34]|mov|avi|webm|wav|ogg|docx?|xlsx?|pptx?|csv|txt|xml|json|exe|dmg|apk|woff2?|ttf|eot|css|js)$/i;

/** Canonical form used to de-duplicate crawl targets. */
export function crawlKey(href) {
  const u = new URL(href);
  u.hash = '';
  // Drop common tracking params so ?utm_source=x isn't crawled as a new page.
  for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(p)) u.searchParams.delete(p);
  // "/about/index.html" and "/about/" are the same page.
  let path = u.pathname.replace(/\/(index|default)\.(html?|php|aspx?)$/i, '/').replace(/\/+$/, '') || '/';
  return `${u.protocol}//${u.host.toLowerCase().replace(/^www\./, '')}${path}${u.search}`;
}

export function isCrawlable(href, origin) {
  try {
    const u = new URL(href);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const strip = (h) => h.toLowerCase().replace(/^www\./, '');
    if (strip(u.hostname) !== strip(new URL(origin).hostname)) return false;
    if (SKIP_EXT.test(u.pathname)) return false;
    if (/\/(wp-admin|wp-login|cart|checkout|my-account|login|logout|feed)\b/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}
