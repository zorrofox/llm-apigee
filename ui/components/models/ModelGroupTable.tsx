'use client';

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import type { ModelEntry, BackendType } from '@/lib/model-routing';

// ── 常量 ──────────────────────────────────────────────────────────────────────

const BACKEND_LABEL: Record<BackendType, string> = {
  gemini:   'Gemini (Google Vertex AI)',
  claude:   'Claude (Anthropic Vertex AI)',
  maas:     'MaaS 合作伙伴 (Vertex AI OpenAPI)',
  opencode: 'OpenCode Zen (免费)',
};

const BACKEND_COLOR: Record<BackendType, string> = {
  gemini:   'var(--c-green)',
  claude:   'var(--c-blue)',
  maas:     'var(--c-amber)',
  opencode: 'var(--c-txt-3)',
};

const LABEL_STYLE = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: '9px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-txt-3)',
};

// ── 单行模型 ──────────────────────────────────────────────────────────────────

function ModelRow({
  model, onToggle, onSetDefault,
}: {
  model:         ModelEntry;
  onToggle:      (alias: string, disabled: boolean) => void;
  onSetDefault:  (alias: string) => void;
}) {
  const [showAliases, setShowAliases] = useState(false);
  const color = BACKEND_COLOR[model.backend];

  return (
    <>
      <tr
        style={{
          borderBottom: '1px solid var(--c-border-dim)',
          opacity: model.disabled ? 0.45 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {/* 状态点 + 别名 */}
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: model.disabled ? 'var(--c-border)' : color,
                boxShadow:  model.disabled ? 'none' : `0 0 4px ${color}`,
              }}
            />
            <div>
              <div className="text-[12px] font-medium flex items-center gap-1.5"
                style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-1)' }}>
                {model.alias}
                {model.isDefault && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-sm"
                    style={{ background: 'rgba(0,232,122,0.1)', color: 'var(--c-green)', border: '1px solid rgba(0,232,122,0.2)' }}>
                    DEFAULT
                  </span>
                )}
                {model.isExtra && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-sm"
                    style={{ background: 'rgba(61,158,255,0.08)', color: 'var(--c-blue)', border: '1px solid rgba(61,158,255,0.2)' }}>
                    KVM
                  </span>
                )}
              </div>
              {model.aliases.length > 1 && (
                <button
                  onClick={() => setShowAliases(v => !v)}
                  className="text-[9px] mt-0.5"
                  style={{ color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace', padding: 0 }}>
                  {showAliases ? '▼' : '▶'} {model.aliases.length} 个别名
                </button>
              )}
            </div>
          </div>
        </td>

        {/* 实际模型 ID */}
        <td className="px-4 py-2.5">
          <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-2)' }}>
            {model.actualModel}
          </span>
          {model.project && model.project !== (process.env.NEXT_PUBLIC_PROJECT_ID ?? '') && (
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--c-txt-3)' }}>
              project: {model.project}
            </div>
          )}
        </td>

        {/* 过去 1h 流量 */}
        <td className="px-4 py-2.5">
          <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: model.callsLastHr > 0 ? color : 'var(--c-txt-3)' }}>
            {model.callsLastHr > 0 ? `${model.callsLastHr} 次` : '—'}
          </span>
        </td>

        {/* 操作 */}
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            {/* OpenCode 模型不支持禁用（后端已排除在 quota 之外） */}
            {model.backend !== 'opencode' && (
              <button
                onClick={() => onToggle(model.alias, !model.disabled)}
                className="text-[10px] px-2.5 py-1 rounded-sm transition-all"
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  color:      model.disabled ? 'var(--c-green)' : 'var(--c-red)',
                  background: model.disabled ? 'rgba(0,232,122,0.06)' : 'rgba(244,63,94,0.06)',
                  border:     model.disabled ? '1px solid rgba(0,232,122,0.2)' : '1px solid rgba(244,63,94,0.2)',
                  cursor:     'pointer',
                }}>
                {model.disabled ? '启用' : '禁用'}
              </button>
            )}
            {/* 设为默认（仅 Gemini） */}
            {model.backend === 'gemini' && !model.isDefault && !model.disabled && (
              <button
                onClick={() => onSetDefault(model.alias)}
                className="text-[10px] px-2.5 py-1 rounded-sm"
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  color:      'var(--c-txt-3)',
                  background: 'transparent',
                  border:     '1px solid var(--c-border-dim)',
                  cursor:     'pointer',
                }}>
                设为默认
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* 别名展开行 */}
      {showAliases && (
        <tr style={{ borderBottom: '1px solid var(--c-border-dim)', background: 'rgba(0,0,0,0.1)' }}>
          <td colSpan={4} className="px-8 py-2">
            <div className="flex flex-wrap gap-1.5">
              {model.aliases.map(a => (
                <span key={a} className="text-[10px] px-2 py-0.5 rounded-sm"
                  style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
                  {a}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── 分组表格 ──────────────────────────────────────────────────────────────────

interface ModelGroupTableProps {
  models:       ModelEntry[];
  kvmExtraRaw:  string;
}

export function ModelGroupTable({ models, kvmExtraRaw }: ModelGroupTableProps) {
  const router          = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving,  setSaving]  = useState<string | null>(null);
  const [error,   setError]   = useState('');
  const [extra,   setExtra]   = useState(kvmExtraRaw);
  const [extraSaving, setExtraSaving] = useState(false);
  const [extraSaved,  setExtraSaved]  = useState(false);
  const [collapsed, setCollapsed] = useState<Record<BackendType, boolean>>({
    gemini: false, claude: false, maas: false, opencode: true,
  });

  async function applyAction(action: string, model?: string, value?: string) {
    setSaving(model ?? action);
    setError('');
    try {
      const res = await fetch('/api/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, model, value }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? '操作失败'); return; }
      startTransition(() => router.refresh());
    } catch (e) { setError(String(e)); }
    finally { setSaving(null); }
  }

  async function saveExtraRoutes() {
    setExtraSaving(true);
    setError('');
    try {
      JSON.parse(extra); // 前置验证
      const res = await fetch('/api/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setExtraRoutes', value: extra }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? '保存失败'); return; }
      setExtraSaved(true);
      setTimeout(() => setExtraSaved(false), 2000);
      startTransition(() => router.refresh());
    } catch (e) { setError(String(e)); }
    finally { setExtraSaving(false); }
  }

  const byBackend = (bt: BackendType) => models.filter(m => m.backend === bt);
  const BACKENDS: BackendType[] = ['gemini', 'claude', 'maas', 'opencode'];

  return (
    <div className="space-y-4">
      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 rounded-md text-[11px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
          ✗ {error}
        </div>
      )}

      {/* 加载指示 */}
      {(pending || saving) && (
        <div className="text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
          操作中，等待 KVM 缓存刷新（约 30s）…
        </div>
      )}

      {/* 各后端分组 */}
      {BACKENDS.map(bt => {
        const group   = byBackend(bt);
        const color   = BACKEND_COLOR[bt];
        const disabled = group.filter(m => m.disabled).length;
        const isCollapsed = collapsed[bt];

        return (
          <div key={bt} className="rounded-md overflow-hidden"
            style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
            {/* 分组标题 */}
            <button
              className="w-full flex items-center justify-between px-5 py-3.5"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: isCollapsed ? 'none' : '1px solid var(--c-border-dim)' }}
              onClick={() => setCollapsed(prev => ({ ...prev, [bt]: !prev[bt] }))}>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--c-txt-1)' }}>
                  {BACKEND_LABEL[bt]}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm"
                  style={{ fontFamily: 'IBM Plex Mono, monospace', color, background: `${color}12`, border: `1px solid ${color}30` }}>
                  {group.length} 个
                </span>
                {disabled > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm"
                    style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
                    {disabled} 已禁用
                  </span>
                )}
                {bt === 'opencode' && (
                  <span className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                    免费 · 不受 Token Quota 约束
                  </span>
                )}
              </div>
              <span style={{ color: 'var(--c-txt-3)', fontSize: '12px' }}>{isCollapsed ? '▶' : '▼'}</span>
            </button>

            {/* 模型表格 */}
            {!isCollapsed && (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                    {['别名（主）', '实际模型 ID', '过去 1h', '操作'].map(h => (
                      <th key={h} className="px-4 py-2 text-left" style={LABEL_STYLE}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.map(m => (
                    <ModelRow
                      key={m.alias}
                      model={m}
                      onToggle={(alias, disable) => applyAction(disable ? 'disable' : 'enable', alias)}
                      onSetDefault={(alias) => applyAction('setDefault', alias)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {/* KVM extra_routes 编辑器 */}
      <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
          <div>
            <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>
              动态新增模型（KVM extra_routes）
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>
              保存后约 30s 生效，无需重新部署 Apigee 代理
            </div>
          </div>
          <button
            onClick={saveExtraRoutes}
            disabled={extraSaving}
            className="text-[11px] px-4 py-1.5 rounded-sm transition-all"
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              background: extraSaved ? 'var(--c-green)' : 'rgba(0,232,122,0.1)',
              color:      extraSaved ? '#050a0f' : 'var(--c-green)',
              border:     '1px solid rgba(0,232,122,0.3)',
              cursor:     extraSaving ? 'not-allowed' : 'pointer',
            }}>
            {extraSaving ? '保存中…' : extraSaved ? '✓ 已保存' : '保存'}
          </button>
        </div>
        <div className="px-5 py-4">
          <textarea
            value={extra}
            onChange={e => { setExtra(e.target.value); setError(''); }}
            rows={12}
            className="w-full rounded-sm outline-none text-[11px]"
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              background: 'var(--c-bg)',
              border:     '1px solid var(--c-border)',
              color:      'var(--c-txt-1)',
              padding:    '10px 12px',
              resize:     'vertical',
            }}
            placeholder={`// 示例：同时新增多类型模型（去掉这行注释再保存）
{
  "gemini": {
    // 新 Gemini 模型（generateContent），project 可选 YOUR_PROJECT_ID 或 YOUR_CROSS_PROJECT_ID（跨项目）
    "gemini-3.2-pro":          { "project": "YOUR_PROJECT_ID", "model": "gemini-3.2-pro-preview" },
    "YOUR_CROSS_PROJECT_ID/gemini-3.2-flash":{ "project": "YOUR_CROSS_PROJECT_ID",    "model": "gemini-3.2-flash-preview" }
  },
  "claude": {
    // 新 Claude 模型（rawPredict），value = Vertex AI 上的 Anthropic 模型 ID
    "claude-haiku-4-6": "claude-haiku-4-6",
    "haiku":            "claude-haiku-4-5"
  },
  "maas": {
    // MaaS 合作伙伴（Vertex AI OpenAPI endpoint）
    // pub: qwen / deepseek-ai / zai-org / moonshotai / minimaxai
    // model: publisher/model-id-maas 格式
    "qwen3-72b":    { "pub": "qwen",        "model": "qwen/qwen3-72b-instruct-maas" },
    "deepseek-v3.3":{ "pub": "deepseek-ai", "model": "deepseek-ai/deepseek-v3.3-maas" }
  },
  "opencode": {
    // key 必须以 opencode/ 开头，value 是 OpenCode 平台的实际模型名
    "opencode/qwen3-free": "qwen3-free"
  }
}`}
          />
          <div className="mt-2 space-y-1">
            <div className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              四种类型：<span style={{ color: 'var(--c-green)' }}>gemini</span> · <span style={{ color: 'var(--c-blue)' }}>claude</span> · <span style={{ color: 'var(--c-amber)' }}>maas</span> · <span style={{ color: 'var(--c-txt-3)' }}>opencode</span>
            </div>
            <div className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              gemini: {'{'}project, model{'}'} &nbsp;|&nbsp; claude: {'"model-id"'} &nbsp;|&nbsp; maas: {'{'}pub, model{'}'} &nbsp;|&nbsp; opencode: key 须含 opencode/ 前缀
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
