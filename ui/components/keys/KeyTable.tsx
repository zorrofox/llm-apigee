'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import type { ApiApp } from '@/lib/apigee';

// ── i18n strings (inline for component) ─────────────────────────────────────
const T_EN = {
  statusApproved: 'Active',
  statusRevoked: 'Revoked',
  statusExpired: 'Expired',
  errInputRequired: 'Developer email and App name are required',
  createFailed: 'Create failed',
  saveFailed: 'Save failed',
  revokeFailed: 'Revoke failed',
  developerCreatedNotice: (email: string) => `Developer account auto-created for ${email}`,
  noDevEmail: 'Missing developer email',
  newApp: 'New App',
  developerEmail: 'Developer Email *',
  devEmailHelp: 'Developer is auto-created if missing',
  appName: 'App Name *',
  appNamePlaceholder: 'my-app (letters, numbers, hyphens only)',
  linkProduct: 'Linked API Product',
  productProd: 'llm-gateway-product (production)',
  tokenQuotaOverride: 'Token Quota Override / hour (optional)',
  tokenQuotaOverridePlaceholder: 'Leave empty to use product default (1,000,000)',
  cancel: 'Cancel',
  createApp: 'Create App',
  editTitle: (name: string) => `Edit — ${name}`,
  app: 'App',
  developer: 'Developer',
  productDefault: 'Product default quota',
  tokenQuotaOverrideLabel: 'Token Quota Override / hour',
  tokenQuotaOverridePlaceholder2: 'Leave empty to use product default',
  clearOverride: '✕ Clear override, fall back to product default',
  notesLabel: 'Notes (internal)',
  notesPlaceholder: 'Purpose, owner, etc.',
  save: 'Save',
  revokeTitle: 'Revoke API Key',
  revokeConfirm: 'Are you sure you want to revoke this key? It will be immediately invalidated.',
  appLabel: 'App',
  keyLabel: 'Key',
  devLabel: 'Developer',
  revokeIrreversible: '⚠ This action cannot be undone. Re-enabling requires Apigee admin assistance.',
  confirmRevoke: 'Confirm Revoke',
  searchPlaceholder: 'Search App name or developer email...',
  newAppBtn: '+ New App',
  copy: 'Copy',
  copied: '✓ Copied',
  appOverrideTag: 'App override',
  edit: 'Edit',
  revoke: 'Revoke',
  noMatch: 'No matching apps found',
  footerSummary: (total: number, active: number) => `${total} apps · ${active} active`,
  processing: 'Processing...',
  thApp: 'App / Developer',
  thKey: 'API Key',
  thProduct: 'Linked Product',
  thQuota: 'Token Quota',
  thCreated: 'Created',
  thStatus: 'Status',
  thActions: 'Actions',
};

