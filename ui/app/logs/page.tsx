/**
 * P2 Request logs page
 * Server Component — server-side data fetch, URL-driven filters and pagination
 */
import { Suspense }     from 'react';
import { getTranslations } from 'next-intl/server';
import { Topbar }       from '@/components/layout/Topbar';
import { LogTable }     from '@/components/logs/LogTable';
import { LogFilters }   from '@/components/logs/LogFilters';
import { queryLogs, getLogModels, getLogApps } from '@/lib/logging';
import type { LogFilter } from '@/lib/logging';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function LogsPage({ searchParams }: PageProps) {
  const t = await getTranslations('logs');
  const params = await searchParams;

  const filter: LogFilter = {
    model:       params.model       || undefined,
    app:         params.app         || undefined,
    statusCode:  params.status      || undefined,
    cacheStatus: params.cache       || undefined,
  };

  const pageToken   = params.pageToken || undefined;
  const currentPage = Number(params.page || 1);

  const [logPage, models, apps] = await Promise.allSettled([
    queryLogs(filter, 50, pageToken),
    getLogModels(),
    getLogApps(),
  ]);

  const { entries, nextPageToken } = logPage.status === 'fulfilled'
    ? logPage.value
    : { entries: [], nextPageToken: null };

  const modelList = models.status === 'fulfilled' ? models.value : [];
  const appList   = apps.status   === 'fulfilled' ? apps.value   : [];

  const total200  = entries.filter(e => e.statusCode === '200').length;
  const totalHit  = entries.filter(e => e.cacheStatus === 'HIT').length;
  const avgMs     = entries.filter(e => Number(e.totalLatencyMs) > 0)
    .reduce((s, e, _, a) => s + Number(e.totalLatencyMs) / a.length, 0);

  return (
    <>
      <Topbar title={t('title')} parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} gatewayLive />

      <div className="p-7 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Suspense fallback={<div style={{ color: 'var(--c-txt-3)', fontSize: '11px' }}>{t('filterLoading')}</div>}>
            <LogFilters models={modelList} apps={appList} />
          </Suspense>

          {entries.length > 0 && (
            <div className="flex items-center gap-4 text-[10px]"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              <span>{t.rich('summaryTotal',     { n: entries.length, hl: (c) => <span style={{ color: 'var(--c-txt-1)' }}>{c}</span> })}</span>
              <span>{t.rich('summarySuccess',   { n: total200,       hl: (c) => <span style={{ color: 'var(--c-green)' }}>{c}</span> })}</span>
              <span>{t.rich('summaryCacheHit',  { n: totalHit,       hl: (c) => <span style={{ color: 'var(--c-blue)' }}>{c}</span> })}</span>
              {avgMs > 0 && (
                <span>{t.rich('summaryAvgLatency', { ms: Math.round(avgMs), hl: (c) => <span style={{ color: 'var(--c-amber)' }}>{c}</span> })}</span>
              )}
            </div>
          )}
        </div>

        <Suspense fallback={<div style={{ color: 'var(--c-txt-3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', padding: '40px 20px', textAlign: 'center' }}>{t('tableLoading')}</div>}>
          <LogTable
            entries={entries}
            nextPageToken={nextPageToken}
            currentPage={currentPage}
          />
        </Suspense>
      </div>
    </>
  );
}
