/**
 * Cloud Monitoring API 客户端
 *
 * - 请求量/错误量：ALIGN_DELTA → 每小时实际计数（整数）
 * - Token：ALIGN_DELTA on Distribution → distributionValue.mean（每小时平均 token/请求）
 * - 缓存命中率：来自 Cloud Logging 计算
 * - 延迟：来自 Cloud Logging（totalLatencyMs 字段）
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const BASE    = `https://monitoring.googleapis.com/v3/projects/${PROJECT}`;

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/monitoring.read'],
});

async function monGet(path: string) {
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  const res    = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token.token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Monitoring API 错误 ${res.status}`);
  return res.json();
}

export interface TimeSeriesPoint {
  timestamp: string;
  value:     number;
}

export interface MetricSummary {
  requestsLastHour:  number;
  tokensLastHour:    number;   // 最近 1h 平均 token/请求
  errorsLastHour:    number;
  avgLatencyMs:      number | null;
  requestTrend:      TimeSeriesPoint[]; // 每小时请求计数（24h，补零）
  tokenTrend:        TimeSeriesPoint[]; // 每小时平均 token/请求（24h，补零）
  errorTrend:        TimeSeriesPoint[]; // 每小时错误计数（24h，补零）
  latencyTrend:      TimeSeriesPoint[]; // 每小时平均延迟 ms
}

/** 将稀疏数据点补全为 N 小时完整时间轴（缺失时段填 0） */
export function padToHours(points: TimeSeriesPoint[], hours = 24): TimeSeriesPoint[] {
  const now = new Date();
  return Array.from({ length: hours }, (_, i) => {
    const slot = new Date(now);
    slot.setUTCMinutes(0, 0, 0);
    slot.setUTCHours(slot.getUTCHours() - (hours - 1 - i));
    const slotTs = slot.toISOString();
    const match  = points.find(p => Math.abs(new Date(p.timestamp).getTime() - slot.getTime()) < 3600 * 1000);
    return { timestamp: slotTs, value: match?.value ?? 0 };
  });
}