const T_ZH = {
  statusApproved: '正常',
  statusRevoked: '已撤销',
  statusExpired: '已过期',
  errInputRequired: '开发者邮箱和 App 名称为必填项',
  createFailed: '创建失败',
  saveFailed: '保存失败',
  revokeFailed: '撤销失败',
  developerCreatedNotice: (email: string) => `已自动为 ${email} 创建开发者账号`,
  noDevEmail: '无开发者邮箱',
  newApp: '新建 App',
  developerEmail: '开发者邮箱 *',
  devEmailHelp: '若开发者不存在，系统自动创建',
  appName: 'App 名称 *',
  appNamePlaceholder: 'my-app（仅字母、数字、连字符）',
  linkProduct: '关联 API Product',
  productProd: 'llm-gateway-product（生产）',
  tokenQuotaOverride: 'Token 配额覆盖 / 小时（可选）',
  tokenQuotaOverridePlaceholder: '留空则使用 Product 默认（1,000,000）',
  cancel: '取消',
  createApp: '创建 App',
  editTitle: (name: string) => `编辑 — ${name}`,
  app: 'App',
  developer: '开发者',
  productDefault: 'Product 默认配额',
  tokenQuotaOverrideLabel: 'Token 配额覆盖 / 小时',
  tokenQuotaOverridePlaceholder2: '留空则沿用 Product 默认',
  clearOverride: '✕ 清除覆盖，回退到 Product 默认',
  notesLabel: '备注（内部说明）',
  notesPlaceholder: '填写用途、负责人等说明…',
  save: '保存',
  revokeTitle: '撤销 API Key',
  revokeConfirm: '确定要撤销以下 Key 吗？撤销后该 Key 立即失效，无法用于 API 调用。',
  appLabel: 'App',
  keyLabel: 'Key',
  devLabel: '开发者',
  revokeIrreversible: '⚠ 此操作不可恢复，如需重新启用需联系 Apigee 管理员',
  confirmRevoke: '确认撤销',
  searchPlaceholder: '搜索 App 名称或开发者邮箱…',
  newAppBtn: '+ 新建 App',
  copy: '复制',
  copied: '✓ 已复制',
  appOverrideTag: 'App 覆盖',
  edit: '编辑',
  revoke: '撤销',
  noMatch: '没有找到匹配的 App',
  footerSummary: (total: number, active: number) => `共 ${total} 个 App · ${active} 个有效`,
  processing: '处理中…',
  thApp: 'App / 开发者',
  thKey: 'API Key',
  thProduct: '关联 Product',
  thQuota: 'Token 配额',
  thCreated: '创建时间',
  thStatus: '状态',
  thActions: '操作',
};

// ── helpers ──────────────────────────────────────────────────────────────────

function maskKey(key: string) {
  if (key.length <= 12) return '***';
  return `${key.slice(0, 8)}···${key.slice(-4)}`;
}

function getTokenQuota(app: ApiApp) {
  const attr = (name: string) => app.attributes?.find(a => a.name === name)?.value ?? '';
  return {
    limit:    Number(attr('developer.token.quota.limit') || 1_000_000),
    interval: attr('developer.token.quota.interval') || '1',
    timeUnit: attr('developer.token.quota.timeunit') || 'hour',
  };
}

function getAppOverride(app: ApiApp) {
  return app.attributes?.find(a => a.name === 'token.quota.limit')?.value ?? '';
}

function getNotes(app: ApiApp) {
  return app.attributes?.find(a => a.name === 'notes')?.value ?? '';
}

type StatusKind = 'approved' | 'revoked' | 'expired';

