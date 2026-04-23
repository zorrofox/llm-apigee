'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useLocale } from 'next-intl';

interface LogFiltersProps {
  models: string[];
  apps:   string[];
}

const T_EN = {
  allStatus: 'All status', s200: '200 success', s2xx: '2xx success', s429: '429 rate-limited',
  s4xx: '4xx client error', s500: '500 service error', s5xx: '5xx server error',
  allCache: 'All', cacheHit: 'HIT', cacheMiss: 'MISS',
  allModels: 'All models', allApps: 'All apps',
  reset: '✕ Reset', loading: 'Loading...',
};

const T_ZH = {
  allStatus: '全部状态码', s200: '200 成功', s2xx: '2xx 成功', s429: '429 限流',
  s4xx: '4xx 客户端错误', s500: '500 服务错误', s5xx: '5xx 服务器错误',
  allCache: '全部', cacheHit: 'HIT 命中', cacheMiss: 'MISS 未命中',
  allModels: '全部模型', allApps: '全部 App',
  reset: '✕ 重置', loading: '查询中…',
};

const selectStyle = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize:   '11px',
  background: 'var(--c-bg)',
  border:     '1px solid var(--c-border)',
  color:      'var(--c-txt-1)',
  borderRadius:'4px',
  padding:    '6px 10px',
  outline:    'none',
  cursor:     'pointer',
};

export function LogFilters({ models, apps }: LogFiltersProps) {
  const router      = useRouter();
  const pathname    = usePathname();
  const params      = useSearchParams();
  const locale      = useLocale();
  const T           = locale === 'zh' ? T_ZH : T_EN;
  const [pending, startTransition] = useTransition();

  const STATUS_OPTIONS = [
    { value: '',    label: T.allStatus },
    { value: '200', label: T.s200 },
    { value: '2xx', label: T.s2xx },
    { value: '429', label: T.s429 },
    { value: '4xx', label: T.s4xx },
    { value: '500', label: T.s500 },
    { value: '5xx', label: T.s5xx },
  ];

  const CACHE_OPTIONS = [
    { value: '',     label: T.allCache },
    { value: 'HIT',  label: T.cacheHit },
    { value: 'MISS', label: T.cacheMiss },
  ];

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    next.delete('pageToken');
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  function reset() {
    startTransition(() => router.push(pathname));
  }

  const hasFilter = ['model', 'app', 'status', 'cache'].some(k => params.has(k));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select value={params.get('model') ?? ''} onChange={e => update('model', e.target.value)} style={selectStyle}>
        <option value="">{T.allModels}</option>
        {models.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      <select value={params.get('app') ?? ''} onChange={e => update('app', e.target.value)} style={selectStyle}>
        <option value="">{T.allApps}</option>
        {apps.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      <select value={params.get('status') ?? ''} onChange={e => update('status', e.target.value)} style={selectStyle}>
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select value={params.get('cache') ?? ''} onChange={e => update('cache', e.target.value)} style={selectStyle}>
        {CACHE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {hasFilter && (
        <button
          onClick={reset}
          className="text-[11px] px-3 py-1.5 rounded-sm transition-colors"
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            color:      'var(--c-txt-3)',
            background: 'transparent',
            border:     '1px solid var(--c-border-dim)',
            cursor:     'pointer',
          }}
        >
          {T.reset}
        </button>
      )}

      {pending && (
        <span className="text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
          {T.loading}
        </span>
      )}
    </div>
  );
}
