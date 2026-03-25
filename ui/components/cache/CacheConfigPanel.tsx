'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CacheConfigPanelProps {
  currentThreshold: number | null;  // null = 使用代码默认值
  defaultThreshold: number;
}

const PRESETS = [
  { label: '严格 0.99', value: 0.99, desc: '几乎完全相同才命中，精度最高，命中率最低' },
  { label: '推荐 0.97', value: 0.97, desc: '语义高度相似即命中，精度与命中率均衡' },
  { label: '默认 0.95', value: 0.95, desc: '代码内默认值，语义相近即命中，命中率较高' },
  { label: '宽松 0.93', value: 0.93, desc: '语义接近即命中，命中率高，偶有不精确响应' },
];

export function CacheConfigPanel({ currentThreshold, defaultThreshold }: CacheConfigPanelProps) {
  const router  = useRouter();
  const effective = currentThreshold ?? defaultThreshold;

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
      if (!res.ok) { setError(d.error ?? '保存失败'); return; }
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
    if (isNaN(n) || n <= 0 || n > 1) { setError('请输入 0.01 ~ 1.00 之间的数值'); return; }
    save(n);
  }

  const MONO = { fontFamily: 'IBM Plex Mono, monospace' };

  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      {/* 标题 */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>
          语义相似度阈值配置
        </div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>
          写入 Apigee KVM cache-config，约 30s 生效，无需重新部署。当前生效值：
          <span style={{ color: 'var(--c-green)', ...MONO }}> {effective}</span>
          {currentThreshold === null && <span style={{ color: 'var(--c-txt-3)' }}> (代码默认)</span>}
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* 错误提示 */}
        {error && (
          <div className="text-[11px] px-3 py-2 rounded-sm" style={{ ...MONO, color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            ✗ {error}
          </div>
        )}

        {/* 预设快捷按钮 */}
        <div>
          <div className="text-[9px] uppercase tracking-[0.15em] mb-2" style={{ ...MONO, color: 'var(--c-txt-3)' }}>预设值</div>
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

        {/* 自定义输入 */}
        <div>
          <div className="text-[9px] uppercase tracking-[0.15em] mb-2" style={{ ...MONO, color: 'var(--c-txt-3)' }}>自定义值（0.01 ~ 1.00）</div>
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
              {saving ? '保存中…' : saved ? '✓ 已保存' : '应用'}
            </button>

            {/* 恢复代码默认值 */}
            {currentThreshold !== null && (
              <button
                onClick={() => { setInput(String(defaultThreshold)); save(null); }}
                disabled={saving}
                className="text-[11px] px-3 py-2 rounded-sm"
                style={{ ...MONO, color: 'var(--c-txt-3)', background: 'transparent', border: '1px solid var(--c-border-dim)', cursor: 'pointer' }}>
                恢复默认 ({defaultThreshold})
              </button>
            )}
          </div>
        </div>

        {/* 阈值影响说明 */}
        <div className="px-3 py-3 rounded-sm space-y-1.5" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
          <div className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>阈值越高 → 命中条件越严格 → 命中率越低，但响应越精确</div>
          <div className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>阈值越低 → 命中条件越宽松 → 命中率越高，但可能返回语义偏差的缓存</div>
          <div className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>修改后约 30s 生效（KVM ExpiryTimeInSecs=30），不影响已有缓存条目</div>
        </div>
      </div>
    </div>
  );
}
