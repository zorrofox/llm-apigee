'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LogEntry } from '@/lib/logging';

interface LogTableProps {
  entries:       LogEntry[];
  nextPageToken: string | null;
  currentPage:   number;
}

function relTime(ts: string): string {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60)    return `${Math.floor(s)}秒前`;
  if (s < 3600)  return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}小时前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

function absTime(ts: string): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function StatusBadge({ code }: { code: string }) {
  const n = Number(code);
  const color = n >= 500 ? 'var(--c-red)' : n >= 400 ? 'var(--c-amber)' : 'var(--c-green)';
  const bg    = n >= 500 ? 'rgba(244,63,94,0.08)' : n >= 400 ? 'rgba(245,158,11,0.08)' : 'rgba(0,232,122,0.08)';
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium"
      style={{ fontFamily: 'IBM Plex Mono, monospace', color, background: bg, border: `1px solid ${color}33` }}>
      {code || '—'}
    </span>
  );
}

function CacheBadge({ status }: { status: string }) {
  if (!status) return <span style={{ color: 'var(--c-txt-3)', fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px' }}>—</span>;
  const isHit = status === 'HIT';
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-sm uppercase tracking-[0.08em]"
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        color:      isHit ? 'var(--c-green)' : 'var(--c-txt-3)',
        background: isHit ? 'rgba(0,232,122,0.08)' : 'transparent',
        border:     `1px solid ${isHit ? 'rgba(0,232,122,0.2)' : 'var(--c-border-dim)'}`,
      }}>
      {status}
    </span>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
      <span className="text-[9px] uppercase tracking-[0.15em] w-28 flex-shrink-0 pt-0.5"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
        {label}
      </span>
      <span className="text-[11px] break-all"
        style={{ fontFamily: mono ? 'IBM Plex Mono, monospace' : 'inherit', color: 'var(--c-txt-1)' }}>
        {value}
      </span>
    </div>
  );
}

function ExpandedDetail({ entry }: { entry: LogEntry }) {
  const fmtMs = (ms: string) => ms ? `${ms} ms` : '—';
  const fmtTok = (t: string) => t && t !== '0' ? t : '—';
  return (
    <div className="px-5 py-3" style={{ background: 'rgba(0,0,0,0.15)' }}>
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <DetailRow label="Request ID"    value={entry.requestId}        mono />
          <DetailRow label="时间"          value={new Date(entry.timestamp).toLocaleString('zh-CN')} />
          <DetailRow label="模型（请求）"  value={entry.modelRequested}   mono />
          <DetailRow label="模型（解析）"  value={entry.modelResolved}    mono />
          <DetailRow label="Publisher"     value={entry.publisher}        mono />
          <DetailRow label="Backend"       value={entry.backend}          mono />
          <DetailRow label="App"           value={entry.apiKeyApp} />
          <DetailRow label="开发者"        value={entry.apiKeyDeveloper} />
          <DetailRow label="客户端 IP"     value={entry.clientIp}         mono />
        </div>
        <div>
          <DetailRow label="状态码"        value={entry.statusCode}       mono />
          <DetailRow label="缓存状态"      value={entry.cacheStatus || '—'} />
          <DetailRow label="缓存相似度"    value={entry.cacheScore ? parseFloat(entry.cacheScore).toFixed(6) : '—'} mono />
          <DetailRow label="总延迟"        value={fmtMs(entry.totalLatencyMs)}   mono />
          <DetailRow label="后端延迟"      value={fmtMs(entry.targetLatencyMs)}  mono />
          <DetailRow label="输入 tokens"   value={fmtTok(entry.promptTokens)}    mono />
          <DetailRow label="输出 tokens"   value={fmtTok(entry.completionTokens)}mono />
          <DetailRow label="总 tokens"     value={fmtTok(entry.totalTokens)}     mono />
          <DetailRow label="有效 tokens"   value={fmtTok(entry.effectiveTokens)} mono />
          <DetailRow label="模型权重"      value={entry.tokenWeight ? `${entry.tokenWeight}×` : '—'} mono />
        </div>
      </div>
    </div>
  );
}

