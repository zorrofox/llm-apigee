'use client';

import { useState } from 'react';
import type { ApiApp } from '@/lib/apigee';

/** 计费模型权重（与 compute-effective-tokens.js 中的 MODEL_WEIGHTS 保持同步） */
const INITIAL_WEIGHTS: Record<string, number> = {
  'gemini-2.0-flash-001':  1.0,
  'gemini-2.0-flash-lite': 0.5,
  'gemini-2.5-flash-lite': 1.0,
  'gemini-2.5-flash':      3.5,
  'gemini-2.5-pro':        37.5,
  'gemini-3-flash-preview':3.5,
  'gemini-3-pro-preview':  37.5,
  'gemini-3.1-pro-preview':37.5,
  'claude-haiku-4-5':      6.25,
  'claude-sonnet-4-5':     37.5,
  'claude-sonnet-4-6':     37.5,
  'claude-opus-4-5':       187.5,
  'claude-opus-4-6':       187.5,
  'deepseek-v3.2':         5.0,
  'kimi-k2-thinking':      15.0,
  'minimax-m2':            10.0,
  'qwen3-235b':            10.0,
};

/**
 * 免费模型列表（不参与 token quota 计算）
 * Apigee 代理中 JS-DetectBackend 将这些模型标记为 backend="opencode"
 * Q-TokenQuota 和 JS-ComputeEffectiveTokens 均有条件 NOT (llm.backend = "opencode")
 * 因此权重对它们没有实际意义，此处仅用于 UI 展示说明
 */
const FREE_MODELS = [
  { name: 'opencode/nemotron-3-super-free',     provider: 'Nvidia / OpenCode Zen'   },
  { name: 'opencode/big-pickle',                provider: 'MiniMax / OpenCode Zen'  },
  { name: 'opencode/minimax-m2.5-free',         provider: 'MiniMax / OpenCode Zen'  },
  { name: 'opencode/mimo-v2-flash-free',        provider: 'MiMo / OpenCode Zen'     },
  { name: 'opencode/mimo-v2-pro-free',          provider: 'MiMo / OpenCode Zen'     },
  { name: 'opencode/mimo-v2-omni-free',         provider: 'MiMo / OpenCode Zen'     },
  { name: 'opencode/trinity-large-preview-free',provider: 'Trinity / OpenCode Zen'  },
];

/** API Product 分层配置 */
const PRODUCTS = [
  { name: 'llm-gateway-product', display: 'llm-gateway-product（生产）', reqQuota: 1000, tokenQuota: 1_000_000, interval: '1', timeUnit: 'hour' },
];

const LABEL_STYLE = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: '9px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-txt-3)',
};

/** 从 App attributes 中读取 token.quota.limit（App 级覆盖值） */
function getAppQuotaOverride(app: ApiApp): string {
  return app.attributes?.find(a => a.name === 'token.quota.limit')?.value ?? '';
}

interface ProductConfig {
  reqQuota:   number;
  tokenQuota: number;
  interval:   string;
  timeUnit:   string;
}

interface QuotaEditorProps {
  apps:                ApiApp[];
  tokenUsage?:         Record<string, number>;
  initialProductConfig?: ProductConfig;  // 从 Apigee 读取的真实配置
}

