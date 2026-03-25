/**
 * P3 模型路由页面
 * Server Component — 读取 Apigee bundle + KVM + Cloud Logging
 */
import { Topbar }           from '@/components/layout/Topbar';
import { ModelGroupTable }  from '@/components/models/ModelGroupTable';
import { getRoutingConfig } from '@/lib/model-routing';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

export default async function ModelsPage() {
  let config = null;
  let loadError = '';

  try {
    config = await getRoutingConfig();
  } catch (e) {
    loadError = String(e);
  }

  const totalModels   = config?.models.length ?? 0;
  const disabledCount = config?.models.filter(m => m.disabled).length ?? 0;
  const activeCount   = totalModels - disabledCount;

  return (
    <>
      <Topbar title="模型路由" parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} gatewayLive />

      <div className="p-7 space-y-4">
        {config && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-[11px]"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              <span>共 <span style={{ color: 'var(--c-txt-1)' }}>{totalModels}</span> 个模型</span>
              <span>启用 <span style={{ color: 'var(--c-green)' }}>{activeCount}</span></span>
              {disabledCount > 0 && (
                <span>禁用 <span style={{ color: 'var(--c-red)' }}>{disabledCount}</span></span>
              )}
              <span>
                默认回退：<span style={{ color: 'var(--c-green)' }}>{config.defaultModel}</span>
                {config.kvmDefault && <span style={{ color: 'var(--c-blue)' }}> (KVM 覆盖)</span>}
              </span>
            </div>
            <div className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              禁用/默认修改约 30s 生效 · 新增模型无需重新部署
            </div>
          </div>
        )}

        {loadError && (
          <div className="px-4 py-3 rounded-md text-[11px]"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            加载路由配置失败：{loadError}
          </div>
        )}

        {config && (
          <ModelGroupTable
            models={config.models}
            kvmExtraRaw={config.kvmExtraRaw}
          />
        )}
      </div>
    </>
  );
}