export function LogTable({ entries, nextPageToken, currentPage }: LogTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const searchParams = useSearchParams();

  /** 构建保留当前筛选参数的分页 URL */
  function pageUrl(page: number, token?: string): string {
    const p = new URLSearchParams(searchParams.toString());
    p.set('page', String(page));
    // URLSearchParams.set() 自动编码，不需要 encodeURIComponent（否则双重编码）
    if (token) p.set('pageToken', token);
    else p.delete('pageToken');
    return `?${p.toString()}`;
  }

  const LABEL_STYLE = {
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '9px',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'var(--c-txt-3)',
  };

  if (entries.length === 0) {
    return (
      <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="px-5 py-16 text-center text-[12px]" style={{ color: 'var(--c-txt-3)', fontFamily: 'IBM Plex Mono, monospace' }}>
          没有找到匹配的日志条目
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
            {['时间', '模型', 'App', '状态', '缓存', '延迟', 'Tokens', '有效'].map(h => (
              <th key={h} className="px-4 py-3 text-left" style={LABEL_STYLE}>{h}</th>
            ))}
            <th className="px-4 py-3 w-8" style={LABEL_STYLE} />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const key    = entry.requestId || `${i}`;
            const isOpen = expanded === key;
            const code   = Number(entry.statusCode);
            const rowOpacity = code >= 500 ? 0.7 : 1;

            return (
              <>
                <tr
                  key={key}
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="transition-colors"
                  style={{
                    borderBottom: '1px solid var(--c-border-dim)',
                    cursor: 'pointer',
                    opacity: rowOpacity,
                    background: isOpen ? 'rgba(255,255,255,0.02)' : 'transparent',
                  }}
                >
                  {/* 时间 */}
                  <td className="px-4 py-2.5">
                    <div className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-1)' }}>
                      {absTime(entry.timestamp)}
                    </div>
                    <div className="text-[9px] mt-0.5" style={{ color: 'var(--c-txt-3)' }}>
                      {relTime(entry.timestamp)}
                    </div>
                  </td>

                  {/* 模型 */}
                  <td className="px-4 py-2.5 max-w-[180px]">
                    <div className="text-[11px] truncate" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-1)' }}>
                      {entry.modelResolved || entry.modelRequested || '—'}
                    </div>
                    {entry.publisher && (
                      <div className="text-[9px] mt-0.5" style={{ color: 'var(--c-txt-3)' }}>{entry.publisher}</div>
                    )}
                  </td>

                  {/* App */}
                  <td className="px-4 py-2.5">
                    <div className="text-[11px]" style={{ color: 'var(--c-txt-2)' }}>
                      {entry.apiKeyApp || '—'}
                    </div>
                  </td>

                  {/* 状态码 */}
                  <td className="px-4 py-2.5">
                    <StatusBadge code={entry.statusCode} />
                  </td>

                  {/* 缓存 */}
                  <td className="px-4 py-2.5">
                    <CacheBadge status={entry.cacheStatus} />
                  </td>

                  {/* 延迟 */}
                  <td className="px-4 py-2.5">
                    <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-2)' }}>
                      {entry.totalLatencyMs ? `${entry.totalLatencyMs}ms` : '—'}
                    </span>
                  </td>

                  {/* Tokens */}
                  <td className="px-4 py-2.5">
                    <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-2)' }}>
                      {entry.totalTokens && entry.totalTokens !== '0' ? entry.totalTokens : '—'}
                    </span>
                  </td>

                  {/* 有效 tokens */}
                  <td className="px-4 py-2.5">
                    <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                      {entry.effectiveTokens && entry.effectiveTokens !== '0' ? entry.effectiveTokens : '—'}
                    </span>
                  </td>

                  {/* 展开箭头 */}
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-[10px]" style={{ color: 'var(--c-txt-3)', transition: 'transform 0.15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>
                      ›
                    </span>
                  </td>
                </tr>

                {/* 展开详情行 */}
                {isOpen && (
                  <tr key={`${key}-detail`} style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <ExpandedDetail entry={entry} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      {/* 分页 */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ borderTop: '1px solid var(--c-border-dim)' }}>
        <span className="text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
          第 {currentPage} 页 · {entries.length} 条
        </span>
        <div className="flex gap-2">
          {currentPage > 1 && (
            <a href={pageUrl(currentPage - 1)}
              className="text-[11px] px-3 py-1.5 rounded-sm"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)', background: 'rgba(61,158,255,0.08)', border: '1px solid rgba(61,158,255,0.2)' }}>
              ← 上一页
            </a>
          )}
          {nextPageToken && (
            <a href={pageUrl(currentPage + 1, nextPageToken)}
              className="text-[11px] px-3 py-1.5 rounded-sm"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)', background: 'rgba(61,158,255,0.08)', border: '1px solid rgba(61,158,255,0.2)' }}>
              下一页 →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
