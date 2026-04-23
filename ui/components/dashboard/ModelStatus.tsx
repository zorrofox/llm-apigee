/**
 * Model health status list (Server Component)
 * Source: Cloud Logging past 1h request logs, classify online/degraded/offline by success rate
 */
import { getTranslations } from 'next-intl/server';
import { getModelHealthMap, MODEL_CATALOG } from '@/lib/model-status';
import type { ModelHealth, ModelHealthStatus } from '@/lib/model-status';

const TYPE_COLOR: Record<string, string> = {
  Gemini: 'var(--c-green)',
  Claude: 'var(--c-blue)',
  MaaS:   'var(--c-amber)',
  Free:   'var(--c-txt-3)',
};

function fmtRate(h: ModelHealth): string {
  if (h.total === 0) return '—';
  if (h.successRate < 0) return '—';
  return `${Math.round(h.successRate * 100)}%`;
}

export async function ModelStatus() {
  const t = await getTranslations('dashboard');

  const STATUS_DOT: Record<ModelHealthStatus, { bg: string; glow: boolean; label: string }> = {
    online:   { bg: 'var(--c-green)',  glow: true,  label: t('modelStatusOnline')   },
    degraded: { bg: 'var(--c-amber)',  glow: false, label: t('modelStatusDegraded') },
    offline:  { bg: 'var(--c-red)',    glow: false, label: t('modelStatusOffline')  },
    unknown:  { bg: 'var(--c-border)', glow: false, label: t('modelStatusNoData')   },
  };

  let healthMap = new Map<string, ModelHealth>();
  try {
    healthMap = await getModelHealthMap();
  } catch {
    // Cloud Logging failure → degrade to unknown status
  }

  const ORDER: Record<ModelHealthStatus, number> = { online: 0, degraded: 1, offline: 2, unknown: 3 };
  const models = MODEL_CATALOG
    .map(def => healthMap.get(def.model) ?? { ...def, status: 'unknown' as const, successRate: 0, total: 0, lastSeen: '' })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  const onlineCount  = models.filter(m => m.status === 'online').length;
  const totalCount   = models.length;

  return (
    <div className="rounded-md overflow-hidden"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>

      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{t('modelStatusTitle')}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-sm"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-green)', background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.15)' }}>
            {t('onlineCount', { online: onlineCount, total: totalCount })}
          </span>
        </div>
        <a href="/models" className="text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)', letterSpacing: '0.05em' }}>
          {t('configureLink')}
        </a>
      </div>

      {models.map(m => {
        const dot = STATUS_DOT[m.status];
        return (
          <div key={m.model}
            className="flex items-center gap-3 px-5 py-2.5"
            style={{ borderBottom: '1px solid var(--c-border-dim)' }}
            title={m.total > 0
              ? t('modelTooltipWithData', { total: m.total, rate: fmtRate(m) })
              : t('modelTooltipNoData')}>

            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: dot.bg, boxShadow: dot.glow ? `0 0 5px ${dot.bg}` : 'none' }} />

            <div className="flex-1 min-w-0">
              <div className="text-[12px] truncate"
                style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-1)' }}>
                {m.model}
              </div>
              <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--c-txt-3)' }}>
                {m.publisher}
                <span className="px-1 text-[8px] rounded-sm"
                  style={{ fontFamily: 'IBM Plex Mono, monospace', color: TYPE_COLOR[m.type] ?? 'var(--c-txt-3)' }}>
                  {m.type}
                </span>
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              {m.total > 0 ? (
                <div className="text-[10px]"
                  style={{ fontFamily: 'IBM Plex Mono, monospace', color: dot.bg }}>
                  {fmtRate(m)}
                </div>
              ) : (
                <div className="text-[9px]"
                  style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                  {dot.label}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="px-5 py-2 text-[9px]"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', borderTop: '1px solid var(--c-border-dim)' }}>
        {t('modelStatusFooter')}
      </div>
    </div>
  );
}
