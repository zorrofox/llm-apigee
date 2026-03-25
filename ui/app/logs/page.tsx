/**
 * P2 请求日志页面
 * Server Component — 服务端拉取数据，URL 参数驱动筛选和分页
 */
import { Suspense }     from 'react';
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
  const params = await searchParams;

  // 从 URL 参数解析筛选条件
  const filter: LogFilter = {
    model:       params.model       || undefined,
    app:         params.app         || undefined,
    statusCode:  params.status      || undefined,
    cacheStatus: params.cache       || undefined,
  };

  const pageToken   = params.pageToken || undefined;
  const currentPage = Number(params.page || 1);

  // 并行拉取日志、模型列表、App 列表
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

  // 统计摘要
  const total200  = entries.filter(e => e.statusCode === '200').length;
  const totalHit  = entries.filter(e => e.cacheStatus === 'HIT').length;
  const avgMs     = entries.filter(e => Number(e.totalLatencyMs) > 0)
    .reduce((s, e, _, a) => s + Number(e.totalLatencyMs) / a.length, 0);

  return (
    <>
      <Topbar title="请求日志" parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} gatewayLive />

      <div className="p-7 space-y-4">
        {/* 筛选器 + 摘要统计 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Suspense fallback={<div style={{ color: 'var(--c-txt-3)', fontSize: '11px' }}>加载筛选器…</div>}>
            <LogFilters models={modelList} apps={appList} />
          </Suspense>

          {/* 摘要 */}
          {entries.length > 0 && (
            <div className="flex items-center gap-4 text-[10px]"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              <span>共 <span style={{ color: 'var(--c-txt-1)' }}>{entries.length}</span> 条</span>
              <span>成功 <span style={{ color: 'var(--c-green)' }}>{total200}</span></span>
              <span>缓存命中 <span style={{ color: 'var(--c-blue)' }}>{totalHit}</span></span>
              {avgMs > 0 && (
                <span>均延迟 <span style={{ color: 'var(--c-amber)' }}>{Math.round(avgMs)}ms</span></span>
              )}
            </div>
          )}
        </div>

        {/* 日志表格 */}
        <Suspense fallback={<div style={{ color: 'var(--c-txt-3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', padding: '40px 20px', textAlign: 'center' }}>加载中…</div>}>
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
