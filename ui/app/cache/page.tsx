/**
 * P3 Cache management page
 */
import { getTranslations } from 'next-intl/server';
import { Topbar }           from '@/components/layout/Topbar';
import { CacheStatsView }   from '@/components/cache/CacheStatsView';
import { CacheConfigPanel } from '@/components/cache/CacheConfigPanel';
import { getCacheStats }    from '@/lib/cache-stats';
import { headers }          from 'next/headers';
import { requireIAP }       from '@/lib/auth';
import { GoogleAuth }       from 'google-auth-library';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const ORG  = process.env.APIGEE_ORG ?? '';
const ENV  = process.env.APIGEE_ENV ?? 'eval';
const BASE = `https://apigee.googleapis.com/v1/organizations/${ORG}`;
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getKvmThreshold(): Promise<number | null> {
  try {
    const client = await auth.getClient();
    const token  = await client.getAccessToken();
    const res    = await fetch(
      `${BASE}/environments/${ENV}/keyvaluemaps/cache-config/entries/similarity_threshold`,
      { headers: { Authorization: `Bearer ${token.token}` }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const val = (await res.json()).value;
    const n   = parseFloat(val);
    return !isNaN(n) && n > 0 ? n : null;
  } catch { return null; }
}

export default async function CachePage() {
  const t = await getTranslations('cache');
  const hdrs = await headers();
  requireIAP(hdrs);

  const [stats, kvmThreshold] = await Promise.allSettled([
    getCacheStats(),
    getKvmThreshold(),
  ]);

  const cacheStats    = stats.status       === 'fulfilled' ? stats.value       : null;
  const threshold     = kvmThreshold.status === 'fulfilled' ? kvmThreshold.value : null;
  const statsError    = stats.status       === 'rejected'  ? String(stats.reason)  : '';

  return (
    <>
      <Topbar title={t('title')} parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} gatewayLive />

      <div className="p-7 space-y-4">
        <div className="flex items-center gap-6 px-4 py-3 rounded-md text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <span>
            {t('currentThresholdLabel')}
            <span style={{ color: 'var(--c-green)' }}>{threshold ?? 0.95}</span>
            {threshold === null && <span>{t('codeDefault')}</span>}
          </span>
          <span>{t('ttlLabel')}<span style={{ color: 'var(--c-green)' }}>{t('ttlValue')}</span></span>
          <span>{t('embeddingLabel')}<span style={{ color: 'var(--c-blue)' }}>{t('embeddingValue')}</span></span>
          <span>{t('vsLabel')}<span style={{ color: 'var(--c-blue)' }}>{t('vsValue')}</span></span>
        </div>

        {statsError && (
          <div className="px-4 py-3 rounded-md text-[11px]"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            {t('loadStatsFailed', { err: statsError })}
          </div>
        )}
        {cacheStats && <CacheStatsView stats={cacheStats} />}

        <CacheConfigPanel
          currentThreshold={threshold}
          defaultThreshold={0.95}
        />
      </div>
    </>
  );
}
