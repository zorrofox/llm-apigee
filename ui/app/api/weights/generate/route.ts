/**
 * POST /api/weights/generate
 * Calls Vertex AI gemini-2.5-flash (thinkingBudget=0, token-efficient).
 * Generates model weights from a hand-curated pricing map.
 * Baseline: gemini-2.5-flash-lite output = $0.40/1M → weight 1.0
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireIAP }               from '@/lib/auth';
import { GoogleAuth }               from 'google-auth-library';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const auth    = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

// Vertex AI output token pricing ($/1M tokens), updated 2026-04
// Source: cloud.google.com/vertex-ai/generative-ai/pricing + Anthropic Vertex pricing + xAI Vertex pricing
const PRICING: Record<string, number> = {
  // Gemini 2.5 (Gemini 2.0 series retired)
  'gemini-2.5-flash-lite':   0.40,
  'gemini-2.5-flash':        3.50,
  'gemini-2.5-pro':         15.00,
  'gemini-2.5-flash-image':  3.00,   // image gen
  // Gemini 3.x (preview pricing estimates)
  'gemini-3-flash-preview':       3.50,
  'gemini-3.1-flash-lite-preview':1.00,
  'gemini-3.1-pro-preview':      15.00,
  'gemini-3.1-flash-image-preview': 5.00,
  // Claude (Vertex AI Anthropic)
  'claude-haiku-4-5':       1.25,
  'claude-sonnet-4-5':     15.00,
  'claude-sonnet-4-6':     15.00,
  'claude-opus-4-5':       75.00,
  'claude-opus-4-6':       75.00,
  'claude-opus-4-7':       75.00,
  // MaaS partners
  'deepseek-v3.2':          1.10,
  'kimi-k2-thinking':       2.50,
  'minimax-m2':             1.60,
  'qwen3-235b':             2.00,
  // xAI Grok (Vertex AI)
  'grok-4.20-reasoning':   12.00,   // estimate
};

const BASELINE = PRICING['gemini-2.5-flash-lite'];

const PROMPT = `Compute cost weights for each LLM relative to a baseline model, based on Vertex AI output token pricing ($/1M tokens).

Baseline: gemini-2.5-flash-lite, output $${BASELINE}/1M tokens, weight = 1.0
Formula: weight = round(model_price / ${BASELINE}, sensible precision)

Pricing data:
${Object.entries(PRICING).map(([m, p]) => `- ${m}: $${p}/1M → weight = ${p === BASELINE ? '1.0' : `${p}/${BASELINE} ≈ ?`}`).join('\n')}

Requirements:
- Use sensible precision (e.g. 0.5, 1.0, 2.5, 5.0, 8.75, 37.5, 187.5)
- Return JSON only, format: {"model-name": number}
- No explanations or comments`;

export async function POST(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  try {
    const client = await auth.getClient();
    const token  = await client.getAccessToken();

    // gemini-2.5-flash + thinkingBudget=0 disables reasoning tokens, full budget for content
    const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.1,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Vertex AI call failed: ${err}` }, { status: 502 });
    }

    const data        = await res.json();
    const finishReason = data.candidates?.[0]?.finishReason;
    const raw          = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (finishReason === 'MAX_TOKENS') {
      return NextResponse.json({ error: `Output truncated (MAX_TOKENS), please retry` }, { status: 422 });
    }

    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      return NextResponse.json({ error: `Model output not parseable as JSON (length=${raw.length})` }, { status: 422 });
    }

    const weights = JSON.parse(raw.slice(start, end + 1)) as Record<string, number>;

    for (const [model, w] of Object.entries(weights)) {
      if (typeof w !== 'number' || w <= 0) {
        return NextResponse.json({ error: `Invalid weight for ${model}: ${w}` }, { status: 422 });
      }
    }

    return NextResponse.json({ weights, model: 'gemini-2.5-flash (Vertex AI)' });

  } catch (e) {
    return NextResponse.json({ error: `Generation failed: ${String(e)}` }, { status: 500 });
  }
}
