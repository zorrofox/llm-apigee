'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

interface CacheConfigPanelProps {
  currentThreshold: number | null;
  defaultThreshold: number;
}

const T_EN = {
  title: 'Semantic Similarity Threshold',
  subtitlePrefix: 'Writes to Apigee KVM cache-config, takes effect in ~30s, no redeploy needed. Active value: ',
  codeDefault: ' (code default)',
  saveFailed: 'Save failed',
  rangeError: 'Please enter a value between 0.01 and 1.00',
  presetsLabel: 'Presets',
  customLabel: 'Custom value (0.01 ~ 1.00)',
  saving: 'Saving...',
  saved: '✓ Saved',
  apply: 'Apply',
  resetTitle: 'Reset to default ({n})',
  hint1: 'Higher threshold → stricter match → fewer hits, more precise responses',
  hint2: 'Lower threshold → looser match → more hits, possibly less precise responses',
  hint3: 'Changes take effect in ~30s (KVM ExpiryTimeInSecs=30), existing cache entries unaffected',
  presetStrict:    'Strict 0.99',
  presetStrictDesc:'Near-identical to hit. Highest precision, lowest hit rate',
  presetRecommend: 'Recommended 0.97',
  presetRecommendDesc: 'High semantic similarity to hit. Balanced precision and hit rate',
  presetDefault:   'Default 0.95',
  presetDefaultDesc: 'Code default. Semantically close to hit. Higher hit rate',
  presetLoose:     'Loose 0.93',
  presetLooseDesc: 'Semantically near to hit. Highest hit rate, occasional imprecise responses',
};

const T_ZH = {
  title: '语义相似度阈值配置',
  subtitlePrefix: '写入 Apigee KVM cache-config，约 30s 生效，无需重新部署。当前生效值：',
  codeDefault: ' (代码默认)',
  saveFailed: '保存失败',
  rangeError: '请输入 0.01 ~ 1.00 之间的数值',
  presetsLabel: '预设值',
  customLabel: '自定义值（0.01 ~ 1.00）',
  saving: '保存中…',
  saved: '✓ 已保存',
  apply: '应用',
  resetTitle: '恢复默认 ({n})',
  hint1: '阈值越高 → 命中条件越严格 → 命中率越低，但响应越精确',
  hint2: '阈值越低 → 命中条件越宽松 → 命中率越高，但可能返回语义偏差的缓存',
  hint3: '修改后约 30s 生效（KVM ExpiryTimeInSecs=30），不影响已有缓存条目',
  presetStrict:    '严格 0.99',
  presetStrictDesc:'几乎完全相同才命中，精度最高，命中率最低',
  presetRecommend: '推荐 0.97',
  presetRecommendDesc: '语义高度相似即命中，精度与命中率均衡',
  presetDefault:   '默认 0.95',
  presetDefaultDesc: '代码内默认值，语义相近即命中，命中率较高',
  presetLoose:     '宽松 0.93',
  presetLooseDesc: '语义接近即命中，命中率高，偶有不精确响应',
};

export function CacheConfigPanel({ currentThreshold, defaultThreshold }: CacheConfigPanelProps) {
  const locale  = useLocale();
  const T = locale === 'zh' ? T_ZH : T_EN;
  const router  = useRouter();
  const effective = currentThreshold ?? defaultThreshold;

  const PRESETS = [
    { label: T.presetStrict,    value: 0.99, desc: T.presetStrictDesc    },
    { label: T.presetRecommend, value: 0.97, desc: T.presetRecommendDesc },
    { label: T.presetDefault,   value: 0.95, desc: T.presetDefaultDesc   },
    { label: T.presetLoose,     value: 0.93, desc: T.presetLooseDesc     },
  ];

  const [input,   setInput]   = useState(String(effective));
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  async function save(value: number | null) {
    setSaving(true); setSaved(false); setError('');
    try {
      const res = await fetch('/api/cache', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ similarityThreshold: value }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? T.saveFailed); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  function applyPreset(v: number) {
    setInput(String(v));
    save(v);
  }

  function applyCustom() {
    const n = parseFloat(input);
    if (isNaN(n) || n <= 0 || n > 1) { setError(T.rangeError); return; }
    save(n);
  }

  const MONO = { fontFamily: 'IBM Plex Mono, monospace' };

  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>
          {T.title}
        </div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>
          {T.subtitlePrefix}
          <span style={{ color: 'var(--c-green)', ...MONO }}> {effective}</span>
          {currentThreshold === null && <span style={{ color: 'var(--c-txt-3)' }}>{T.codeDefault}</span>}
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {error && (
          <div className="text-[11px] px-3 py-2 rounded-sm" style={{ ...MONO, color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            ✗ {error}
          </div>
        )}

        <div>
          <div className="text-[9px] uppercase tracking-[0.15em] mb-2" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{T.presetsLabel}</div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(p => {
              const isActive = Math.abs(effective - p.value) < 0.001;
              return (
                <button
                  key={p.value}
                  onClick={() => applyPreset(p.value)}
                  disabled={saving}
                  className="text-left px-3 py-2.5 rounded-sm transition-all"
                  style={{
                    background: isActive ? 'rgba(0,232,122,0.08)' : 'var(--c-bg)',
                    border:     isActive ? '1px solid rgba(0,232,122,0.25)' : '1px solid var(--c-border)',
                    cursor:     saving ? 'not-allowed' : 'pointer',
                  }}>
                  <div className="text-[12px] font-medium" style={{ ...MONO, color: isActive ? 'var(--c-green)' : 'var(--c-txt-1)' }}>
                    {p.label}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-txt-3)' }}>{p.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-[0.15em] mb-2" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{T.customLabel}</div>
          <div className="flex items-center gap-2">
            <input
              type="number" step="0.01" min="0.01" max="1.00"
              value={input}
              onChange={e => { setInput(e.target.value); setError(''); }}
              className="w-32 text-[12px] px-3 py-2 rounded-sm outline-none"
              style={{ ...MONO, background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-txt-1)' }}
            />
            <button
              onClick={applyCustom}
              disabled={saving}
              className="text-[11px] px-4 py-2 rounded-sm transition-all"
              style={{
                ...MONO,
                background: saved ? 'var(--c-green)' : 'rgba(0,232,122,0.1)',
                color:      saved ? '#050a0f' : 'var(--c-green)',
                border:     '1px solid rgba(0,232,122,0.3)',
                cursor:     saving ? 'not-allowed' : 'pointer',
                opacity:    saving ? 0.6 : 1,
              }}>
              {saving ? T.saving : saved ? T.saved : T.apply}
            </button>

            {currentThreshold !== null && (
              <button
                onClick={() => { setInput(String(defaultThreshold)); save(null); }}
                disabled={saving}
                className="text-[11px] px-3 py-2 rounded-sm"
                style={{ ...MONO, color: 'var(--c-txt-3)', background: 'transparent', border: '1px solid var(--c-border-dim)', cursor: 'pointer' }}>
                {T.resetTitle.replace('{n}', String(defaultThreshold))}
              </button>
            )}
          </div>
        </div>

        <div className="px-3 py-3 rounded-sm space-y-1.5" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
          <div className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{T.hint1}</div>
          <div className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{T.hint2}</div>
          <div className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{T.hint3}</div>
        </div>
      </div>
    </div>
  );
}
