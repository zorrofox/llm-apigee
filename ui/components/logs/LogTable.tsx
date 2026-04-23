'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import type { LogEntry } from '@/lib/logging';

interface LogTableProps {
  entries:       LogEntry[];
  nextPageToken: string | null;
  currentPage:   number;
}

const T_EN = {
  noLogs: 'No matching log entries',
  thTime: 'Time', thModel: 'Model', thApp: 'App', thStatus: 'Status', thCache: 'Cache',
  thLatency: 'Latency', thTokens: 'Tokens', thEffective: 'Effective',
  pageInfo: (p: number, n: number) => `Page ${p} · ${n} entries`,
  prev: '← Previous', next: 'Next →',
  detailRequestId: 'Request ID', detailTime: 'Time',
  detailModelReq: 'Model (request)', detailModelRes: 'Model (resolved)',
  detailPub: 'Publisher', detailBackend: 'Backend',
  detailApp: 'App', detailDev: 'Developer', detailIp: 'Client IP',
  detailStatus: 'Status', detailCache: 'Cache status', detailScore: 'Cache similarity',
  detailLat: 'Total latency', detailBackendLat: 'Backend latency',
  detailIn: 'Input tokens', detailOut: 'Output tokens',
  detailTotal: 'Total tokens', detailEff: 'Effective tokens', detailWeight: 'Model weight',
  secondsAgo: (n: number) => `${n}s ago`,
  minutesAgo: (n: number) => `${n}m ago`,
  hoursAgo: (n: number) => `${n}h ago`,
};

const T_ZH = {
  noLogs: '没有找到匹配的日志条目',
  thTime: '时间', thModel: '模型', thApp: 'App', thStatus: '状态', thCache: '缓存',
  thLatency: '延迟', thTokens: 'Tokens', thEffective: '有效',
  pageInfo: (p: number, n: number) => `第 ${p} 页 · ${n} 条`,
  prev: '← 上一页', next: '下一页 →',
  detailRequestId: 'Request ID', detailTime: '时间',
  detailModelReq: '模型（请求）', detailModelRes: '模型（解析）',
  detailPub: 'Publisher', detailBackend: 'Backend',
  detailApp: 'App', detailDev: '开发者', detailIp: '客户端 IP',
  detailStatus: '状态码', detailCache: '缓存状态', detailScore: '缓存相似度',
  detailLat: '总延迟', detailBackendLat: '后端延迟',
  detailIn: '输入 tokens', detailOut: '输出 tokens',
  detailTotal: '总 tokens', detailEff: '有效 tokens', detailWeight: '模型权重',
  secondsAgo: (n: number) => `${n}秒前`,
  minutesAgo: (n: number) => `${n}分前`,
  hoursAgo: (n: number) => `${n}小时前`,
};

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

