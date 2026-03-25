/**
 * POST /api/weights/generate
 * 调用 Vertex AI gemini-2.0-flash-001（无 thinking，token 高效）
 * 根据提供的定价数据计算模型权重，基准 gemini-2.0-flash-001 output = $0.40/1M → 1.0
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireIAP }               from '@/lib/auth';
import { GoogleAuth }               from 'google-auth-library';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const auth    = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

// 定价参考（Vertex AI output token 价格，$/1M tokens）
// 来源：Vertex AI 定价页面 + Anthropic Vertex 定价
const PRICING: Record<string, number> = {
  'gemini-2.0-flash-001':   0.40,
  'gemini-2.0-flash-lite':  0.15,
  'gemini-2.5-flash-lite':  0.40,
  'gemini-2.5-flash':       3.50,
  'gemini-2.5-pro':        15.00,
  'gemini-3-flash-preview': 3.50,   // 估算，参考 2.5-flash
  'gemini-3-pro-preview':  15.00,   // 估算，参考 2.5-pro
  'gemini-3.1-pro-preview':15.00,   // 估算
  'claude-haiku-4-5':       1.25,   // ~$1.25/1M on Vertex
  'claude-sonnet-4-5':     15.00,
  'claude-sonnet-4-6':     15.00,
  'claude-opus-4-5':       75.00,
  'claude-opus-4-6':       75.00,
  'deepseek-v3.2':          1.10,   // MaaS 估算
  'kimi-k2-thinking':       2.50,   // MaaS 估算（thinking 模型偏贵）
  'minimax-m2':             1.60,   // MaaS 估算
  'qwen3-235b':             2.00,   // MaaS 估算
};

const BASELINE = PRICING['gemini-2.0-flash-001'];

const PROMPT = `根据以下各模型的 Vertex AI output token 定价（$/1M tokens），计算每个模型相对于基准模型的成本权重。

基准：gemini-2.0-flash-001，output $${BASELINE}/1M tokens，权重 = 1.0
计算公式：权重 = round(该模型价格 / ${BASELINE}, 合理精度)

定价数据：
${Object.entries(PRICING).map(([m, p]) => `- ${m}: $${p}/1M → 权重 = ${p === BASELINE ? '1.0' : `${p}/${BASELINE} ≈ ?`}`).join('\n')}

要求：
- 权重保留合理精度（0.5、1.0、2.0、3.5、6.25、37.5 等）
- 只返回 JSON，格式：{"模型名": 数值}
- 不要任何解释或注释`;

export async function POST(req: NextRequest) {
  try { requireIAP(req.headers); }
  catch { return NextResponse.json({ error: '未授权' }, { status: 401 }); }

  try {
    const client = await auth.getClient();
    const token  = await client.getAccessToken();

    // 用 gemini-2.5-flash + thinkingBudget:0 禁用思维 token，output budget 全给实际内容
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
          thinkingConfig: { thinkingBudget: 0 },  // 禁用思维 token，不浪费 budget
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Vertex AI 调用失败: ${err}` }, { status: 502 });
    }

    const data        = await res.json();
    const finishReason = data.candidates?.[0]?.finishReason;
    const raw          = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (finishReason === 'MAX_TOKENS') {
      return NextResponse.json({ error: `输出被截断（MAX_TOKENS），请重试` }, { status: 422 });
    }

    // 提取 JSON：找第一个 { 到最后一个 }
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      return NextResponse.json({ error: `模型返回内容无法解析为 JSON（length=${raw.length}）` }, { status: 422 });
    }

    const weights = JSON.parse(raw.slice(start, end + 1)) as Record<string, number>;

    // 验证
    for (const [model, w] of Object.entries(weights)) {
      if (typeof w !== 'number' || w <= 0) {
        return NextResponse.json({ error: `模型 ${model} 的权重无效: ${w}` }, { status: 422 });
      }
    }

    return NextResponse.json({ weights, model: 'gemini-2.0-flash-001 (Vertex AI)' });

  } catch (e) {
    return NextResponse.json({ error: `生成失败: ${String(e)}` }, { status: 500 });
  }
}
