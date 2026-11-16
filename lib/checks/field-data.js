/**
 * Optional real-visitor speed data from the Chrome UX Report (CrUX).
 * Free: needs a Google Cloud API key (no billing), set as GOOGLE_API_KEY or CRUX_API_KEY.
 * Lighthouse measures one lab load; CrUX is what real Chrome users experienced over the last 28 days,
 * and it is the data Google actually uses for its Core Web Vitals ranking signal.
 */
const ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

export const fieldDataKey = () => process.env.GOOGLE_API_KEY || process.env.CRUX_API_KEY || '';
export const fieldDataEnabled = () => Boolean(fieldDataKey());

// [CrUX metric name(s), short label, full name, good threshold, poor threshold, unit]
const METRICS = [
  [['largest_contentful_paint'], 'LCP', 'Largest Contentful Paint', 2500, 4000, 'ms'],
  [['interaction_to_next_paint'], 'INP', 'Interaction to Next Paint', 200, 500, 'ms'],
  [['cumulative_layout_shift'], 'CLS', 'Cumulative Layout Shift', 0.1, 0.25, ''],
  [['first_contentful_paint'], 'FCP', 'First Contentful Paint', 1800, 3000, 'ms'],
  [['time_to_first_byte', 'experimental_time_to_first_byte'], 'TTFB', 'Time to First Byte', 800, 1800, 'ms'],
];
export const CORE_VITALS = ['LCP', 'INP', 'CLS'];

async function query(body, key) {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 404) return null; // not enough real-user traffic for this URL/origin
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `CrUX API returned ${res.status}`);
  return data.record;
}

const fmtDate = (d) => (d ? new Date(Date.UTC(d.year, d.month - 1, d.day)).toISOString().slice(0, 10) : null);

function parse(record, scope, formFactor) {
  const metrics = [];
  for (const [names, short, name, good, poor, unit] of METRICS) {
    const m = names.map((n) => record.metrics?.[n]).find(Boolean);
    if (!m) continue;
    const p75 = Number(m.percentiles?.p75);
    if (Number.isNaN(p75)) continue;
    const hist = (m.histogram || []).map((b) => Number(b.density) || 0);
    metrics.push({
      short, name, p75, good, poor,
      display: unit === 'ms' ? (p75 < 1000 ? `${Math.round(p75)} ms` : `${(p75 / 1000).toFixed(1)} s`) : p75.toFixed(2),
      rating: p75 <= good ? 'good' : p75 <= poor ? 'needs-improvement' : 'poor',
      distribution: { good: hist[0] ?? 0, needsImprovement: hist[1] ?? 0, poor: hist[2] ?? 0 },
    });
  }
  const core = metrics.filter((m) => CORE_VITALS.includes(m.short));
  return {
    scope, // 'page' (this exact URL) or 'origin' (whole site)
    formFactor,
    period: { from: fmtDate(record.collectionPeriod?.firstDate), to: fmtDate(record.collectionPeriod?.lastDate) },
    metrics,
    // Google's rule: a page passes when LCP, INP and CLS are all "good" at the 75th percentile.
    passesCoreWebVitals: core.length === 3 ? core.every((m) => m.rating === 'good') : null,
  };
}

/** Returns field data, `{ available:false }` when the site has too little traffic, or null when no key is set. */
export async function getFieldData(url, device = 'mobile') {
  const key = fieldDataKey();
  if (!key) return null;
  const formFactor = device === 'desktop' ? 'DESKTOP' : 'PHONE';
  try {
    let record = await query({ url, formFactor }, key);
    if (record) return { available: true, ...parse(record, 'page', formFactor) };
    record = await query({ origin: new URL(url).origin, formFactor }, key);
    if (record) return { available: true, ...parse(record, 'origin', formFactor) };
    return { available: false, formFactor, reason: 'Google has not collected enough real-visitor data for this site yet. This is normal for smaller or newer sites.' };
  } catch (err) {
    return { available: false, formFactor, error: `Real-visitor data unavailable: ${err.message}` };
  }
}
