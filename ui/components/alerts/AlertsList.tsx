'use client';

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import { useLocale }               from 'next-intl';
import type { AlertPolicy, AlertStatus, AlertSeverity, NotificationChannel } from '@/lib/alerts';
import { ALERT_TEMPLATES } from '@/lib/alert-templates';

const MONO = { fontFamily: 'IBM Plex Mono, monospace' };

const T_EN = {
  statusOk: 'OK', statusApproaching: 'Near threshold', statusFiring: 'May fire', statusUnknown: 'No data',
  severityCritical: 'Critical', severityWarning: 'Warning', severityInfo: 'Info',
  recentMatches: (n: number) => `${n} matching requests recently (30min)`,
  noRecentData: 'No recent data',
  ratioMql: 'Ratio/MQL condition, cannot query in real time',
  noHourData: 'No data in the past hour (metric not reported)',
  emDash: '—',
  editTitle: 'Edit alert policy',
  threshold: 'Threshold',
  duration: 'Duration: ',
  invalidValue: 'Please enter a valid value',
  saveFailed: 'Save failed',
  newTitle: 'New alert policy',
  template: 'Alert template',
  thresholdLabel: 'Threshold ',
  notifChannel: 'Notification channel',
  noNotify: 'Do not notify',
  invalidThreshold: 'Please enter a valid threshold',
  createFailed: 'Create failed',
  cancel: 'Cancel', save: 'Save', create: 'Create', processing: 'Processing...',
  policyCount: (n: number) => `${n} policies`,
  alarmingCount: (n: number) => ` · ${n} approaching/firing`,
  allOk: ' · all OK',
  filterAll: 'All',
  newAlertBtn: '+ New alert',
  noPolicies: 'No alert policies',
  alreadyDisabled: 'Disabled',
  thresholdSuffix: (v: string | number, d: string) => ` · threshold ${v} · duration ${d}`,
  firingSuffix: ' — Check GCP Console for active incidents',
  enable: 'Enable', disable: 'Disable', edit: 'Edit', remove: 'Delete',
  deleteFailed: 'Delete failed',
  actionFailed: 'Action failed',
  confirmDelete: (name: string) => `Delete "${name}"?`,
  footerNote: '* "May fire" shown when current value exceeds threshold; check GCP Console > Monitoring > Alerting for actual incidents',
};

const T_ZH = {
  statusOk: '正常', statusApproaching: '接近阈值', statusFiring: '可能触发', statusUnknown: '无数据',
  severityCritical: '严重', severityWarning: '警告', severityInfo: '信息',
  recentMatches: (n: number) => `近期有 ${n} 次匹配请求（30min）`,
  noRecentData: '暂无近期数据',
  ratioMql: '比例/MQL 条件，无法实时查询',
  noHourData: '近 1 小时无数据（指标未上报）',
  emDash: '—',
  editTitle: '编辑告警策略',
  threshold: '阈值',
  duration: '持续时长：',
  invalidValue: '请输入有效数值',
  saveFailed: '保存失败',
  newTitle: '新建告警策略',
  template: '告警模板',
  thresholdLabel: '阈值 ',
  notifChannel: '通知渠道',
  noNotify: '不通知',
  invalidThreshold: '请输入有效阈值',
  createFailed: '创建失败',
  cancel: '取消', save: '保存', create: '创建', processing: '处理中…',
  policyCount: (n: number) => `${n} 个策略`,
  alarmingCount: (n: number) => ` · ${n} 个接近/触发`,
  allOk: ' · 全部正常',
  filterAll: '全部',
  newAlertBtn: '+ 新建告警策略',
  noPolicies: '暂无告警策略',
  alreadyDisabled: '已禁用',
  thresholdSuffix: (v: string | number, d: string) => ` · 阈值 ${v} · 持续 ${d}`,
  firingSuffix: ' — 请检查 GCP Console 确认是否有活跃 incident',
  enable: '启用', disable: '禁用', edit: '编辑', remove: '删除',
  deleteFailed: '删除失败',
  actionFailed: '操作失败',
  confirmDelete: (name: string) => `确定删除「${name}」吗？`,
  footerNote: '* 当前值超过阈值显示「可能触发」，实际是否产生 incident 请在 GCP Console > Monitoring > Alerting 确认',
};

function StatusDot({ status }: { status: AlertStatus }) {
  const cfg: Record<AlertStatus, { dot: string; glow: boolean }> = {
    ok:          { dot: 'var(--c-green)', glow: true },
    approaching: { dot: 'var(--c-amber)', glow: false },
    firing:      { dot: 'var(--c-red)',   glow: false },
    unknown:     { dot: 'var(--c-border)', glow: false },
  };
  const c = cfg[status];
  return (
    <span className="w-2 h-2 rounded-full flex-shrink-0 inline-block"
      style={{ background: c.dot, boxShadow: c.glow ? `0 0 5px ${c.dot}` : 'none' }} />
  );
}