function ExpandedDetail({ T, entry, locale }: { T: typeof T_EN; entry: LogEntry; locale: string }) {
  const fmtMs = (ms: string) => ms ? `${ms} ms` : '—';
  const fmtTok = (t: string) => t && t !== '0' ? t : '—';
  return (
    <div className="px-5 py-3" style={{ background: 'rgba(0,0,0,0.15)' }}>
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <DetailRow label={T.detailRequestId}    value={entry.requestId}        mono />
          <DetailRow label={T.detailTime}         value={new Date(entry.timestamp).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')} />
          <DetailRow label={T.detailModelReq}     value={entry.modelRequested}   mono />
          <DetailRow label={T.detailModelRes}     value={entry.modelResolved}    mono />
          <DetailRow label={T.detailPub}          value={entry.publisher}        mono />
          <DetailRow label={T.detailBackend}      value={entry.backend}          mono />
          <DetailRow label={T.detailApp}          value={entry.apiKeyApp} />
          <DetailRow label={T.detailDev}          value={entry.apiKeyDeveloper} />
          <DetailRow label={T.detailIp}           value={entry.clientIp}         mono />
        </div>
        <div>
          <DetailRow label={T.detailStatus}       value={entry.statusCode}       mono />
          <DetailRow label={T.detailCache}        value={entry.cacheStatus || '—'} />
          <DetailRow label={T.detailScore}        value={entry.cacheScore ? parseFloat(entry.cacheScore).toFixed(6) : '—'} mono />
          <DetailRow label={T.detailLat}          value={fmtMs(entry.totalLatencyMs)}   mono />
          <DetailRow label={T.detailBackendLat}   value={fmtMs(entry.targetLatencyMs)}  mono />
          <DetailRow label={T.detailIn}           value={fmtTok(entry.promptTokens)}    mono />
          <DetailRow label={T.detailOut}          value={fmtTok(entry.completionTokens)}mono />
          <DetailRow label={T.detailTotal}        value={fmtTok(entry.totalTokens)}     mono />
          <DetailRow label={T.detailEff}          value={fmtTok(entry.effectiveTokens)} mono />
          <DetailRow label={T.detailWeight}       value={entry.tokenWeight ? `${entry.tokenWeight}×` : '—'} mono />
        </div>
      </div>
    </div>
  );
}

export function LogTable({ entries, nextPageToken, currentPage }: LogTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const locale = useLocale();
  const T = locale === 'zh' ? T_ZH : T_EN;

  function relTime(ts: string): string {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60)    return T.secondsAgo(Math.floor(s));
    if (s < 3600)  return T.minutesAgo(Math.floor(s / 60));
    if (s < 86400) return T.hoursAgo(Math.floor(s / 3600));
    return new Date(ts).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US');
  }

  function absTime(ts: string): string {
    return new Date(ts).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US',
      { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function pageUrl(page: number, token?: string): string {
    const p = new URLSearchParams(searchParams.toString());
    p.set('page', String(page));
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
          {T.noLogs}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
            {[T.thTime, T.thModel, T.thApp, T.thStatus, T.thCache, T.thLatency, T.thTokens, T.thEffective].map(h => (
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
                  <td className="px-4 py-2.5">
                    <div className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-1)' }}>
                      {absTime(entry.timestamp)}
                    </div>
                    <div className="text-[9px] mt-0.5" style={{ color: 'var(--c-txt-3)' }}>
                      {relTime(entry.timestamp)}
                    </div>
                  </td>

                  <td className="px-4 py-2.5 max-w-[180px]">
                    <div className="text-[11px] truncate" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-1)' }}>
                      {entry.modelResolved || entry.modelRequested || '—'}
                    </div>
                    {entry.publisher && (
                      <div className="text-[9px] mt-0.5" style={{ color: 'var(--c-txt-3)' }}>{entry.publisher}</div>
                    )}
                  </td>

                  <td className="px-4 py-2.5">
                    <div className="text-[11px]" style={{ color: 'var(--c-txt-2)' }}>
                      {entry.apiKeyApp || '—'}
                    </div>
                  </td>

                  <td className="px-4 py-2.5">
                    <StatusBadge code={entry.statusCode} />
                  </td>

                  <td className="px-4 py-2.5">
                    <CacheBadge status={entry.cacheStatus} />
                  </td>

                  <td className="px-4 py-2.5">
                    <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-2)' }}>
                      {entry.totalLatencyMs ? `${entry.totalLatencyMs}ms` : '—'}
                    </span>
                  </td>

                  <td className="px-4 py-2.5">
                    <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-2)' }}>
                      {entry.totalTokens && entry.totalTokens !== '0' ? entry.totalTokens : '—'}
                    </span>
                  </td>

                  <td className="px-4 py-2.5">
                    <span className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                      {entry.effectiveTokens && entry.effectiveTokens !== '0' ? entry.effectiveTokens : '—'}
                    </span>
                  </td>

                  <td className="px-4 py-2.5 text-center">
                    <span className="text-[10px]" style={{ color: 'var(--c-txt-3)', transition: 'transform 0.15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>
                      ›
                    </span>
                  </td>
                </tr>

                {isOpen && (
                  <tr key={`${key}-detail`} style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <ExpandedDetail T={T} entry={entry} locale={locale} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      <div className="flex items-center justify-between px-5 py-3"
        style={{ borderTop: '1px solid var(--c-border-dim)' }}>
        <span className="text-[10px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
          {T.pageInfo(currentPage, entries.length)}
        </span>
        <div className="flex gap-2">
          {currentPage > 1 && (
            <a href={pageUrl(currentPage - 1)}
              className="text-[11px] px-3 py-1.5 rounded-sm"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)', background: 'rgba(61,158,255,0.08)', border: '1px solid rgba(61,158,255,0.2)' }}>
              {T.prev}
            </a>
          )}
          {nextPageToken && (
            <a href={pageUrl(currentPage + 1, nextPageToken)}
              className="text-[11px] px-3 py-1.5 rounded-sm"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)', background: 'rgba(61,158,255,0.08)', border: '1px solid rgba(61,158,255,0.2)' }}>
              {T.next}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
