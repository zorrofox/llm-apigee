/**
 * 语义缓存统计数据
 * 从 Cloud Logging llm-gateway-requests 日志聚合
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const auth    = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/logging.read'] });

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface CacheHourPoint {
  hour:     string;   // "HH:00"
  hits:     number;
  misses:   number;
  hitRate:  number;   // 0-1
}

export interface ModelCacheStat {
  model:    string;
  hits:     number;
  misses:   number;
  hitRate:  number;
  total:    number;
}

export interface ScoreBucket {
  label: string;   // e.g. "0.95–0.97"
  lo:    number;
  hi:    number;
  count: number;
  pct:   number;
}

export interface RecentHit {
  timestamp:    string;
  model:        string;
  score:        number;
  app:          string;
  latencyMs:    number;
}

export interface CacheStats {
  // 汇总
  totalHits:       number;
  totalMisses:     number;
  totalRequests:   number;
  hitRate:         number;   // 0-1
  estimatedSaving: number;   // 节省的 LLM 调用次数

  // 趋势（最近 24h，每小时一个点）
  hourlyTrend: CacheHourPoint[];

  // 按模型统计（命中率排行）
  modelStats: ModelCacheStat[];

  // 相似度分布（仅 HIT 条目）
  scoreBuckets: ScoreBucket[];

  // 最近命中列表
  recentHits: RecentHit[];
}

// ── 查询 Cloud Logging ────────────────────────────────────────────────────────

async function queryLogs(hours = 24): Promise<Array<Record<string, string>>> {
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  const since  = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const res = await fetch('https://logging.googleapis.com/v2/entries:list', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resourceNames: [`projects/${PROJECT}`],
      filter: `logName="projects/${PROJECT}/logs/llm-gateway-requests" (jsonPayload.cacheStatus="HIT" OR jsonPayload.cacheStatus="MISS") timestamp>="${since}"`,
      orderBy: 'timestamp desc',
      pageSize: 1000,
    }),
    cache: 'no-store',
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.entries ?? []).map((e: { jsonPayload: Record<string, string>; timestamp: string }) => ({
    ...(e.jsonPayload ?? {}),
    timestamp: e.timestamp,
  }));
}

// ── 主函数 ────────────────────────────────────────────────────────────────────

export async function getCacheStats(): Promise<CacheStats> {
  const entries = await queryLogs(24);

  const hits   = entries.filter(e => e.cacheStatus === 'HIT');
  const misses = entries.filter(e => e.cacheStatus === 'MISS');

  const totalHits    = hits.length;
  const totalMisses  = misses.length;
  const totalRequests = totalHits + totalMisses;
  const hitRate      = totalRequests > 0 ? totalHits / totalRequests : 0;

  // ── 24h 小时趋势 ──────────────────────────────────────────────────────────
  const hourBuckets = new Map<string, { hits: number; misses: number }>();
  const now = new Date();
  for (let h = 23; h >= 0; h--) {
    const d = new Date(now);
    d.setUTCMinutes(0, 0, 0);
    d.setUTCHours(d.getUTCHours() - h);
    const key = `${String(d.getUTCHours()).padStart(2, '0')}:00`;
    hourBuckets.set(key, { hits: 0, misses: 0 });
  }
  for (const e of entries) {
    const ts  = new Date(e.timestamp);
    const key = `${String(ts.getUTCHours()).padStart(2, '0')}:00`;
    if (hourBuckets.has(key)) {
      const b = hourBuckets.get(key)!;
      if (e.cacheStatus === 'HIT') b.hits++;
      else b.misses++;
    }
  }
  const hourlyTrend: CacheHourPoint[] = Array.from(hourBuckets.entries()).map(([hour, b]) => ({
    hour,
    hits:    b.hits,
    misses:  b.misses,
    hitRate: b.hits + b.misses > 0 ? b.hits / (b.hits + b.misses) : 0,
  }));

  // ── 按模型统计 ────────────────────────────────────────────────────────────
  const modelMap = new Map<string, { hits: number; misses: number }>();
  for (const e of entries) {
    const m = e.modelResolved || e.modelRequested || '—';
    if (!modelMap.has(m)) modelMap.set(m, { hits: 0, misses: 0 });
    const s = modelMap.get(m)!;
    if (e.cacheStatus === 'HIT') s.hits++; else s.misses++;
  }
  const modelStats: ModelCacheStat[] = Array.from(modelMap.entries())
    .map(([model, s]) => ({
      model,
      hits:    s.hits,
      misses:  s.misses,
      total:   s.hits + s.misses,
      hitRate: s.hits + s.misses > 0 ? s.hits / (s.hits + s.misses) : 0,
    }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 10);

  // ── 相似度分布（仅 HIT 条目）────────────────────────────────────────────
  const BUCKETS = [
    { label: '0.95–0.97', lo: 0.95, hi: 0.97 },
    { label: '0.97–0.99', lo: 0.97, hi: 0.99 },
    { label: '0.99–1.00', lo: 0.99, hi: 1.00 },
    { label: '= 1.00',    lo: 1.00, hi: 1.01 },
  ];
  const scoreCounts = BUCKETS.map(b => ({ ...b, count: 0 }));
  for (const e of hits) {
    const score = parseFloat(e.cacheScore || '0');
    for (const b of scoreCounts) {
      if (score >= b.lo && score < b.hi) { b.count++; break; }
    }
  }
  const scoreBuckets: ScoreBucket[] = scoreCounts.map(b => ({
    ...b,
    pct: totalHits > 0 ? b.count / totalHits : 0,
  }));

  // ── 最近命中列表（最多 20 条）────────────────────────────────────────────
  const recentHits: RecentHit[] = hits.slice(0, 20).map(e => ({
    timestamp: e.timestamp,
    model:     e.modelResolved || e.modelRequested || '—',
    score:     parseFloat(e.cacheScore || '0'),
    app:       e.apiKeyApp || '—',
    latencyMs: Number(e.totalLatencyMs || 0),
  }));

  return {
    totalHits,
    totalMisses,
    totalRequests,
    hitRate,
    estimatedSaving: totalHits,   // 每次 HIT 节省一次 LLM 调用
    hourlyTrend,
    modelStats,
    scoreBuckets,
    recentHits,
  };
}