function SeverityBadge({ severity, T }: { severity: AlertSeverity; T: typeof T_EN }) {
  const cfg: Record<AlertSeverity, { color: string; bg: string; label: string }> = {
    critical: { color: 'var(--c-red)',   bg: 'rgba(244,63,94,0.08)',  label: T.severityCritical },
    warning:  { color: 'var(--c-amber)', bg: 'rgba(245,158,11,0.08)', label: T.severityWarning  },
    info:     { color: 'var(--c-blue)',  bg: 'rgba(61,158,255,0.08)', label: T.severityInfo     },
  };
  const c = cfg[severity];
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase tracking-[0.08em]"
      style={{ ...MONO, color: c.color, background: c.bg, border: `1px solid ${c.color}33` }}>
      {c.label}
    </span>
  );
}

function ValueBar({ policy, T }: { policy: AlertPolicy; T: typeof T_EN }) {
  const cond = policy.conditions[0];

  if (cond?.conditionType === 'absent') {
    const v = policy.currentValue;
    const hasData = v !== null && v !== undefined;
    return (
      <span className="text-[10px]" style={{ ...MONO, color: hasData && v! > 0 ? 'var(--c-green)' : 'var(--c-amber)' }}>
        {hasData ? T.recentMatches(Math.round(v!)) : T.noRecentData}
      </span>
    );
  }

  if (!cond?.thresholdValue || cond.conditionType === 'mql' || cond.conditionType === 'unknown') {
    return <span className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{T.ratioMql}</span>;
  }

  if (policy.currentValue === null || policy.currentValue === undefined) {
    return (
      <span className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
        {cond.conditionType === 'threshold' ? T.noHourData : T.emDash}
      </span>
    );
  }

  const pct    = Math.min((policy.currentValue / cond.thresholdValue) * 100, 150);
  const barPct = Math.min(pct, 100);
  const color  = pct >= 100 ? 'var(--c-red)' : pct >= 70 ? 'var(--c-amber)' : 'var(--c-green)';
  const fmt    = (v: number) => v < 0.001 ? v.toExponential(2) : v.toFixed(4);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-28 h-1.5 rounded-full" style={{ background: 'var(--c-border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: color }} />
        </div>
        <span className="text-[10px]" style={{ ...MONO, color }}>
          {fmt(policy.currentValue)} / {cond.thresholdValue} ({Math.round(pct)}%)
        </span>
      </div>
    </div>
  );
}

