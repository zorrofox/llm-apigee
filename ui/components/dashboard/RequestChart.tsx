'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { MetricSummary, TimeSeriesPoint } from '@/lib/monitoring';

type TabKey = 'requests' | 'tokens' | 'errors' | 'latency';

interface RequestChartProps {
  metrics: Pick<MetricSummary, 'requestTrend' | 'tokenTrend' | 'errorTrend' | 'latencyTrend'> | null;
}

function fmtValue(tab: TabKey, v: number): string {
  if (tab === 'tokens')  return v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(v);
  if (tab === 'latency') return `${v}ms`;
  return String(v);
}

export function RequestChart({ metrics }: RequestChartProps) {
  const t      = useTranslations('dashboard');
  const locale = useLocale();
  const [tab, setTab] = useState<TabKey>('requests');

  const tabLabel: Record<TabKey, string> = {
    requests: t('tabRequests'),
    tokens:   t('tabTokens'),
    errors:   t('tabErrors'),
    latency:  t('tabLatency'),
  };

  function fmtTime(ts: string) {
    return new Date(ts).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US',
      { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function getPoints(): TimeSeriesPoint[] {
    if (!metrics) return [];
    if (tab === 'requests') return metrics.requestTrend;
    if (tab === 'tokens')   return metrics.tokenTrend;
    if (tab === 'errors')   return metrics.errorTrend;
    if (tab === 'latency')  return metrics.latencyTrend;
    return [];
  }

  const points    = getPoints();
  const hasData   = points.length > 0;
  const chartData = points.map(p => ({ time: fmtTime(p.timestamp), value: p.value }));

  const tabColor: Record<TabKey, string> = {
    requests: 'var(--c-green)',
    tokens:   'var(--c-blue)',
    errors:   'var(--c-red)',
    latency:  'var(--c-amber)',
  };
  const activeColor = tabColor[tab];

  const TABS: TabKey[] = ['requests', 'tokens', 'errors', 'latency'];

  return (
    <div className="rounded-md overflow-hidden"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>

      <div className="flex" style={{ borderBottom: '1px solid var(--c-border)' }}>
        {TABS.map(k => {
          const active = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)}
              className="px-4 py-3 text-[12px] transition-colors relative"
              style={{
                fontFamily:      'IBM Plex Mono, monospace',
                letterSpacing:   '0.05em',
                color:           active ? tabColor[k] : 'var(--c-txt-3)',
                borderTop:       'none',
                borderLeft:      'none',
                borderRight:     'none',
                borderBottom:    active ? `2px solid ${tabColor[k]}` : '2px solid transparent',
                marginBottom:    '-1px',
                background:      'transparent',
                cursor:          'pointer',
              }}>
              {tabLabel[k]}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {!hasData ? (
          <div className="flex items-center justify-center" style={{ height: '160px' }}>
            <div className="text-center">
              <div className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                {tab === 'latency' ? t('chartNoLatency') : t('chartNoData')}
              </div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${tab}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={activeColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={activeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--c-border-dim)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time"
                tick={{ fill: 'var(--c-txt-3)', fontSize: 9, fontFamily: 'IBM Plex Mono' }}
                tickLine={false} axisLine={false} interval={3} />
              <YAxis
                tick={{ fill: 'var(--c-txt-3)', fontSize: 9, fontFamily: 'IBM Plex Mono' }}
                tickLine={false} axisLine={false}
                domain={[0, 'auto']}
                tickFormatter={v => fmtValue(tab, v)} />
              <Tooltip
                contentStyle={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: '4px', fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--c-txt-1)' }}
                labelStyle={{ color: 'var(--c-txt-3)' }}
                formatter={(v: unknown) => [fmtValue(tab, Number(v)), tabLabel[tab]]}
                cursor={{ stroke: 'var(--c-border)', strokeWidth: 1 }}
              />
              <Area type="monotone" dataKey="value"
                stroke={activeColor} strokeWidth={1.5}
                fill={`url(#grad-${tab})`}
                dot={false} activeDot={{ r: 3, fill: activeColor }} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        <div className="mt-2 text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
          {hasData
            ? t('chartFooterWithData', { count: chartData.length })
            : tab !== 'latency' ? t('chartFooterSource') : ''}
        </div>
      </div>
    </div>
  );
}
