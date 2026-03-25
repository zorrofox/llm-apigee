'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

interface LogFiltersProps {
  models: string[];
  apps:   string[];
}

const STATUS_OPTIONS = [
  { value: '',    label: '全部状态码' },
  { value: '200', label: '200 成功' },
  { value: '2xx', label: '2xx 成功' },
  { value: '429', label: '429 限流' },
  { value: '4xx', label: '4xx 客户端错误' },
  { value: '500', label: '500 服务错误' },
  { value: '5xx', label: '5xx 服务器错误' },
];

const CACHE_OPTIONS = [
  { value: '',     label: '全部' },
  { value: 'HIT',  label: 'HIT 命中' },
  { value: 'MISS', label: 'MISS 未命中' },
];

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
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');      // 重置分页
    next.delete('pageToken'); // 必须清除旧的翻页游标，否则旧 token 与新筛选条件不匹配
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  function reset() {
    startTransition(() => router.push(pathname));
  }

  const hasFilter = ['model', 'app', 'status', 'cache'].some(k => params.has(k));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 模型筛选 */}
      <select
        value={params.get('model') ?? ''}
        onChange={e => update('model', e.target.value)}
        style={selectStyle}
      >
        <option value="">全部模型</option>
        {models.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      {/* App 筛选 */}
      <select
        value={params.get('app') ?? ''}
        onChange={e => update('app', e.target.value)}
        style={selectStyle}
      >
        <option value="">全部 App</option>
        {apps.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      {/* 状态码筛选 */}
      <select
        value={params.get('status') ?? ''}
        onChange={e => update('status', e.target.value)}
        style={selectStyle}
      >
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* 缓存状态筛选 */}
      <select
        value={params.get('cache') ?? ''}
        onChange={e => update('cache', e.target.value)}
        style={selectStyle}
      >
        {CACHE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* 重置 */}
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
          ✕ 重置
        </button>
      )}

      {/* 加载指示 */}
      {pending && (
        <span className="text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
          查询中…
        </span>
      )}
    </div>
  );
}
