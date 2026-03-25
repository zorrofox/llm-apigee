'use client';

import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { MetricSummary, TimeSeriesPoint } from '@/lib/monitoring';

type Tab = '请求量' | 'Token' | '错误' | '延迟';

interface RequestChartProps {
  metrics: Pick<MetricSummary, 'requestTrend' | 'tokenTrend' | 'errorTrend' | 'latencyTrend'> | null;
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtValue(tab: Tab, v: number): string {
  if (tab === 'Token') return v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(v);
  if (tab === '延迟')  return `${v}ms`;
  return String(v);
}

export function RequestChart({ metrics }: RequestChartProps) {
  const [tab, setTab] = useState<Tab>('请求量');

  // 根据当前 Tab 选择对应的真实数据
  function getPoints(): TimeSeriesPoint[] {
    if (!metrics) return [];
    if (tab === '请求量') return metrics.requestTrend;
    if (tab === 'Token')   return metrics.tokenTrend;
    if (tab === '错误')    return metrics.errorTrend;
    if (tab === '延迟')    return metrics.latencyTrend;
    return [];
  }

  const points    = getPoints();
  const hasData   = points.length > 0;
  const chartData = points.map(p => ({ time: fmtTime(p.timestamp), value: p.value }));

  const tabColor: Record<Tab, string> = {
    '请求量': 'var(--c-green)',
    'Token':   'var(--c-blue)',
    '错误':    'var(--c-red)',
    '延迟':    'var(--c-amber)',
  };
  const activeColor = tabColor[tab];

  const TABS: Tab[] = ['请求量', 'Token', '错误', '延迟'];
  const noDataTabs: Tab[] = []; // 所有 Tab 均有真实数据

  return (
    <div className="rounded-md overflow-hidden"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>

      {/* Tab 栏 */}
      <div className="flex" style={{ borderBottom: '1px solid var(--c-border)' }}>
        {TABS.map(t => {
          const isNoData = noDataTabs.includes(t);
          const active   = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)}
              disabled={isNoData}
              className="px-4 py-3 text-[12px] transition-colors relative"
              style={{
                fontFamily:      'IBM Plex Mono, monospace',
                letterSpacing:   '0.05em',
                color:           active ? tabColor[t] : 'var(--c-txt-3)',
                opacity:         isNoData ? 0.4 : 1,
                textDecoration:  isNoData ? 'line-through' : 'none',
                borderTop:       'none',
                borderLeft:      'none',
                borderRight:     'none',
                borderBottom:    active ? `2px solid ${tabColor[t]}` : '2px solid transparent',
                marginBottom:    '-1px',
                background:      'transparent',
                cursor:          isNoData ? 'not-allowed' : 'pointer',
              }}>
              {t}
              {isNoData && (
                <span className="ml-1 text-[8px]" style={{ color: 'var(--c-border)' }}>—</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 图표 본체 */}
      <div className="p-5">
        {!hasData ? (
          /* 无数据状态 */
          <div className="flex items-center justify-center" style={{ height: '160px' }}>
            <div className="text-center">
              <div className="text-[11px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
                {tab === '延迟' ? '延迟数据需要先发送请求才会生成' : '暂无数据（指标通常在首次请求后 2-3 分钟内就绪）'}
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
                formatter={(v: unknown) => [fmtValue(tab, Number(v)), tab]}
                cursor={{ stroke: 'var(--c-border)', strokeWidth: 1 }}
              />
              <Area type="monotone" dataKey="value"
                stroke={activeColor} strokeWidth={1.5}
                fill={`url(#grad-${tab})`}
                dot={false} activeDot={{ r: 3, fill: activeColor }} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* 数据来源说明 */}
        <div className="mt-2 text-[9px]" style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}>
          {hasData
            ? `Cloud Monitoring · 最近 24h · ${chartData.length} 个数据点`
            : tab !== '延迟' ? '数据来源：Cloud Monitoring log-based 指标' : ''}
        </div>
      </div>
    </div>
  );
}
