'use client';

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import type { AlertPolicy, AlertStatus, AlertSeverity, NotificationChannel } from '@/lib/alerts';
import { ALERT_TEMPLATES } from '@/lib/alert-templates';

const MONO = { fontFamily: 'IBM Plex Mono, monospace' };

// ── 状态指示 ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AlertStatus, { dot: string; label: string; glow: boolean }> = {
  ok:          { dot: 'var(--c-green)', label: '正常', glow: true },
  approaching: { dot: 'var(--c-amber)', label: '接近阈值', glow: false },
  firing:      { dot: 'var(--c-red)',   label: '可能触发', glow: false },
  unknown:     { dot: 'var(--c-border)','label': '无数据', glow: false },
};

const SEVERITY_CONFIG: Record<AlertSeverity, { color: string; bg: string; label: string }> = {
  critical: { color: 'var(--c-red)',   bg: 'rgba(244,63,94,0.08)',  label: '严重' },
  warning:  { color: 'var(--c-amber)', bg: 'rgba(245,158,11,0.08)', label: '警告' },
  info:     { color: 'var(--c-blue)',  bg: 'rgba(61,158,255,0.08)', label: '信息' },
};

function StatusDot({ status }: { status: AlertStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className="w-2 h-2 rounded-full flex-shrink-0 inline-block"
      style={{ background: c.dot, boxShadow: c.glow ? `0 0 5px ${c.dot}` : 'none' }} />
  );
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const c = SEVERITY_CONFIG[severity];
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase tracking-[0.08em]"
      style={{ ...MONO, color: c.color, background: c.bg, border: `1px solid ${c.color}33` }}>
      {c.label}
    </span>
  );
}

// ── 当前值进度条 ─────────────────────────────────────────────────────────────