/** 查询 DELTA 类型计数指标（请求数、错误数） */
async function queryCountMetric(metricType: string, hours = 24): Promise<TimeSeriesPoint[]> {
  const endTime   = new Date();
  const startTime = new Date(endTime.getTime() - hours * 3600 * 1000);

  const params = new URLSearchParams({
    'filter': `metric.type="logging.googleapis.com/user/${metricType}"`,
    'interval.startTime': startTime.toISOString(),
    'interval.endTime':   endTime.toISOString(),
    'aggregation.alignmentPeriod':   '3600s',
    'aggregation.perSeriesAligner':  'ALIGN_DELTA',
    'aggregation.crossSeriesReducer':'REDUCE_SUM',
  });

  try {
    const data = await monGet(`/timeSeries?${params}`);
    if (!data.timeSeries?.length) return [];

    const buckets = new Map<string, number>();
    for (const series of (data.timeSeries ?? [])) {
      for (const p of (series.points ?? [])) {
        const ts  = p.interval.startTime as string;
        const val = Number(p.value.int64Value ?? p.value.doubleValue ?? 0);
        buckets.set(ts, (buckets.get(ts) ?? 0) + Math.round(val));
      }
    }

    return Array.from(buckets.entries())
      .map(([ts, v]) => ({ timestamp: ts, value: v }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}

/**
 * 查询 DELTA+DISTRIBUTION 类型指标（llm_token_usage）
 * ALIGN_DELTA 合并分布，从 distributionValue.mean 提取每小时平均 token/请求
 */
async function queryDistributionMean(metricType: string, hours = 24): Promise<TimeSeriesPoint[]> {
  const endTime   = new Date();
  const startTime = new Date(endTime.getTime() - hours * 3600 * 1000);

  const params = new URLSearchParams({
    'filter': `metric.type="logging.googleapis.com/user/${metricType}"`,
    'interval.startTime': startTime.toISOString(),
    'interval.endTime':   endTime.toISOString(),
    'aggregation.alignmentPeriod':   '3600s',
    'aggregation.perSeriesAligner':  'ALIGN_DELTA',
    'aggregation.crossSeriesReducer':'REDUCE_SUM',
  });

  try {
    const data = await monGet(`/timeSeries?${params}`);
    if (!data.timeSeries?.length) return [];

    const buckets = new Map<string, number>();
    for (const series of (data.timeSeries ?? [])) {
      for (const p of (series.points ?? [])) {
        const ts   = p.interval.startTime as string;
        const mean = Number(p.value.distributionValue?.mean ?? 0);
        if (!isNaN(mean) && mean > 0 && !buckets.has(ts)) {
          buckets.set(ts, Math.round(mean));
        }
      }
    }

    return Array.from(buckets.entries())
      .map(([ts, v]) => ({ timestamp: ts, value: v }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}

/** 从 Cloud Logging 聚合延迟趋势（每小时平均 totalLatencyMs） */
async function queryLatencyTrend(hours = 24): Promise<{ trend: TimeSeriesPoint[]; avgLastHour: number | null }> {
  const logAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/logging.read'] });
  const client  = await logAuth.getClient();
  const token   = await client.getAccessToken();
  const since   = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  try {
    const res = await fetch('https://logging.googleapis.com/v2/entries:list', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceNames: [`projects/${PROJECT}`],
        filter: `logName="projects/${PROJECT}/logs/llm-gateway-requests" jsonPayload.totalLatencyMs!="" timestamp>="${since}"`,
        orderBy: 'timestamp desc',
        pageSize: 1000,
      }),
      cache: 'no-store',
    });

    if (!res.ok) return { trend: [], avgLastHour: null };
    const data = await res.json();

    const buckets    = new Map<string, number[]>();
    const oneHourAgo = Date.now() - 3600 * 1000;
    const lastHour: number[] = [];

    for (const entry of (data.entries ?? [])) {
      const ms = Number((entry.jsonPayload ?? {}).totalLatencyMs ?? 0);
      if (!ms || ms < 0) continue;
      const ts  = new Date(entry.timestamp);
      const key = `${ts.getUTCFullYear()}-${ts.getUTCMonth()}-${ts.getUTCDate()}-${ts.getUTCHours()}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(ms);
      if (ts.getTime() >= oneHourAgo) lastHour.push(ms);
    }

    const avg  = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    const trend = Array.from(buckets.entries())
      .map(([key, vals]) => {
        const [y, mo, d, h] = key.split('-').map(Number);
        return { timestamp: new Date(Date.UTC(y, mo, d, h)).toISOString(), value: Math.round(avg(vals)) };
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return { trend, avgLastHour: lastHour.length > 0 ? Math.round(avg(lastHour)) : null };
  } catch {
    return { trend: [], avgLastHour: null };
  }
}

/** 获取 Dashboard 所需的汇总指标 */
export async function getMetricSummary(): Promise<MetricSummary> {
  const [reqPoints, tokenPoints, errPoints, latency] = await Promise.all([
    queryCountMetric('llm_request_count', 24),
    queryDistributionMean('llm_token_usage', 24),
    queryCountMetric('llm_error_count', 24),
    queryLatencyTrend(24),
  ]);

  const last1h = (pts: TimeSeriesPoint[]) => pts.slice(-1)[0]?.value ?? 0;

  return {
    requestsLastHour: last1h(reqPoints),
    tokensLastHour:   last1h(tokenPoints),
    errorsLastHour:   last1h(errPoints),
    avgLatencyMs:     latency.avgLastHour,
    // 补全 24h 时间轴
    requestTrend: padToHours(reqPoints),
    tokenTrend:   padToHours(tokenPoints),
    errorTrend:   padToHours(errPoints),
    latencyTrend: padToHours(latency.trend),
  };
}
