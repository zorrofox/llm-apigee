/**
 * 从 Cloud Logging 查询各模型最近 1 小时的健康状态
 * 通过成功率判断 online / degraded / offline
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const auth    = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/logging.read'] });

export type ModelHealthStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export interface ModelHealth {
  model:       string;
  publisher:   string;
  type:        string;
  status:      ModelHealthStatus;
  successRate: number;   // 0-1
  total:       number;   // 过去 1 小时请求数
  lastSeen:    string;   // ISO 时间戳，最后一次成功请求
}

/** 网关支持的全部模型（静态配置，与 model-router.js 保持一致） */
export const MODEL_CATALOG: Array<Omit<ModelHealth, 'status' | 'successRate' | 'total' | 'lastSeen'>> = [
  { model: 'gemini-2.5-pro',        publisher: 'google',      type: 'Gemini' },
  { model: 'gemini-2.5-flash',      publisher: 'google',      type: 'Gemini' },
  { model: 'gemini-2.0-flash-001',  publisher: 'google',      type: 'Gemini' },
  { model: 'gemini-2.0-flash-lite', publisher: 'google',      type: 'Gemini' },
  { model: 'claude-opus-4-6',       publisher: 'anthropic',   type: 'Claude' },
  { model: 'claude-sonnet-4-6',     publisher: 'anthropic',   type: 'Claude' },
  { model: 'claude-haiku-4-5',      publisher: 'anthropic',   type: 'Claude' },
  { model: 'deepseek-v3.2',         publisher: 'deepseek-ai', type: 'MaaS'   },
  { model: 'kimi-k2-thinking',      publisher: 'moonshotai',  type: 'MaaS'   },
  { model: 'qwen3-235b',            publisher: 'qwen',        type: 'MaaS'   },
  { model: 'glm-4.7',               publisher: 'zai-org',     type: 'MaaS'   },
  { model: 'nemotron-3-super-free', publisher: 'opencode',    type: 'Free'   },
];

/** 查询过去 1 小时的日志，按模型聚合健康数据 */
export async function getModelHealthMap(): Promise<Map<string, ModelHealth>> {
  const client = await auth.getClient();
  const token  = await client.getAccessToken();

  const since = new Date(Date.now() - 3600 * 1000).toISOString();

  const res = await fetch('https://logging.googleapis.com/v2/entries:list', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resourceNames: [`projects/${PROJECT}`],
      filter: `logName="projects/${PROJECT}/logs/llm-gateway-requests" timestamp>="${since}"`,
      orderBy: 'timestamp desc',
      pageSize: 1000,  // 最多取 1000 条用于统计
    }),
    next: { revalidate: 60 }, // 60s ISR
  });

  // 按 modelResolved 聚合
  const stats = new Map<string, { ok: number; err: number; lastOk: string }>();

  if (res.ok) {
    const data = await res.json();
    for (const entry of (data.entries ?? [])) {
      const p = entry.jsonPayload ?? {};
      const model  = p.modelResolved as string;
      const code   = Number(p.statusCode ?? 0);
      const ts     = entry.timestamp as string;
      if (!model) continue;

      if (!stats.has(model)) stats.set(model, { ok: 0, err: 0, lastOk: '' });
      const s = stats.get(model)!;
      if (code >= 200 && code < 400) {
        s.ok++;
        if (!s.lastOk) s.lastOk = ts;
      } else if (code >= 400) {
        s.err++;
      }
    }
  }

  // 构建 ModelHealth map
  const result = new Map<string, ModelHealth>();
  for (const def of MODEL_CATALOG) {
    const s = stats.get(def.model);
    const total = (s?.ok ?? 0) + (s?.err ?? 0);
    const successRate = total > 0 ? (s!.ok / total) : -1; // -1 = 无数据

    let status: ModelHealthStatus;
    if (total === 0)          status = 'unknown';   // 过去 1h 无请求
    else if (successRate >= 0.95) status = 'online';
    else if (successRate >= 0.5)  status = 'degraded';
    else                          status = 'offline';

    result.set(def.model, {
      ...def,
      status,
      successRate: Math.max(0, successRate),
      total,
      lastSeen: s?.lastOk ?? '',
    });
  }

  return result;
}
