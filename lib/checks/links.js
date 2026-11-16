const TIMEOUT_MS = 12000;
const CONCURRENCY = 8;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 WebsiteHealthCheck';

// Sites that block bots with odd status codes. Their links are reported as "unverified", never "broken".
const BOT_BLOCK_STATUS = new Set([999, 429, 403]);
const BOT_BLOCK_HOSTS = /(linkedin|instagram|facebook|twitter|x\.com|tiktok|pinterest)\./i;

/**
 * Check every unique URL once (results are shared across all pages that link to it).
 * @param {string[]} urls
 * @param {(done:number,total:number)=>void} onProgress
 * @returns {Promise<Map<string,{status:number|string, ok:boolean, unverified?:boolean, redirectedTo?:string}>>}
 */
export async function checkUrls(urls, onProgress = () => {}) {
  const unique = [...new Set(urls)];
  const results = new Map();
  let i = 0, done = 0;

  async function worker() {
    while (i < unique.length) {
      const url = unique[i++];
      results.set(url, await checkOne(url));
      done++;
      if (done % 5 === 0 || done === unique.length) onProgress(done, unique.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length || 1) }, worker));
  return results;
}

/** Network errors are often transient (rate limiting, connection resets): retry before calling a link broken. */
async function checkOne(url) {
  let result = await attempt(url);
  for (let retry = 1; retry <= 2 && !result.ok && typeof result.status === 'string' && result.status !== 'DNS not found'; retry++) {
    await new Promise((r) => setTimeout(r, 700 * retry));
    result = await attempt(url);
  }
  return result;
}

async function attempt(url) {
  const request = async (method) => {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    res.body?.cancel().catch(() => {});
    return res;
  };

  try {
    let res = await request('HEAD');
    // Many servers mishandle HEAD: retry with GET before deciding anything.
    if (res.status >= 400) res = await request('GET');

    const redirectedTo = res.redirected && stripSlash(res.url) !== stripSlash(url) ? res.url : undefined;
    if (res.status < 400) return { status: res.status, ok: true, redirectedTo };

    if (BOT_BLOCK_STATUS.has(res.status) && (BOT_BLOCK_HOSTS.test(url) || res.status !== 403)) {
      return { status: res.status, ok: true, unverified: true };
    }
    return { status: res.status, ok: false };
  } catch (err) {
    const status = err.name === 'TimeoutError' ? 'Timeout'
      : /certificate|SSL|TLS/i.test(err.cause?.message || err.message) ? 'SSL error'
      : /ENOTFOUND|EAI_AGAIN/.test(err.cause?.code || '') ? 'DNS not found'
      : 'Unreachable';
    return { status, ok: false };
  }
}

const stripSlash = (u) => u.replace(/\/+$/, '');
