/**
 * P0 Dashboard — all real data, no mocks
 */
import { getTranslations } from 'next-intl/server';
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

async function checkGatewayLive(): Promise<boolean> {
  try {
    const res = await fetch(`https://${GATEWAY}/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function calcCacheStats(logs: LogEntry[]): { rate: number | null; spark: number[] } {
  const withCache = logs.filter(e => e.cacheStatus === 'HIT' || e.cacheStatus === 'MISS');
  if (withCache.length === 0) return { rate: null, spark: [] };

  const rate = withCache.filter(e => e.cacheStatus === 'HIT').length / withCache.length;

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
  const t = await getTranslations('dashboard');
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

  const fmt = (n: number) => {
    const i = Math.round(n);
    if (i >= 1_000_000) return `${(i / 1_000_000).toFixed(1)}M`;
    if (i >= 1_000)     return `${(i / 1_000).toFixed(1)}K`;
    return String(i);
  };

  const nonZero = (pts: Array<{value: number}>) => pts.filter(p => p.value > 0).map(p => p.value);
  const reqSpark = nonZero(m?.requestTrend ?? []);

  return (
    <>
      <Topbar
        title={t('title')}
        parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''}
        alertCount={0}
        gatewayLive={gatewayLive}
      />

      <div className="p-7 space-y-4">
        <div className="grid grid-cols-4 gap-3.5">
          <MetricCard
            label={t('metricRequestsPerHour')}
            value={m ? fmt(m.requestsLastHour) : '—'}
            delta={t('metricRequestsSubtitle')}
            color="green"
            sparkData={reqSpark.length > 0 ? reqSpark : []}
          />
          <MetricCard
            label={t('metricTokensPerRequest')}
            value={m && m.tokensLastHour > 0 ? `${m.tokensLastHour}` : '—'}
            delta={t('metricTokensSubtitle')}
            color="blue"
            sparkData={nonZero(m?.tokenTrend ?? [])}
          />
          <MetricCard
            label={t('metricCacheHitRate')}
            value={cacheHitRate !== null ? `${Math.round(cacheHitRate * 100)}%` : '—'}
            delta={l.length > 0 ? t('fromLogs', { count: l.length }) : t('noDataYet')}
            color="green"
            sparkData={cacheStats.spark}
          />
          <MetricCard
            label={t('metricAvgLatency')}
            value={m?.avgLatencyMs != null ? `${m.avgLatencyMs}ms` : '—'}
            delta={m?.avgLatencyMs != null ? (m.avgLatencyMs < 2000 ? t('sloOk') : t('sloMissed')) : t('waitingData')}
            deltaOk={m?.avgLatencyMs == null || m.avgLatencyMs < 2000}
            color={m?.avgLatencyMs != null && m.avgLatencyMs >= 2000 ? 'red' : 'amber'}
            sparkData={nonZero(m?.latencyTrend ?? [])}
          />
        </div>

        <div className="grid gap-3.5" style={{ gridTemplateColumns: '1fr 320px' }}>
          <RequestChart metrics={m} />
          <ModelStatus />
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <KeysOverview apps={apps} />
          <ActivityFeed entries={l} />
        </div>
      </div>
    </>
  );
}

async function KeysOverview({ apps }: { apps: ApiApp[] }) {
  const t = await getTranslations('dashboard');

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
      active:  { label: t('tagActive'),  color: 'var(--c-green)', bg: 'rgba(0,232,122,0.08)',  border: 'rgba(0,232,122,0.2)' },
      revoked: { label: t('tagRevoked'), color: 'var(--c-red)',   bg: 'rgba(244,63,94,0.08)',  border: 'rgba(244,63,94,0.2)' },
      unknown: { label: t('tagUnknown'), color: 'var(--c-txt-3)', bg: 'transparent',           border: 'var(--c-border-dim)' },
    };
    const tag = map[s] ?? map.active;
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-sm tracking-[0.1em] uppercase"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: tag.color, background: tag.bg, border: `1px solid ${tag.border}` }}>
        {tag.label}
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
          <span className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{t('keysOverviewTitle')}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
            {t('appsCount', { count: apps.length })}
          </span>
        </div>
        <a href="/keys" className="text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)' }}>
          {t('manageLink')}
        </a>
      </div>

      {apps.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>
          {t('noAppsCreate')}<a href="/keys" style={{ color: 'var(--c-blue)' }}>{t('noAppsLink')}</a>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              {[t('tableApp'), t('tableTokenLimit'), t('tableStatus')].map(h => (
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
                      {fmtN(limit)} {t('perHr')}
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
          {t('moreApps', { count: apps.length - 6 })}<a href="/keys" style={{ color: 'var(--c-blue)' }}>{t('viewAll')}</a>
        </div>
      )}
    </div>
  );
}
