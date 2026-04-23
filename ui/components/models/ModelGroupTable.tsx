'use client';

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import { useLocale }               from 'next-intl';
import type { ModelEntry, BackendType } from '@/lib/model-routing';

const T_EN = {
  geminiLabel: 'Gemini (Google Vertex AI)',
  claudeLabel: 'Claude (Anthropic Vertex AI)',
  maasLabel: 'MaaS Partners (Vertex AI OpenAPI)',
  opencodeLabel: 'OpenCode Zen (Free)',
  aliasesCount: (n: number) => `${n} aliases`,
  callsCount: (n: number) => `${n} calls`,
  enable: 'Enable',
  disable: 'Disable',
  setDefault: 'Set default',
  opActionFailed: 'Action failed',
  saveFailed: 'Save failed',
  inProgress: 'In progress, waiting for KVM cache refresh (~30s)...',
  groupCount: (n: number) => `${n}`,
  disabledCount: (n: number) => `${n} disabled`,
  freeNoQuota: 'Free · not subject to Token Quota',
  thAlias: 'Alias (primary)',
  thActualModel: 'Actual model ID',
  thLastHour: 'Past 1h',
  thActions: 'Actions',
  noTraffic: '—',
  extraTitle: 'Add models dynamically (KVM extra_routes)',
  extraSubtitle: 'Takes effect ~30s after save, no proxy redeploy needed',
  saving: 'Saving...',
  saved: '✓ Saved',
  save: 'Save',
  fourTypes: 'Four types: ',
  schemaLine: 'gemini: {project, model}  |  claude: "model-id"  |  maas: {pub, model}  |  opencode: key must start with opencode/',
};

const T_ZH = {
  geminiLabel: 'Gemini (Google Vertex AI)',
  claudeLabel: 'Claude (Anthropic Vertex AI)',
  maasLabel: 'MaaS 合作伙伴 (Vertex AI OpenAPI)',
  opencodeLabel: 'OpenCode Zen (免费)',
  aliasesCount: (n: number) => `${n} 个别名`,
  callsCount: (n: number) => `${n} 次`,
  enable: '启用',
  disable: '禁用',
  setDefault: '设为默认',
  opActionFailed: '操作失败',
  saveFailed: '保存失败',
  inProgress: '操作中，等待 KVM 缓存刷新（约 30s）…',
  groupCount: (n: number) => `${n} 个`,
  disabledCount: (n: number) => `${n} 已禁用`,
  freeNoQuota: '免费 · 不受 Token Quota 约束',
  thAlias: '别名（主）',
  thActualModel: '实际模型 ID',
  thLastHour: '过去 1h',
  thActions: '操作',
  noTraffic: '—',
  extraTitle: '动态新增模型（KVM extra_routes）',
  extraSubtitle: '保存后约 30s 生效，无需重新部署 Apigee 代理',
  saving: '保存中…',
  saved: '✓ 已保存',
  save: '保存',
  fourTypes: '四种类型：',
  schemaLine: 'gemini: {project, model}  |  claude: "model-id"  |  maas: {pub, model}  |  opencode: key 须含 opencode/ 前缀',
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

function ModelRow({
  T, model, onToggle, onSetDefault,
}: {
  T:             typeof T_EN;
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
                  {showAliases ? '▼' : '▶'} {T.aliasesCount(model.aliases.length)}
                </button>
              )}
            </div>
          </div>
        </td>

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

        <td className="px-4 py-2.5">
          <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: model.callsLastHr > 0 ? color : 'var(--c-txt-3)' }}>
            {model.callsLastHr > 0 ? T.callsCount(model.callsLastHr) : T.noTraffic}
          </span>
        </td>

        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
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
                {model.disabled ? T.enable : T.disable}
              </button>
            )}
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
                {T.setDefault}
              </button>
            )}
          </div>
        </td>
      </tr>

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

interface ModelGroupTableProps {
  models:       ModelEntry[];
  kvmExtraRaw:  string;
}

export function ModelGroupTable({ models, kvmExtraRaw }: ModelGroupTableProps) {
  const router          = useRouter();
  const locale          = useLocale();
  const T               = locale === 'zh' ? T_ZH : T_EN;

  const BACKEND_LABEL: Record<BackendType, string> = {
    gemini:   T.geminiLabel,
    claude:   T.claudeLabel,
    maas:     T.maasLabel,
    opencode: T.opencodeLabel,
  };

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
      if (!res.ok) { setError(d.error ?? T.opActionFailed); return; }
      startTransition(() => router.refresh());
    } catch (e) { setError(String(e)); }
    finally { setSaving(null); }
  }

  async function saveExtraRoutes() {
    setExtraSaving(true);
    setError('');
    try {
      JSON.parse(extra);
      const res = await fetch('/api/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setExtraRoutes', value: extra }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? T.saveFailed); return; }
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
      {error && (
        <div className="px-4 py-2 rounded-md text-[11px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
          ✗ {error}
        </div>
      )}

      {(pending || saving) && (
        <div className="text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
          {T.inProgress}
        </div>
      )}

      {BACKENDS.map(bt => {
        const group   = byBackend(bt);
        const color   = BACKEND_COLOR[bt];
        const disabled = group.filter(m => m.disabled).length;
        const isCollapsed = collapsed[bt];

        return (
          <div key={bt} className="rounded-md overflow-hidden"
            style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
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
                  {T.groupCount(group.length)}
                </span>
                {disabled > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm"
                    style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
                    {T.disabledCount(disabled)}
                  </span>
                )}
                {bt === 'opencode' && (
                  <span className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                    {T.freeNoQuota}
                  </span>
                )}
              </div>
              <span style={{ color: 'var(--c-txt-3)', fontSize: '12px' }}>{isCollapsed ? '▶' : '▼'}</span>
            </button>

            {!isCollapsed && (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                    {[T.thAlias, T.thActualModel, T.thLastHour, T.thActions].map(h => (
                      <th key={h} className="px-4 py-2 text-left" style={LABEL_STYLE}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.map(m => (
                    <ModelRow
                      T={T}
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

      <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
          <div>
            <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>
              {T.extraTitle}
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>
              {T.extraSubtitle}
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
            {extraSaving ? T.saving : extraSaved ? T.saved : T.save}
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
          />
          <div className="mt-2 space-y-1">
            <div className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              {T.fourTypes}<span style={{ color: 'var(--c-green)' }}>gemini</span> · <span style={{ color: 'var(--c-blue)' }}>claude</span> · <span style={{ color: 'var(--c-amber)' }}>maas</span> · <span style={{ color: 'var(--c-txt-3)' }}>opencode</span>
            </div>
            <div className="text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
              {T.schemaLine}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