const INPUT_STYLE = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize:   '12px',
  background: 'var(--c-bg)',
  border:     '1px solid var(--c-border)',
  color:      'var(--c-txt-1)',
  borderRadius: '4px',
  outline:    'none',
  padding:    '8px 10px',
  width:      '100%',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize:      '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color:         'var(--c-txt-3)',
  fontFamily:    'IBM Plex Mono, monospace',
  display:       'block',
  marginBottom:  '5px',
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-md overflow-hidden"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--c-border)' }}>
          <span className="text-[14px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</span>
          <button onClick={onClose}
            style={{ color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return (
    <div className="text-[11px] px-3 py-2 rounded-sm"
      style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
      ✗ {msg}
    </div>
  );
}

function NewAppDialog({ T, onClose, onCreated }: { T: typeof T_EN; onClose: () => void; onCreated: (notice?: string) => void }) {
  const [form, setForm] = useState({ developerEmail: '', appName: '', productName: 'llm-gateway-product', tokenQuotaLimit: '' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); setError(''); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.developerEmail.trim() || !form.appName.trim()) { setError(T.errInputRequired); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/apps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tokenQuotaLimit: form.tokenQuotaLimit ? Number(form.tokenQuotaLimit) : null }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? T.createFailed); return; }
      onCreated(d.developerCreated ? T.developerCreatedNotice(form.developerEmail) : undefined);
      onClose();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={T.newApp} onClose={onClose}>
      <form onSubmit={submit} className="px-6 py-5 space-y-4">
        <div>
          <label style={LABEL_STYLE}>{T.developerEmail}</label>
          <input type="email" placeholder="dev@example.com" value={form.developerEmail}
            onChange={e => set('developerEmail', e.target.value)} style={INPUT_STYLE} autoFocus />
          <div className="mt-1 text-[10px]" style={{ color: 'var(--c-txt-3)', fontFamily: 'IBM Plex Mono, monospace' }}>
            {T.devEmailHelp}
          </div>
        </div>
        <div>
          <label style={LABEL_STYLE}>{T.appName}</label>
          <input type="text" placeholder={T.appNamePlaceholder} value={form.appName}
            onChange={e => set('appName', e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>{T.linkProduct}</label>
          <select value={form.productName} onChange={e => set('productName', e.target.value)} style={INPUT_STYLE}>
            <option value="llm-gateway-product">{T.productProd}</option>
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>{T.tokenQuotaOverride}</label>
          <input type="number" placeholder={T.tokenQuotaOverridePlaceholder} value={form.tokenQuotaLimit}
            onChange={e => set('tokenQuotaLimit', e.target.value)} style={INPUT_STYLE} />
        </div>
        {error && <ErrMsg msg={error} />}
        <div className="flex justify-end gap-3 pt-1">
          <Btn T={T} ghost onClick={onClose}>{T.cancel}</Btn>
          <Btn T={T} loading={saving} type="submit">{T.createApp}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function EditAppDialog({ T, app, onClose, onSaved }: { T: typeof T_EN; app: ApiApp; onClose: () => void; onSaved: () => void }) {
  const [tokenQuota, setTokenQuota] = useState(getAppOverride(app));
  const [notes,      setNotes]      = useState(getNotes(app));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!app.developerEmail) { setError(T.noDevEmail); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developerEmail: app.developerEmail,
          appName: app.name,
          tokenQuotaLimit: tokenQuota === '' ? null : Number(tokenQuota),
          notes,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? T.saveFailed); return; }
      onSaved(); onClose();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  const quota = getTokenQuota(app);

  return (
    <Modal title={T.editTitle(app.name)} onClose={onClose}>
      <form onSubmit={submit} className="px-6 py-5 space-y-4">
        <div className="px-3 py-3 rounded-sm space-y-1.5" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
          <Row label={T.app} value={app.name} />
          <Row label={T.developer} value={app.developerEmail ?? '—'} />
          <Row label={T.productDefault} value={`${(quota.limit/1_000_000).toFixed(1)}M tokens/${quota.interval}${quota.timeUnit === 'hour' ? 'h' : quota.timeUnit}`} />
        </div>

        <div>
          <label style={LABEL_STYLE}>{T.tokenQuotaOverrideLabel}</label>
          <input type="number" placeholder={T.tokenQuotaOverridePlaceholder2} value={tokenQuota}
            onChange={e => { setTokenQuota(e.target.value); setError(''); }} style={INPUT_STYLE} autoFocus />
          {tokenQuota !== '' && (
            <button type="button" onClick={() => setTokenQuota('')}
              className="mt-1 text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {T.clearOverride}
            </button>
          )}
        </div>

        <div>
          <label style={LABEL_STYLE}>{T.notesLabel}</label>
          <textarea
            rows={2}
            placeholder={T.notesPlaceholder}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '60px' }}
          />
        </div>

        {error && <ErrMsg msg={error} />}

        <div className="flex justify-end gap-3 pt-1">
          <Btn T={T} ghost onClick={onClose}>{T.cancel}</Btn>
          <Btn T={T} loading={saving} type="submit">{T.save}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function RevokeDialog({ T, app, consumerKey, onClose, onRevoked }: {
  T: typeof T_EN; app: ApiApp; consumerKey: string; onClose: () => void; onRevoked: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  async function revoke() {
    if (!app.developerEmail) { setError(T.noDevEmail); return; }
    setConfirming(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ developerEmail: app.developerEmail, appName: app.name, consumerKey }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? T.revokeFailed); return; }
      onRevoked(); onClose();
    } catch (e) { setError(String(e)); }
    finally { setConfirming(false); }
  }

  return (
    <Modal title={T.revokeTitle} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        <div className="text-[13px]" style={{ color: 'var(--c-txt-2)', lineHeight: 1.6 }}>
          {T.revokeConfirm}
        </div>
        <div className="px-3 py-3 rounded-sm space-y-1.5" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)' }}>
          <Row label={T.appLabel}  value={app.name} />
          <Row label={T.keyLabel}  value={maskKey(consumerKey)} mono />
          <Row label={T.devLabel}  value={app.developerEmail ?? '—'} />
        </div>
        <div className="text-[11px] px-3 py-2 rounded-sm"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--c-amber)', fontFamily: 'IBM Plex Mono, monospace' }}>
          {T.revokeIrreversible}
        </div>
        {error && <ErrMsg msg={error} />}
        <div className="flex justify-end gap-3">
          <Btn T={T} ghost onClick={onClose}>{T.cancel}</Btn>
          <Btn T={T} danger loading={confirming} onClick={revoke}>{T.confirmRevoke}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] w-20 flex-shrink-0 uppercase tracking-[0.12em]"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>{label}</span>
      <span className="text-[11px]" style={{ fontFamily: mono ? 'IBM Plex Mono, monospace' : 'inherit', color: 'var(--c-txt-2)' }}>{value}</span>
    </div>
  );
}