function EditDialog({ T, policy, onClose, onSaved }: { T: typeof T_EN; policy: AlertPolicy; onClose: () => void; onSaved: () => void }) {
  const cond = policy.conditions[0];
  const [threshold, setThreshold] = useState(String(cond?.thresholdValue ?? ''));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(threshold);
    if (isNaN(n) || n <= 0) { setError(T.invalidValue); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/alerts?name=${policy.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: n, conditionName: cond?.name }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? T.saveFailed); return; }
      onSaved(); onClose();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <span className="text-[14px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{T.editTitle}</span>
          <button onClick={onClose} style={{ color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
        <form onSubmit={save} className="px-6 py-5 space-y-4">
          <div className="px-3 py-3 rounded-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
            <div className="text-[12px] font-medium" style={{ color: 'var(--c-txt-1)' }}>{policy.displayName}</div>
            <div className="text-[10px] mt-0.5" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{cond?.displayName}</div>
          </div>
          <div>
            <label className="block text-[9px] uppercase tracking-[0.12em] mb-1.5" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{T.threshold}</label>
            <input type="number" step="0.001" value={threshold} onChange={e => { setThreshold(e.target.value); setError(''); }}
              className="w-full text-[12px] px-3 py-2 rounded-sm outline-none"
              style={{ ...MONO, background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-txt-1)' }} autoFocus />
            <div className="text-[10px] mt-1" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
              {T.duration}{cond?.duration ?? '—'}
            </div>
          </div>
          {error && <div className="text-[11px] px-2 py-1.5 rounded-sm" style={{ ...MONO, color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>✗ {error}</div>}
          <div className="flex justify-end gap-2">
            <Btn T={T} ghost onClick={onClose}>{T.cancel}</Btn>
            <Btn T={T} type="submit" loading={saving}>{T.save}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewAlertDialog({ T, channels, onClose, onCreated }: {
  T: typeof T_EN; channels: NotificationChannel[]; onClose: () => void; onCreated: () => void;
}) {
  const [tplIdx,     setTplIdx]     = useState(0);
  const [threshold,  setThreshold]  = useState(String(ALERT_TEMPLATES[0].threshold));
  const [channelId,  setChannelId]  = useState(channels[0]?.id ?? '');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const tpl = ALERT_TEMPLATES[tplIdx];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(threshold);
    if (isNaN(n) || n <= 0) { setError(T.invalidThreshold); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateIndex: tplIdx, threshold: n, channelIds: channelId ? [channelId] : [] }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? T.createFailed); return; }
      onCreated(); onClose();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  const INPUT = { ...MONO, fontSize: '12px', background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-txt-1)', borderRadius: '4px', outline: 'none', padding: '8px 10px', width: '100%' };
  const LABEL = { ...MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--c-txt-3)', display: 'block', marginBottom: '5px' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <span className="text-[14px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{T.newTitle}</span>
          <button onClick={onClose} style={{ color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label style={LABEL}>{T.template}</label>
            <select value={tplIdx} onChange={e => { setTplIdx(Number(e.target.value)); setThreshold(String(ALERT_TEMPLATES[Number(e.target.value)].threshold)); }}
              style={INPUT}>
              {ALERT_TEMPLATES.map((t, i) => <option key={i} value={i}>{t.displayName.replace('LLM Gateway - ', '')}</option>)}
            </select>
            <div className="text-[10px] mt-1" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{tpl.description}</div>
          </div>

          <div>
            <label style={LABEL}>{T.thresholdLabel}{tpl.thresholdUnit}</label>
            <input type="number" step="0.001" value={threshold}
              onChange={e => { setThreshold(e.target.value); setError(''); }}
              style={INPUT} />
          </div>

          {channels.length > 0 && (
            <div>
              <label style={LABEL}>{T.notifChannel}</label>
              <select value={channelId} onChange={e => setChannelId(e.target.value)} style={INPUT}>
                <option value="">{T.noNotify}</option>
                {channels.map(c => <option key={c.id} value={c.id}>{c.displayName} ({c.type})</option>)}
              </select>
            </div>
          )}

          {error && <div className="text-[11px] px-2 py-1.5 rounded-sm" style={{ ...MONO, color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>✗ {error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn T={T} ghost onClick={onClose}>{T.cancel}</Btn>
            <Btn T={T} type="submit" loading={saving}>{T.create}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AlertsListProps {
  policies: AlertPolicy[];
  channels: NotificationChannel[];
}

export function AlertsList({ policies: initial, channels }: AlertsListProps) {
  const router = useRouter();
  const locale = useLocale();
  const T      = locale === 'zh' ? T_ZH : T_EN;
  const [, startTransition] = useTransition();
  const [policies, setPolicies]    = useState(initial);
  const [editing,  setEditing]     = useState<AlertPolicy | null>(null);
  const [showNew,  setShowNew]     = useState(false);
  const [saving,   setSaving]      = useState<string | null>(null);
  const [error,    setError]       = useState('');
  const [filter,   setFilter]      = useState<'all' | AlertSeverity>('all');

  function refresh() { startTransition(() => router.refresh()); }

  async function toggle(p: AlertPolicy) {
    setSaving(p.id); setError('');
    const res = await fetch(`/api/alerts?name=${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    if (!res.ok) { setError((await res.json()).error ?? T.actionFailed); }
    else { refresh(); }
    setSaving(null);
  }

  async function remove(p: AlertPolicy) {
    if (!confirm(T.confirmDelete(p.displayName))) return;
    setSaving(p.id); setError('');
    const res = await fetch(`/api/alerts?name=${p.id}`, { method: 'DELETE' });
    if (!res.ok) { setError((await res.json()).error ?? T.deleteFailed); }
    else { setPolicies(prev => prev.filter(x => x.id !== p.id)); }
    setSaving(null);
  }

  const visible = policies.filter(p => filter === 'all' || p.severity === filter);
  const firingCount = policies.filter(p => p.status === 'firing' || p.status === 'approaching').length;

  const STATUS_LABEL: Record<AlertStatus, { dot: string; label: string }> = {
    ok:          { dot: 'var(--c-green)',  label: T.statusOk },
    approaching: { dot: 'var(--c-amber)',  label: T.statusApproaching },
    firing:      { dot: 'var(--c-red)',    label: T.statusFiring },
    unknown:     { dot: 'var(--c-border)', label: T.statusUnknown },
  };

  const SEV_LABEL: Record<AlertSeverity, string> = {
    critical: T.severityCritical, warning: T.severityWarning, info: T.severityInfo,
  };

  return (
    <>
      {editing && <EditDialog T={T} policy={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {showNew  && <NewAlertDialog T={T} channels={channels} onClose={() => setShowNew(false)} onCreated={refresh} />}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
            <span>{T.policyCount(policies.length)}</span>
            {firingCount > 0 && <span style={{ color: 'var(--c-amber)' }}>{T.alarmingCount(firingCount)}</span>}
            {firingCount === 0 && policies.length > 0 && <span style={{ color: 'var(--c-green)' }}>{T.allOk}</span>}
          </div>
          <div className="flex gap-1 ml-2">
            {(['all', 'critical', 'warning', 'info'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="text-[9px] px-2 py-1 rounded-sm uppercase tracking-[0.08em] transition-all"
                style={{ ...MONO, background: filter === f ? 'rgba(0,232,122,0.08)' : 'transparent', color: filter === f ? 'var(--c-green)' : 'var(--c-txt-3)', border: filter === f ? '1px solid rgba(0,232,122,0.2)' : '1px solid transparent', cursor: 'pointer' }}>
                {f === 'all' ? T.filterAll : SEV_LABEL[f as AlertSeverity]}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowNew(true)}
          className="text-[11px] px-4 py-2 rounded-md font-medium"
          style={{ ...MONO, background: 'var(--c-green)', color: '#050a0f', border: '1px solid var(--c-green)', cursor: 'pointer' }}>
          {T.newAlertBtn}
        </button>
      </div>

      {error && <div className="px-4 py-2 rounded-md text-[11px]" style={{ ...MONO, color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>✗ {error}</div>}

      <div className="space-y-3">
        {visible.length === 0 && (
          <div className="px-5 py-12 text-center text-[12px] rounded-md" style={{ color: 'var(--c-txt-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
            {T.noPolicies}
          </div>
        )}
        {visible.map(p => {
          const st = STATUS_LABEL[p.status];
          return (
            <div key={p.id} className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', opacity: p.enabled ? 1 : 0.55 }}>
              <div className="flex items-start justify-between px-5 py-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <StatusDot status={p.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium" style={{ color: 'var(--c-txt-1)' }}>
                        {p.displayName.replace('LLM Gateway - ', '')}
                      </span>
                      <SeverityBadge severity={p.severity} T={T} />
                      {!p.enabled && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-sm" style={{ ...MONO, color: 'var(--c-txt-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
                          {T.alreadyDisabled}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] mt-1" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
                      {p.conditions[0]?.displayName}
                      {p.conditions[0]?.thresholdValue !== undefined && (
                        <span>{T.thresholdSuffix(p.conditions[0].thresholdValue, p.conditions[0].duration ?? '—')}</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <ValueBar policy={p} T={T} />
                    </div>
                    <div className="text-[9px] mt-1.5" style={{ ...MONO, color: st.dot }}>
                      {st.label}
                      {p.status === 'firing' && T.firingSuffix}
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 ml-4 flex-shrink-0">
                  <button onClick={() => toggle(p)} disabled={saving === p.id}
                    className="text-[10px] px-2.5 py-1.5 rounded-sm"
                    style={{ ...MONO, color: p.enabled ? 'var(--c-red)' : 'var(--c-green)', background: p.enabled ? 'rgba(244,63,94,0.06)' : 'rgba(0,232,122,0.06)', border: `1px solid ${p.enabled ? 'rgba(244,63,94,0.2)' : 'rgba(0,232,122,0.2)'}`, cursor: 'pointer' }}>
                    {p.enabled ? T.disable : T.enable}
                  </button>
                  <button onClick={() => setEditing(p)}
                    className="text-[10px] px-2.5 py-1.5 rounded-sm"
                    style={{ ...MONO, color: 'var(--c-blue)', background: 'rgba(61,158,255,0.06)', border: '1px solid rgba(61,158,255,0.2)', cursor: 'pointer' }}>
                    {T.edit}
                  </button>
                  <button onClick={() => remove(p)} disabled={saving === p.id}
                    className="text-[10px] px-2.5 py-1.5 rounded-sm"
                    style={{ ...MONO, color: 'var(--c-txt-3)', background: 'transparent', border: '1px solid var(--c-border-dim)', cursor: 'pointer' }}>
                    {T.remove}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {policies.length > 0 && (
        <div className="text-[9px] px-1" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
          {T.footerNote}
        </div>
      )}
    </>
  );
}

function Btn({ T, children, onClick, type = 'button', loading, ghost, danger }: {
  T: typeof T_EN; children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit';
  loading?: boolean; ghost?: boolean; danger?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={loading}
      className="text-[11px] px-4 py-2 rounded-sm transition-all"
      style={{
        ...MONO,
        background: ghost ? 'transparent' : danger ? 'rgba(244,63,94,0.1)' : 'var(--c-green)',
        color:      ghost ? 'var(--c-txt-2)' : danger ? 'var(--c-red)' : '#050a0f',
        border:     ghost ? '1px solid var(--c-border)' : danger ? '1px solid rgba(244,63,94,0.3)' : '1px solid var(--c-green)',
        cursor:     loading ? 'not-allowed' : 'pointer',
        opacity:    loading ? 0.6 : 1,
      }}>
      {loading ? T.processing : children}
    </button>
  );
}
