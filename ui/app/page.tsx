/**
 * P0 Dashboard 页面 — 全真实数据，无 mock
 */
import { Topbar }       from '@/components/layout/Topbar';
import { MetricCard }   from '@/components/dashboard/MetricCard';
import { RequestChart } from '@/components/dashboard/RequestChart';
import { ModelStatus }  from '@/components/dashboard/ModelStatus';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { getMetricSummary } from '@/lib/monitoring';
import { listRecentLogs }   from '@/lib/logging';
import { listAllApps }      from '@/lib/apigee';
import type { ApiApp }      from '@/lib/apigee';
import type { LogEntry }    from '@/lib/logging';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const GATEWAY = process.env.GATEWAY_HOST ?? '34-36-108-216.nip.io';

/** 探测网关健康状态 */
async function checkGatewayLive(): Promise<boolean> {
  try {
    const res = await fetch(`https://${GATEWAY}/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000), // 3s 超时
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 从日志条目计算缓存命中率及 sparkline 趋势 */
function calcCacheStats(logs: LogEntry[]): { rate: number | null; spark: number[] } {
  const withCache = logs.filter(e => e.cacheStatus === 'HIT' || e.cacheStatus === 'MISS');
  if (withCache.length === 0) return { rate: null, spark: [] };

  const rate = withCache.filter(e => e.cacheStatus === 'HIT').length / withCache.length;

  // 按小时分桶，计算每小时命中率（0-100）
  const buckets = new Map<string, { hit: number; total: number }>();
  for (const e of withCache) {
    const ts = new Date(e.timestamp);
    const key = `${ts.getUTCFullYear()}-${ts.getUTCMonth()}-${ts.getUTCDate()}-${ts.getUTCHours()}`;
    if (!buckets.has(key)) buckets.set(key, { hit: 0, total: 0 });
    const b = buckets.get(key)!;
    b.total++;
    if (e.cacheStatus === 'HIT') b.hit++;
  }

  const spark = Array.from(buckets.values())
    .map(b => Math.round((b.hit / b.total) * 100));

  return { rate, spark };
}

export default async function DashboardPage() {
  const [metricsResult, logsResult, appsResult, gatewayLive] = await Promise.all([
    getMetricSummary().catch(() => null),
    listRecentLogs(200).catch(() => [] as LogEntry[]),
    listAllApps().catch(() => [] as ApiApp[]),
    checkGatewayLive(),
  ]);

  const m    = metricsResult;
  const l    = logsResult;
  const apps = appsResult;

  const cacheStats   = calcCacheStats(l);
  const cacheHitRate = cacheStats.rate;

  // 整数格式（不显示小数），超过 1K/1M 时缩写
  const fmt = (n: number) => {
    const i = Math.round(n);
    if (i >= 1_000_000) return `${(i / 1_000_000).toFixed(1)}M`;
    if (i >= 1_000)     return `${(i / 1_000).toFixed(1)}K`;
    return String(i);
  };

  // Sparkline 只取有实际值的点（过滤掉补零部分），避免尖峰形状
  const nonZero = (pts: Array<{value: number}>) => pts.filter(p => p.value > 0).map(p => p.value);
  const reqSpark = nonZero(m?.requestTrend ?? []);

  return (
    <>
      <Topbar
        title="Dashboard"
        parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''}
        alertCount={0}       // 告警系统尚未接入，不显示假数字
        gatewayLive={gatewayLive}
      />

      <div className="p-7 space-y-4">
        {/* ── 指标卡片 4 列 ── */}
        <div className="grid grid-cols-4 gap-3.5">
          <MetricCard
            label="请求量 / 小时"
            value={m ? fmt(m.requestsLastHour) : '—'}
            delta="过去 1 小时"
            color="green"
            sparkData={reqSpark.length > 0 ? reqSpark : []}
          />
          <MetricCard
            label="Token 均值 / 请求"
            value={m && m.tokensLastHour > 0 ? `${m.tokensLastHour}` : '—'}
            delta="最近 1 小时平均"
            color="blue"
            sparkData={nonZero(m?.tokenTrend ?? [])}
          />
          <MetricCard
            label="缓存命中率"
            value={cacheHitRate !== null ? `${Math.round(cacheHitRate * 100)}%` : '—'}
            delta={l.length > 0 ? `近 ${l.length} 条日志统计` : '暂无数据'}
            color="green"
            sparkData={cacheStats.spark}
          />
          <MetricCard
            label="平均延迟"
            value={m?.avgLatencyMs != null ? `${m.avgLatencyMs}ms` : '—'}
            delta={m?.avgLatencyMs != null ? (m.avgLatencyMs < 2000 ? 'SLO: 2s · 达标' : 'SLO: 2s · 超标') : '等待数据'}
            deltaOk={m?.avgLatencyMs == null || m.avgLatencyMs < 2000}
            color={m?.avgLatencyMs != null && m.avgLatencyMs >= 2000 ? 'red' : 'amber'}
            sparkData={nonZero(m?.latencyTrend ?? [])}
          />
        </div>

        {/* ── 请求趋势图 + 模型状态 ── */}
        <div className="grid gap-3.5" style={{ gridTemplateColumns: '1fr 320px' }}>
          <RequestChart metrics={m} />
          <ModelStatus />
        </div>

        {/* ── API Keys 概览 + 活动流 ── */}
        <div className="grid grid-cols-2 gap-3.5">
          <KeysOverview apps={apps} />
          <ActivityFeed entries={l} />
        </div>
      </div>
    </>
  );
}

/** Dashboard 内嵌的 API Keys 简要表格（真实数据） */
function KeysOverview({ apps }: { apps: ApiApp[] }) {
  function getStatus(app: ApiApp): 'active' | 'revoked' | 'unknown' {
    const status = app.credentials?.[0]?.status ?? 'approved';
    if (status === 'revoked') return 'revoked';
    return 'active';
  }

  function getQuotaLimit(app: ApiApp): number {
    const override = app.attributes?.find(a => a.name === 'token.quota.limit')?.value;
    if (override && Number(override) > 0) return Number(override);
    const productLimit = app.attributes?.find(a => a.name === 'developer.token.quota.limit')?.value;
    return Number(productLimit || 1_000_000);
  }

  const statusTag = (s: string) => {
    const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
      active:  { label: '正常',   color: 'var(--c-green)', bg: 'rgba(0,232,122,0.08)',  border: 'rgba(0,232,122,0.2)' },
      revoked: { label: '已撤销', color: 'var(--c-red)',   bg: 'rgba(244,63,94,0.08)',  border: 'rgba(244,63,94,0.2)' },
      unknown: { label: '未知',   color: 'var(--c-txt-3)', bg: 'transparent',             border: 'var(--c-border-dim)' },
    };
    const t = map[s] ?? map.active;
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-sm tracking-[0.1em] uppercase"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: t.color, background: t.bg, border: `1px solid ${t.border}` }}>
        {t.label}
      </span>
    );
  };

  const fmtN = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

  return (
    <div className="rounded-md overflow-hidden"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>API Keys</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
            {apps.length} 个
          </span>
        </div>
        <a href="/keys" className="text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)' }}>
          管理 →
        </a>
      </div>

      {apps.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>
          暂无 App，<a href="/keys" style={{ color: 'var(--c-blue)' }}>去创建</a>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              {['App', 'Token 配额上限', '状态'].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-[9px] tracking-[0.18em] uppercase"
                  style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.slice(0, 6).map(app => {
              const limit  = getQuotaLimit(app);
              const status = getStatus(app);
              return (
                <tr key={app.appId} style={{ borderBottom: '1px solid var(--c-border-dim)', opacity: status === 'revoked' ? 0.5 : 1 }}>
                  <td className="px-5 py-3">
                    <div className="text-[12px] font-medium" style={{ color: 'var(--c-txt-1)' }}>{app.name}</div>
                    <div className="text-[10px] mt-0.5" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                      {app.developerEmail}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-2)' }}>
                      {fmtN(limit)} / hr
                    </span>
                  </td>
                  <td className="px-5 py-3">{statusTag(status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {apps.length > 6 && (
        <div className="px-5 py-2.5 text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', borderTop: '1px solid var(--c-border-dim)' }}>
          还有 {apps.length - 6} 个 App · <a href="/keys" style={{ color: 'var(--c-blue)' }}>查看全部</a>
        </div>
      )}
    </div>
  );
}