function ValueBar({ policy }: { policy: AlertPolicy }) {
  const cond = policy.conditions[0];

  // conditionAbsent：显示近期匹配请求计数
  if (cond?.conditionType === 'absent') {
    const v = policy.currentValue;
    const hasData = v !== null && v !== undefined;
    return (
      <span className="text-[10px]" style={{ ...MONO, color: hasData && v! > 0 ? 'var(--c-green)' : 'var(--c-amber)' }}>
        {hasData ? `近期有 ${Math.round(v!)} 次匹配请求（30min）` : '暂无近期数据'}
      </span>
    );
  }

  // MQL / 未知条件
  if (!cond?.thresholdValue || cond.conditionType === 'mql' || cond.conditionType === 'unknown') {
    return <span className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>比例/MQL 条件，无法实时查询</span>;
  }

  if (policy.currentValue === null || policy.currentValue === undefined) {
    return (
      <span className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
        {cond.conditionType === 'threshold' ? '近 1 小时无数据（指标未上报）' : '—'}
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

// ── 编辑弹窗 ─────────────────────────────────────────────────────────────────

function EditDialog({ policy, onClose, onSaved }: { policy: AlertPolicy; onClose: () => void; onSaved: () => void }) {
  const cond = policy.conditions[0];
  const [threshold, setThreshold] = useState(String(cond?.thresholdValue ?? ''));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(threshold);
    if (isNaN(n) || n <= 0) { setError('请输入有效数值'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/alerts?name=${policy.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: n, conditionName: cond?.name }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? '保存失败'); return; }
      onSaved(); onClose();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <span className="text-[14px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>编辑告警策略</span>
          <button onClick={onClose} style={{ color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
        <form onSubmit={save} className="px-6 py-5 space-y-4">
          <div className="px-3 py-3 rounded-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
            <div className="text-[12px] font-medium" style={{ color: 'var(--c-txt-1)' }}>{policy.displayName}</div>
            <div className="text-[10px] mt-0.5" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{cond?.displayName}</div>
          </div>
          <div>
            <label className="block text-[9px] uppercase tracking-[0.12em] mb-1.5" style={{ ...MONO, color: 'var(--c-txt-3)' }}>阈值</label>
            <input type="number" step="0.001" value={threshold} onChange={e => { setThreshold(e.target.value); setError(''); }}
              className="w-full text-[12px] px-3 py-2 rounded-sm outline-none"
              style={{ ...MONO, background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-txt-1)' }} autoFocus />
            <div className="text-[10px] mt-1" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
              持续时长：{cond?.duration ?? '—'}
            </div>
          </div>
          {error && <div className="text-[11px] px-2 py-1.5 rounded-sm" style={{ ...MONO, color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>✗ {error}</div>}
          <div className="flex justify-end gap-2">
            <Btn ghost onClick={onClose}>取消</Btn>
            <Btn type="submit" loading={saving}>保存</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 新建弹窗 ─────────────────────────────────────────────────────────────────

function NewAlertDialog({ channels, onClose, onCreated }: {
  channels: NotificationChannel[]; onClose: () => void; onCreated: () => void;
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
    if (isNaN(n) || n <= 0) { setError('请输入有效阈值'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateIndex: tplIdx, threshold: n, channelIds: channelId ? [channelId] : [] }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? '创建失败'); return; }
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
          <span className="text-[14px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>新建告警策略</span>
          <button onClick={onClose} style={{ color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* 模板选择 */}
          <div>
            <label style={LABEL}>告警模板</label>
            <select value={tplIdx} onChange={e => { setTplIdx(Number(e.target.value)); setThreshold(String(ALERT_TEMPLATES[Number(e.target.value)].threshold)); }}
              style={INPUT}>
              {ALERT_TEMPLATES.map((t, i) => <option key={i} value={i}>{t.displayName.replace('LLM Gateway - ', '')}</option>)}
            </select>
            <div className="text-[10px] mt-1" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{tpl.description}</div>
          </div>

          {/* 阈值 */}
          <div>
            <label style={LABEL}>阈值 {tpl.thresholdUnit}</label>
            <input type="number" step="0.001" value={threshold}
              onChange={e => { setThreshold(e.target.value); setError(''); }}
              style={INPUT} />
          </div>

          {/* 通知渠道 */}
          {channels.length > 0 && (
            <div>
              <label style={LABEL}>通知渠道</label>
              <select value={channelId} onChange={e => setChannelId(e.target.value)} style={INPUT}>
                <option value="">不通知</option>
                {channels.map(c => <option key={c.id} value={c.id}>{c.displayName} ({c.type})</option>)}
              </select>
            </div>
          )}

          {error && <div className="text-[11px] px-2 py-1.5 rounded-sm" style={{ ...MONO, color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>✗ {error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn ghost onClick={onClose}>取消</Btn>
            <Btn type="submit" loading={saving}>创建</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 主列表组件 ────────────────────────────────────────────────────────────────

interface AlertsListProps {
  policies: AlertPolicy[];
  channels: NotificationChannel[];
}

export function AlertsList({ policies: initial, channels }: AlertsListProps) {
  const router = useRouter();
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
    if (!res.ok) { setError((await res.json()).error ?? '操作失败'); }
    else { refresh(); }
    setSaving(null);
  }

  async function remove(p: AlertPolicy) {
    if (!confirm(`确定删除「${p.displayName}」吗？`)) return;
    setSaving(p.id); setError('');
    const res = await fetch(`/api/alerts?name=${p.id}`, { method: 'DELETE' });
    if (!res.ok) { setError((await res.json()).error ?? '删除失败'); }
    else { setPolicies(prev => prev.filter(x => x.id !== p.id)); }
    setSaving(null);
  }

  const visible = policies.filter(p => filter === 'all' || p.severity === filter);
  const firingCount = policies.filter(p => p.status === 'firing' || p.status === 'approaching').length;

  return (
    <>
      {editing && <EditDialog policy={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {showNew  && <NewAlertDialog channels={channels} onClose={() => setShowNew(false)} onCreated={refresh} />}

      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
            <span>{policies.length} 个策略</span>
            {firingCount > 0 && <span style={{ color: 'var(--c-amber)' }}>· {firingCount} 个接近/触发</span>}
            {firingCount === 0 && policies.length > 0 && <span style={{ color: 'var(--c-green)' }}>· 全部正常</span>}
          </div>
          {/* 筛选 */}
          <div className="flex gap-1 ml-2">
            {(['all', 'critical', 'warning', 'info'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="text-[9px] px-2 py-1 rounded-sm uppercase tracking-[0.08em] transition-all"
                style={{ ...MONO, background: filter === f ? 'rgba(0,232,122,0.08)' : 'transparent', color: filter === f ? 'var(--c-green)' : 'var(--c-txt-3)', border: filter === f ? '1px solid rgba(0,232,122,0.2)' : '1px solid transparent', cursor: 'pointer' }}>
                {f === 'all' ? '全部' : SEVERITY_CONFIG[f as AlertSeverity].label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowNew(true)}
          className="text-[11px] px-4 py-2 rounded-md font-medium"
          style={{ ...MONO, background: 'var(--c-green)', color: '#050a0f', border: '1px solid var(--c-green)', cursor: 'pointer' }}>
          + 新建告警策略
        </button>
      </div>

      {error && <div className="px-4 py-2 rounded-md text-[11px]" style={{ ...MONO, color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>✗ {error}</div>}

      {/* 策略列表 */}
      <div className="space-y-3">
        {visible.length === 0 && (
          <div className="px-5 py-12 text-center text-[12px] rounded-md" style={{ color: 'var(--c-txt-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
            暂无告警策略
          </div>
        )}
        {visible.map(p => {
          const st = STATUS_CONFIG[p.status];
          return (
            <div key={p.id} className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', opacity: p.enabled ? 1 : 0.55 }}>
              <div className="flex items-start justify-between px-5 py-4">
                {/* 左侧：状态 + 名称 */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <StatusDot status={p.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium" style={{ color: 'var(--c-txt-1)' }}>
                        {p.displayName.replace('LLM Gateway - ', '')}
                      </span>
                      <SeverityBadge severity={p.severity} />
                      {!p.enabled && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-sm" style={{ ...MONO, color: 'var(--c-txt-3)', background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
                          已禁用
                        </span>
                      )}
                    </div>
                    {/* 条件说明 */}
                    <div className="text-[11px] mt-1" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
                      {p.conditions[0]?.displayName}
                      {p.conditions[0]?.thresholdValue !== undefined && (
                        <span> · 阈值 {p.conditions[0].thresholdValue} · 持续 {p.conditions[0].duration}</span>
                      )}
                    </div>
                    {/* 当前值进度条 */}
                    <div className="mt-2">
                      <ValueBar policy={p} />
                    </div>
                    {/* 状态文字 */}
                    <div className="text-[9px] mt-1.5" style={{ ...MONO, color: st.dot }}>
                      {st.label}
                      {p.status === 'firing' && ' — 请检查 GCP Console 确认是否有活跃 incident'}
                    </div>
                  </div>
                </div>

                {/* 右侧：操作按钮 */}
                <div className="flex gap-1.5 ml-4 flex-shrink-0">
                  <button onClick={() => toggle(p)} disabled={saving === p.id}
                    className="text-[10px] px-2.5 py-1.5 rounded-sm"
                    style={{ ...MONO, color: p.enabled ? 'var(--c-red)' : 'var(--c-green)', background: p.enabled ? 'rgba(244,63,94,0.06)' : 'rgba(0,232,122,0.06)', border: `1px solid ${p.enabled ? 'rgba(244,63,94,0.2)' : 'rgba(0,232,122,0.2)'}`, cursor: 'pointer' }}>
                    {p.enabled ? '禁用' : '启用'}
                  </button>
                  <button onClick={() => setEditing(p)}
                    className="text-[10px] px-2.5 py-1.5 rounded-sm"
                    style={{ ...MONO, color: 'var(--c-blue)', background: 'rgba(61,158,255,0.06)', border: '1px solid rgba(61,158,255,0.2)', cursor: 'pointer' }}>
                    编辑
                  </button>
                  <button onClick={() => remove(p)} disabled={saving === p.id}
                    className="text-[10px] px-2.5 py-1.5 rounded-sm"
                    style={{ ...MONO, color: 'var(--c-txt-3)', background: 'transparent', border: '1px solid var(--c-border-dim)', cursor: 'pointer' }}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 说明 */}
      {policies.length > 0 && (
        <div className="text-[9px] px-1" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
          * 当前值超过阈值显示「可能触发」，实际是否产生 incident 请在 GCP Console &gt; Monitoring &gt; Alerting 确认
        </div>
      )}
    </>
  );
}

function Btn({ children, onClick, type = 'button', loading, ghost, danger }: {
  children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit';
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
      {loading ? '处理中…' : children}
    </button>
  );
}
