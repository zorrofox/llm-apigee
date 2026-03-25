/**
 * P3 缓存管理页面
 * 步骤 1：统计展示 + 步骤 2-3：阈值动态配置
 */
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
const BASE = `https://apigee.googleapis.com/v1/organizations/${ORG}`;
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getKvmThreshold(): Promise<number | null> {
  try {
    const client = await auth.getClient();
    const token  = await client.getAccessToken();
    const res    = await fetch(
      `${BASE}/environments/prod/keyvaluemaps/cache-config/entries/similarity_threshold`,
      { headers: { Authorization: `Bearer ${token.token}` }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const val = (await res.json()).value;
    const n   = parseFloat(val);
    return !isNaN(n) && n > 0 ? n : null;
  } catch { return null; }
}

export default async function CachePage() {
  const hdrs = await headers();
  requireIAP(hdrs); // 确保只有认证用户能访问

  const [stats, kvmThreshold] = await Promise.allSettled([
    getCacheStats(),
    getKvmThreshold(),
  ]);

  const cacheStats    = stats.status       === 'fulfilled' ? stats.value       : null;
  const threshold     = kvmThreshold.status === 'fulfilled' ? kvmThreshold.value : null;
  const statsError    = stats.status       === 'rejected'  ? String(stats.reason)  : '';

  return (
    <>
      <Topbar title="缓存管理" parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} gatewayLive />

      <div className="p-7 space-y-4">
        {/* 当前配置信息 */}
        <div className="flex items-center gap-6 px-4 py-3 rounded-md text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <span>
            相似度阈值：
            <span style={{ color: 'var(--c-green)' }}>{threshold ?? 0.95}</span>
            {threshold === null && <span> (代码默认)</span>}
          </span>
          <span>TTL：<span style={{ color: 'var(--c-green)' }}>3600s（1h）</span></span>
          <span>Embedding：<span style={{ color: 'var(--c-blue)' }}>text-embedding-004（768 dim）</span></span>
          <span>Vector Search：<span style={{ color: 'var(--c-blue)' }}>DOT_PRODUCT，llm_semantic_cache</span></span>
        </div>

        {/* 统计展示 */}
        {statsError && (
          <div className="px-4 py-3 rounded-md text-[11px]"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            加载缓存统计失败：{statsError}
          </div>
        )}
        {cacheStats && <CacheStatsView stats={cacheStats} />}

        {/* 阈值配置面板 */}
        <CacheConfigPanel
          currentThreshold={threshold}
          defaultThreshold={0.95}
        />
      </div>
    </>
  );
}
