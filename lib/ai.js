import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

/** AI summary is optional: only enabled when credentials are configured. */
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['executive_summary', 'top_priorities', 'quick_wins', 'client_email'],
  properties: {
    executive_summary: { type: 'string', description: '3-5 sentence plain-English overview for a non-technical business owner.' },
    top_priorities: {
      type: 'array',
      description: 'The 3-6 most important fixes, most important first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why_it_matters', 'how_to_fix', 'impact', 'effort'],
        properties: {
          title: { type: 'string' },
          why_it_matters: { type: 'string' },
          how_to_fix: { type: 'string' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          effort: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    quick_wins: { type: 'array', items: { type: 'string' }, description: 'Up to 5 fixes that take under an hour each.' },
    client_email: { type: 'string', description: 'A short, friendly email from the agency to the site owner summarising findings and offering help. Plain text, no subject line.' },
  },
};

const SYSTEM = `You are a senior web consultant at a UK digital agency that builds and maintains websites for small businesses.
You turn automated website audit data into clear, accurate advice for business owners who are not technical.
Only use facts present in the audit data. Never invent numbers, pages or problems. Use British English.
Prioritise by business impact: things that lose visitors, sales or search rankings come first.`;

/** Returns the AI summary, or { error } — never throws. */
export async function summarise(audit) {
  if (!aiEnabled()) return null;
  const client = new Anthropic();

  // Send a compact version of the audit: scores plus the top issues.
  const input = {
    site: audit.finalUrl,
    pagesScanned: audit.pages.length,
    overallScore: audit.analysis.overall,
    grade: audit.analysis.grade,
    categoryScores: audit.analysis.scores,
    lighthouse: audit.lighthouse.mobile?.scores || audit.lighthouse.desktop?.scores,
    coreWebVitals: (audit.lighthouse.mobile || audit.lighthouse.desktop)?.metrics?.map((m) => `${m.name}: ${m.display}`),
    issues: audit.analysis.issues.slice(0, 30).map((i) => ({
      severity: i.severity, category: i.category, title: i.title, affectedCount: i.count, recommendedFix: i.fix,
    })),
    passedChecks: audit.analysis.passed.map((p) => p.title),
  };

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Here is the audit data as JSON:\n\n${JSON.stringify(input, null, 2)}` }],
    });

    if (response.stop_reason === 'refusal') return { error: 'The AI model declined to summarise this audit.' };
    if (response.stop_reason === 'max_tokens') return { error: 'The AI summary was cut off. Try again.' };
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return { error: 'The AI model returned no summary.' };
    return { ...JSON.parse(text), model: response.model };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: 'AI summary failed: the API key is invalid.' };
    if (err instanceof Anthropic.RateLimitError) return { error: 'AI summary failed: rate limited, try again shortly.' };
    if (err instanceof Anthropic.APIError) return { error: `AI summary failed (API ${err.status}): ${err.message}` };
    return { error: `AI summary failed: ${err.message}` };
  }
}