export function QuotaEditor({ apps, tokenUsage = {}, initialProductConfig }: QuotaEditorProps) {
  const [weights, setWeights]   = useState(INITIAL_WEIGHTS);
  // 用 Apigee 读取的真实值初始化，没有则用硬编码默认值
  const [products, setProducts] = useState(() =>
    PRODUCTS.map(p => initialProductConfig ? { ...p, ...initialProductConfig } : p)
  );

  // 每个 Product 保存状态
  const [prodSaving, setProdSaving] = useState<string | null>(null);
  const [prodSaved,  setProdSaved]  = useState<string | null>(null);

  // 每个 App 的本地配额编辑值（key = appId）
  const [appLimits, setAppLimits] = useState<Record<string, string>>(
    Object.fromEntries(apps.map(a => [a.appId, getAppQuotaOverride(a)]))
  );
  const [appSaving, setAppSaving] = useState<string | null>(null);
  const [appSaved,  setAppSaved]  = useState<string | null>(null);
  const [appError,  setAppError]  = useState<string | null>(null);

  // ── Product 配额保存（同时保存 token 配额和请求数配额）────────────────────────
  async function saveProductQuota(p: typeof PRODUCTS[number]) {
    setProdSaving(p.name);
    try {
      const res = await fetch('/api/quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName:     p.name,
          tokenQuotaLimit: p.tokenQuota,
          reqQuota:        p.reqQuota,
          interval:        p.interval,
          timeUnit:        p.timeUnit,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        console.error('保存 Product 配额失败:', d.error);
      } else {
        setProdSaved(p.name);
        setTimeout(() => setProdSaved(null), 2000);
      }
    } catch (e) {
      console.error('保存 Product 配额失败:', e);
    } finally {
      setProdSaving(null);
    }
  }

  // ── App 配额保存 ─────────────────────────────────────────────────────────────
  async function saveAppQuota(app: ApiApp) {
    if (!app.developerEmail) return;
    setAppSaving(app.appId);
    setAppError(null);
    try {
      const limit = appLimits[app.appId];
      const res = await fetch('/api/quota/app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developerEmail: app.developerEmail,
          appName: app.name,
          tokenQuotaLimit: limit === '' ? null : Number(limit),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setAppError(d.error ?? '保存失败');
      } else {
        setAppSaved(app.appId);
        setTimeout(() => setAppSaved(null), 2000);
      }
    } catch (e) {
      setAppError(String(e));
    } finally {
      setAppSaving(null);
    }
  }


  return (
    <div className="space-y-4">

      {/* ── 1. API Product 默认配额 ─────────────────────────────────────────── */}
      <Section
        title="API Product 默认配额"
        subtitle="所有 App 共用的上限，未单独设置覆盖时生效。修改后约 5 分钟生效（Apigee 属性缓存 TTL）。"
      >
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              {['Product', '请求配额', 'Token 配额', '时间窗口', '操作'].map(h => (
                <th key={h} className="px-5 py-3 text-left" style={LABEL_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.name} style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                <td className="px-5 py-4">
                  <div className="text-[12px] font-medium" style={{ color: 'var(--c-txt-1)' }}>{p.display}</div>
                </td>
                <td className="px-5 py-4">
                  <NumInput
                    value={p.reqQuota}
                    onChange={v => setProducts(prev => prev.map(x => x.name === p.name ? { ...x, reqQuota: v } : x))}
                    unit="req/min"
                    width="w-24"
                  />
                </td>
                <td className="px-5 py-4">
                  <NumInput
                    value={p.tokenQuota}
                    onChange={v => setProducts(prev => prev.map(x => x.name === p.name ? { ...x, tokenQuota: v } : x))}
                    unit="有效 tokens"
                    width="w-32"
                  />
                </td>
                <td className="px-5 py-4">
                  <select
                    value={`${p.interval}_${p.timeUnit}`}
                    onChange={e => {
                      const [interval, timeUnit] = e.target.value.split('_');
                      setProducts(prev => prev.map(x => x.name === p.name ? { ...x, interval, timeUnit } : x));
                    }}
                    className="text-[11px] px-2 py-1.5 rounded-sm outline-none"
                    style={{ fontFamily: 'IBM Plex Mono, monospace', background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-txt-1)' }}
                  >
                    <option value="1_minute">每分钟</option>
                    <option value="1_hour">每小时</option>
                    <option value="1_day">每天</option>
                  </select>
                </td>
                <td className="px-5 py-4">
                  <SaveBtn
                    saving={prodSaving === p.name}
                    saved={prodSaved === p.name}
                    onClick={() => saveProductQuota(p)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── 2. 按 App 独立配额 ──────────────────────────────────────────────── */}
      <Section
        title="按 App 独立配额"
        subtitle={
          <>
            覆盖 Product 默认值，精细控制每个客户端的用量。留空表示沿用 Product 默认配额。
            <br />
            优先级：<span style={{ color: 'var(--c-green)' }}>App 级覆盖</span> &gt; Product 默认 &gt; Policy 兜底（1M tokens/hr）
          </>
        }
      >
        {appError && (
          <div className="px-5 py-2 text-[11px]" style={{ color: 'var(--c-red)', fontFamily: 'IBM Plex Mono, monospace', background: 'rgba(244,63,94,0.08)', borderBottom: '1px solid var(--c-border-dim)' }}>
            ✗ {appError}
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              {['App / 开发者', '来源', '本小时用量', 'Token 配额覆盖（/hr）', '操作'].map(h => (
                <th key={h} className="px-5 py-3 text-left" style={LABEL_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.map(app => {
              const override = appLimits[app.appId] ?? '';
              const hasOverride = override !== '';
              return (
                <tr key={app.appId} style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                  {/* App 信息 */}
                  <td className="px-5 py-3">
                    <div className="text-[12px] font-medium" style={{ color: 'var(--c-txt-1)' }}>{app.name}</div>
                    <div className="text-[10px] mt-0.5" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                      {app.developerEmail}
                    </div>
                  </td>

                  {/* 来源标签 */}
                  <td className="px-5 py-3">
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-sm tracking-[0.08em] uppercase"
                      style={{
                        fontFamily: 'IBM Plex Mono, monospace',
                        color:      hasOverride ? 'var(--c-green)' : 'var(--c-txt-3)',
                        background: hasOverride ? 'rgba(0,232,122,0.08)' : 'transparent',
                        border:     hasOverride ? '1px solid rgba(0,232,122,0.2)' : '1px solid var(--c-border-dim)',
                      }}
                    >
                      {hasOverride ? 'App 覆盖' : 'Product 默认'}
                    </span>
                  </td>

                  {/* 本小时用量进度 */}
                  <td className="px-5 py-3" style={{ minWidth: '160px' }}>
                    {(() => {
                      const used  = tokenUsage[app.name] ?? 0;
                      // 分母优先级：App 级覆盖 > Product 实际配额（从 Apigee 读取）> 兜底 1M
                      const appOverride = app.attributes?.find(a => a.name === 'token.quota.limit')?.value;
                      const limit = Number(
                        (appOverride && Number(appOverride) > 0 ? appOverride : null) ??
                        initialProductConfig?.tokenQuota ??
                        1_000_000
                      );
                      const pct   = Math.min(used / limit, 1);
                      const barC  = pct > 0.9 ? 'var(--c-red)' : pct > 0.7 ? 'var(--c-amber)' : 'var(--c-green)';
                      const fmtN  = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n);
                      return used > 0 ? (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--c-border)' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: barC }} />
                            </div>
                            <span className="text-[10px] whitespace-nowrap" style={{ fontFamily: 'IBM Plex Mono, monospace', color: barC }}>
                              {Math.round(pct * 100)}%
                            </span>
                          </div>
                          <div className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                            {fmtN(used)} / {fmtN(limit)} tokens
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>—</span>
                      );
                    })()}
                  </td>

                  {/* 配额输入 */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="留空 = 使用 Product 默认"
                        value={override}
                        onChange={e => setAppLimits(prev => ({ ...prev, [app.appId]: e.target.value }))}
                        className="w-48 text-[11px] px-2 py-1.5 rounded-sm outline-none"
                        style={{
                          fontFamily: 'IBM Plex Mono, monospace',
                          background: 'var(--c-bg)',
                          border: '1px solid var(--c-border)',
                          color: hasOverride ? 'var(--c-green)' : 'var(--c-txt-2)',
                        }}
                      />
                      {hasOverride && (
                        <button
                          onClick={() => {
                            setAppLimits(prev => ({ ...prev, [app.appId]: '' }));
                          }}
                          className="text-[10px]"
                          style={{ color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace' }}
                          title="清除覆盖，回退到 Product 默认"
                        >
                          ✕ 清除
                        </button>
                      )}
                    </div>
                  </td>

                  {/* 保存按钮 */}
                  <td className="px-5 py-3">
                    <SaveBtn
                      saving={appSaving === app.appId}
                      saved={appSaved === app.appId}
                      onClick={() => saveAppQuota(app)}
                    />
                  </td>
                </tr>
              );
            })}
            {apps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>
                  暂无 App 数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-5 py-3 text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', borderTop: '1px solid var(--c-border-dim)' }}>
          ⚙ App 级覆盖写入 Apigee App 自定义属性 <code>token.quota.limit</code>，由代理中 JS-ResolveTokenQuota 读取并优先使用。
        </div>
      </Section>

      {/* ── 3. 模型成本权重 ──────────────────────────────────────────────────── */}
      <WeightSection weights={weights} onWeightsChange={setWeights} />
    </div>
  );
}

// ── 模型成本权重区块 ──────────────────────────────────────────────────────────

function WeightSection({
  weights,
  onWeightsChange,
}: {
  weights: Record<string, number>;
  onWeightsChange: (w: Record<string, number>) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState('');
  const [genModel,   setGenModel]   = useState('');

  async function autoGenerate() {
    setGenerating(true);
    setGenError('');
    setGenModel('');
    try {
      const res  = await fetch('/api/weights/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error ?? '生成失败'); return; }

      // 合并：LLM 返回的权重覆盖现有，未返回的保持原样
      onWeightsChange({ ...weights, ...data.weights });
      setGenModel(data.model ?? '');
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(false);
    }
  }


  const LABEL_STYLE = {
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '9px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: 'var(--c-txt-3)',
  };

  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      {/* 标题栏 + 自动生成按钮 */}
      <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div>
          <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>模型成本权重</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>
            有效 tokens = (输入 + 输出 × 4) × 权重。基准：gemini-2.0-flash-001 = 1.0<br />
            <span style={{ color: 'var(--c-blue)' }}>自动生成</span> 仅针对计费模型（Vertex AI）。免费模型（OpenCode）由代理层排除，不受权重影响。
          </div>
          {genModel && (
            <div className="text-[10px] mt-1" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-green)' }}>
              ✓ 由 {genModel} 根据最新 Vertex AI 定价自动生成
            </div>
          )}
          {genError && (
            <div className="text-[10px] mt-1" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)' }}>
              ✗ {genError}
            </div>
          )}
        </div>
        <button
          onClick={autoGenerate}
          disabled={generating}
          className="flex items-center gap-2 text-[11px] px-4 py-2 rounded-sm transition-all flex-shrink-0 ml-4"
          style={{
            fontFamily:  'IBM Plex Mono, monospace',
            background:  generating ? 'rgba(61,158,255,0.1)' : 'rgba(61,158,255,0.08)',
            color:       generating ? 'var(--c-txt-3)' : 'var(--c-blue)',
            border:      '1px solid rgba(61,158,255,0.3)',
            cursor:      generating ? 'not-allowed' : 'pointer',
            opacity:     generating ? 0.7 : 1,
          }}
        >
          {generating ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>◌</span>
              生成中…
            </>
          ) : '⚡ 自动生成权重'}
        </button>
      </div>

      {/* 计费模型：可编辑权重 */}
      <div className="px-5 pt-3 pb-1 text-[9px] tracking-[0.15em] uppercase"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
        计费模型（Vertex AI · 受 Token Quota 约束）
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
            {['模型', '权重系数'].map(h => (
              <th key={h} className="px-5 py-2 text-left" style={LABEL_STYLE}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(weights).map(([model, w]) => (
            <tr key={model} style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              <td className="px-5 py-2">
                <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-1)' }}>
                  {model}
                </span>
              </td>
              <td className="px-5 py-2">
                <span
                  className="text-[12px] font-medium"
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    color: w > 50 ? 'var(--c-red)' : w > 10 ? 'var(--c-amber)' : 'var(--c-green)',
                  }}
                >
                  {w}×
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 免费模型：只读展示，明确标注不计配额 */}
      <div className="px-5 pt-4 pb-1 text-[9px] tracking-[0.15em] uppercase"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', borderTop: '1px solid var(--c-border-dim)', marginTop: '4px' }}>
        免费模型（OpenCode Zen · 不受 Token Quota 约束）
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
            {['模型', '状态'].map(h => (
              <th key={h} className="px-5 py-2 text-left" style={LABEL_STYLE}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FREE_MODELS.map(m => (
            <tr key={m.name} style={{ borderBottom: '1px solid var(--c-border-dim)', opacity: 0.7 }}>
              <td className="px-5 py-2">
                <div className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-1)' }}>
                  {m.name}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-txt-3)' }}>
                  {m.provider}
                </div>
              </td>
              <td className="px-5 py-2">
                <span className="text-[9px] px-2 py-0.5 rounded-sm tracking-[0.08em] uppercase"
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    color:      'var(--c-blue)',
                    background: 'rgba(61,158,255,0.08)',
                    border:     '1px solid rgba(61,158,255,0.2)',
                  }}>
                  不计配额
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="px-5 py-3 text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', borderTop: '1px solid var(--c-border-dim)' }}>
        ⚠ 修改后需同步更新 apigee/proxies/llm-gateway/apiproxy/resources/jsc/compute-effective-tokens.js 并重新部署
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── 辅助组件 ──────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, unit, width }: {
  value: number; onChange: (v: number) => void; unit: string; width: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={`${width} text-[11px] px-2 py-1.5 rounded-sm outline-none`}
        style={{ fontFamily: 'IBM Plex Mono, monospace', background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-txt-1)' }}
      />
      <span className="text-[10px]" style={{ color: 'var(--c-txt-3)', fontFamily: 'IBM Plex Mono, monospace' }}>{unit}</span>
    </div>
  );
}

function SaveBtn({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} disabled={saving}
      className="text-[11px] px-3.5 py-1.5 rounded-sm transition-all"
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        background: saved ? 'var(--c-green)' : 'rgba(0,232,122,0.1)',
        color:      saved ? '#050a0f' : 'var(--c-green)',
        border:     '1px solid rgba(0,232,122,0.3)',
        cursor:     saving ? 'not-allowed' : 'pointer',
        opacity:    saving ? 0.6 : 1,
      }}
    >
      {saving ? '保存中…' : saved ? '✓ 已保存' : '保存'}
    </button>
  );
}
