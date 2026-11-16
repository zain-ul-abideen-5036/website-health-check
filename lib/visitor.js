/**
 * Open access without accounts or passwords.
 *
 * Every browser gets a random, anonymous visitor ID in an HttpOnly cookie. Audits are tagged with a
 * hash of that ID, so on a public deployment each visitor's History shows only their own audits and
 * only they can delete them. Report links stay shareable: anyone with the (unguessable) link can view one.
 *
 * A simple rate limit stops one visitor from running audits non-stop on a public deployment.
 */
import { randomBytes, createHash } from 'node:crypto';

const COOKIE = 'whc_visitor';
const ONE_YEAR = 60 * 60 * 24 * 365;
const SALT = process.env.VISITOR_SALT || 'website-health-check';

const readCookie = (req, name) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
};

/** Express middleware: sets req.visitor (a hash, never the cookie value itself). */
export function visitor(req, res, next) {
  let id = readCookie(req, COOKIE);
  if (!/^[a-f0-9]{32}$/.test(id || '')) {
    id = randomBytes(16).toString('hex');
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.append('Set-Cookie', `${COOKIE}=${id}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
  }
  req.visitor = createHash('sha256').update(`${SALT}:${id}`).digest('hex').slice(0, 24);
  next();
}

/** The caller's IP address (Vercel and most proxies put the real one first in X-Forwarded-For). */
export const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

/**
 * Sliding-window limit per key (IP address). In memory, so on a serverless platform it applies per
 * running instance: a speed bump against abuse, not a hard quota.
 */
export function createRateLimit({ max, windowMs }) {
  const hits = new Map();
  return {
    /** Returns null if allowed (and records the hit), or the number of minutes to wait. */
    take(key) {
      const now = Date.now();
      const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 60000));
      }
      recent.push(now);
      hits.set(key, recent);
      // Keep memory bounded.
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      return null;
    },
  };
}