function Btn({ T, children, onClick, type = 'button', loading, ghost, danger }: {
  T: typeof T_EN;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  loading?: boolean;
  ghost?: boolean;
  danger?: boolean;
}) {
  const bg     = ghost ? 'transparent' : danger ? 'rgba(244,63,94,0.15)' : 'var(--c-green)';
  const color  = ghost ? 'var(--c-txt-2)' : danger ? 'var(--c-red)' : '#050a0f';
  const border = ghost ? 'var(--c-border)' : danger ? 'rgba(244,63,94,0.4)' : 'var(--c-green)';
  return (
    <button type={type} onClick={onClick} disabled={loading}
      className="text-[11px] px-4 py-2 rounded-sm transition-all"
      style={{ fontFamily: 'IBM Plex Mono, monospace', background: bg, color, border: `1px solid ${border}`, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
      {loading ? T.processing : children}
    </button>
  );
}

export function KeyTable({ apps }: { apps: ApiApp[] }) {
  const router = useRouter();
  const locale = useLocale();
  const T = locale === 'zh' ? T_ZH : T_EN;

  const STATUS_MAP: Record<StatusKind, { label: string; color: string; bg: string }> = {
    approved: { label: T.statusApproved, color: 'var(--c-green)', bg: 'rgba(0,232,122,0.08)' },
    revoked:  { label: T.statusRevoked,  color: 'var(--c-red)',   bg: 'rgba(244,63,94,0.08)' },
    expired:  { label: T.statusExpired,  color: 'var(--c-txt-3)', bg: 'rgba(68,85,102,0.1)' },
  };

  function fmtDate(ts: string) {
    const n = Number(ts);
    if (!n || n === -1) return '—';
    return new Date(n).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US');
  }

  const [search,   setSearch]   = useState('');
  const [copied,   setCopied]   = useState<string | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [editApp,  setEditApp]  = useState<ApiApp | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ app: ApiApp; key: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = apps.filter(a =>
    a.name.includes(search) || (a.developerEmail ?? '').includes(search)
  );

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  }

  function refresh() { router.refresh(); }

  return (
    <>
      {newDialog && <NewAppDialog T={T} onClose={() => setNewDialog(false)} onCreated={(msg) => { setNotice(msg ?? null); refresh(); }} />}
      {editApp        && <EditAppDialog T={T} app={editApp} onClose={() => setEditApp(null)} onSaved={refresh} />}
      {revokeTarget   && <RevokeDialog T={T} app={revokeTarget.app} consumerKey={revokeTarget.key} onClose={() => setRevokeTarget(null)} onRevoked={refresh} />}

      <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <input type="text" placeholder={T.searchPlaceholder} value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-[12px] px-3 py-2 rounded-md outline-none"
            style={{ fontFamily: 'IBM Plex Mono, monospace', background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-txt-1)' }} />
          <button onClick={() => setNewDialog(true)}
            className="text-[11px] px-4 py-2 rounded-md font-medium"
            style={{ fontFamily: 'IBM Plex Mono, monospace', background: 'var(--c-green)', color: '#050a0f', border: '1px solid var(--c-green)', cursor: 'pointer' }}>
            {T.newAppBtn}
          </button>
        </div>

        {notice && (
          <div className="flex items-center justify-between px-5 py-2.5"
            style={{ background: 'rgba(0,232,122,0.06)', borderBottom: '1px solid rgba(0,232,122,0.15)' }}>
            <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-green)' }}>
              ✓ {notice}
            </span>
            <button onClick={() => setNotice(null)}
              style={{ color: 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>✕</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                {[T.thApp, T.thKey, T.thProduct, T.thQuota, T.thCreated, T.thStatus, T.thActions].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[9px] tracking-[0.18em] uppercase whitespace-nowrap"
                    style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(app => {
                const cred   = app.credentials?.[0];
                const key    = cred?.consumerKey ?? '';
                const quota  = getTokenQuota(app);
                const override = getAppOverride(app);
                const status = (cred?.status ?? 'approved') as StatusKind;
                const st     = STATUS_MAP[status] ?? STATUS_MAP.approved;
                const products = cred?.apiProducts?.map(p => p.apiproduct).join(', ') ?? '—';
                const revoked  = status === 'revoked';

                return (
                  <tr key={app.appId} style={{ borderBottom: '1px solid var(--c-border-dim)', opacity: revoked ? 0.55 : 1 }}>
                    <td className="px-5 py-3.5">
                      <div className="text-[12px] font-medium" style={{ color: 'var(--c-txt-1)' }}>{app.name}</div>
                      <div className="text-[10px] mt-0.5" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>{app.developerEmail}</div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2 py-1 rounded-sm"
                          style={{ fontFamily: 'IBM Plex Mono, monospace', background: 'var(--c-bg)', border: '1px solid var(--c-border-dim)', color: 'var(--c-txt-2)' }}>
                          {maskKey(key)}
                        </span>
                        {!revoked && (
                          <button onClick={() => copyKey(key)}
                            style={{ color: copied === key ? 'var(--c-green)' : 'var(--c-txt-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px' }}>
                            {copied === key ? T.copied : T.copy}
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-2)' }}>{products}</span>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: override ? 'var(--c-green)' : 'var(--c-txt-2)' }}>
                        {override
                          ? `${(Number(override)/1_000_000).toFixed(1)}M / 1h`
                          : `${(quota.limit/1_000_000).toFixed(1)}M / ${quota.interval}${quota.timeUnit === 'hour' ? 'h' : quota.timeUnit}`
                        }
                      </div>
                      {override && (
                        <div className="text-[9px] mt-0.5" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-green)', opacity: 0.7 }}>{T.appOverrideTag}</div>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>{fmtDate(app.createdAt)}</span>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-sm tracking-[0.1em] uppercase"
                        style={{ fontFamily: 'IBM Plex Mono, monospace', color: st.color, background: st.bg, border: `1px solid ${st.color}33` }}>
                        {st.label}
                      </span>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditApp(app)}
                          style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', color: 'var(--c-blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {T.edit}
                        </button>
                        {!revoked && (
                          <button
                            onClick={() => setRevokeTarget({ app, key })}
                            style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', color: 'var(--c-red)', background: 'none', border: 'none', cursor: 'pointer' }}>
                            {T.revoke}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>{T.noMatch}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)', borderTop: '1px solid var(--c-border-dim)' }}>
          {T.footerSummary(apps.length, apps.filter(a => a.credentials?.[0]?.status === 'approved').length)}
        </div>
      </div>
    </>
  );
}
