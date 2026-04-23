/**
 * P3 Model routing page
 * Server Component — reads Apigee bundle + KVM + Cloud Logging
 */
import { getTranslations } from 'next-intl/server';
import { Topbar }           from '@/components/layout/Topbar';
import { ModelGroupTable }  from '@/components/models/ModelGroupTable';
import { getRoutingConfig } from '@/lib/model-routing';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

export default async function ModelsPage() {
  const t = await getTranslations('models');
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
      <Topbar title={t('title')} parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} gatewayLive />

      <div className="p-7 space-y-4">
        {config && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-[11px]"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              <span>{t.rich('totalModels', { n: totalModels, hl: (c) => <span style={{ color: 'var(--c-txt-1)' }}>{c}</span> })}</span>
              <span>{t.rich('activeCount',  { n: activeCount,  hl: (c) => <span style={{ color: 'var(--c-green)' }}>{c}</span> })}</span>
              {disabledCount > 0 && (
                <span>{t.rich('disabledCount', { n: disabledCount, hl: (c) => <span style={{ color: 'var(--c-red)' }}>{c}</span> })}</span>
              )}
              <span>
                {t.rich('defaultFallback', { model: config.defaultModel, hl: (c) => <span style={{ color: 'var(--c-green)' }}>{c}</span> })}
                {config.kvmDefault && <span style={{ color: 'var(--c-blue)' }}>{t('kvmOverride')}</span>}
              </span>
            </div>
            <div className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              {t('footerNote')}
            </div>
          </div>
        )}

        {loadError && (
          <div className="px-4 py-3 rounded-md text-[11px]"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            {t('loadError', { err: loadError })}
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
