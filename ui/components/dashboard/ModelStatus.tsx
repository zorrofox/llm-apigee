/**
 * 模型健康状态列表（Server Component）
 * 数据来源：Cloud Logging 最近 1 小时请求日志，按成功率判断在线/降级/离线
 */
import { getModelHealthMap, MODEL_CATALOG } from '@/lib/model-status';
import type { ModelHealth, ModelHealthStatus } from '@/lib/model-status';

const STATUS_DOT: Record<ModelHealthStatus, { bg: string; glow: boolean; label: string }> = {
  online:   { bg: 'var(--c-green)', glow: true,  label: '正常'   },
  degraded: { bg: 'var(--c-amber)', glow: false, label: '降级'   },
  offline:  { bg: 'var(--c-red)',   glow: false, label: '离线'   },
  unknown:  { bg: 'var(--c-border)',glow: false, label: '无数据' },
};

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
  let healthMap = new Map<string, ModelHealth>();
  try {
    healthMap = await getModelHealthMap();
  } catch {
    // Cloud Logging 失败时降级为 unknown 状态
  }

  // 按状态排序：online > degraded > offline > unknown
  const ORDER: Record<ModelHealthStatus, number> = { online: 0, degraded: 1, offline: 2, unknown: 3 };
  const models = MODEL_CATALOG
    .map(def => healthMap.get(def.model) ?? { ...def, status: 'unknown' as const, successRate: 0, total: 0, lastSeen: '' })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  const onlineCount  = models.filter(m => m.status === 'online').length;
  const totalCount   = models.length;

  return (
    <div className="rounded-md overflow-hidden"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>

      {/* 标题 + 汇总 */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>模型状态</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-sm"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-green)', background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.15)' }}>
            {onlineCount}/{totalCount} 在线
          </span>
        </div>
        <a href="/models" className="text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)', letterSpacing: '0.05em' }}>
          配置 →
        </a>
      </div>

      {/* 模型列表 */}
      {models.map(m => {
        const dot = STATUS_DOT[m.status];
        return (
          <div key={m.model}
            className="flex items-center gap-3 px-5 py-2.5"
            style={{ borderBottom: '1px solid var(--c-border-dim)' }}
            title={m.total > 0 ? `过去 1h: ${m.total} 次请求，成功率 ${fmtRate(m)}` : '过去 1h 无请求记录'}>

            {/* 状态点 */}
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: dot.bg, boxShadow: dot.glow ? `0 0 5px ${dot.bg}` : 'none' }} />

            {/* 模型名 + publisher */}
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

            {/* 成功率 / 状态 */}
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

      {/* 数据说明 */}
      <div className="px-5 py-2 text-[9px]"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', borderTop: '1px solid var(--c-border-dim)' }}>
        基于过去 1 小时请求日志 · 成功率 ≥95% = 正常
      </div>
    </div>
  );
}
