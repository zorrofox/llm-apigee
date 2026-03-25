'use client';

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import type { CacheStats } from '@/lib/cache-stats';

const MONO = { fontFamily: 'IBM Plex Mono, monospace' };
const LABEL_STYLE = { ...MONO, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--c-txt-3)' };

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function relTime(ts: string) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60)    return `${Math.floor(s)}秒前`;
  if (s < 3600)  return `${Math.floor(s / 60)}分前`;
  return `${Math.floor(s / 3600)}小时前`;
}

// ── 顶部摘要卡片 ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-md p-5 relative overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="text-[10px] tracking-[0.15em] uppercase mb-3" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{label}</div>
      <div className="text-3xl font-extrabold leading-none mb-2" style={{ fontFamily: 'Syne, sans-serif', color }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{sub}</div>}
    </div>
  );
}

// ── 小时趋势折线图 ────────────────────────────────────────────────────────────

function HourlyChart({ data }: { data: CacheStats['hourlyTrend'] }) {
  const chartData = data.map(d => ({ hour: d.hour, 命中: d.hits, 未命中: d.misses, hitRate: Math.round(d.hitRate * 100) }));
  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>过去 24 小时趋势</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>命中次数 vs 未命中次数（每小时）</div>
      </div>
      <div className="p-5">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gHit"  x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--c-green)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--c-green)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gMiss" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--c-txt-3)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--c-txt-3)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--c-border-dim)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="hour" tick={{ fill: 'var(--c-txt-3)', fontSize: 9, fontFamily: 'IBM Plex Mono' }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fill: 'var(--c-txt-3)', fontSize: 9, fontFamily: 'IBM Plex Mono' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: '4px', ...MONO, fontSize: '11px', color: 'var(--c-txt-1)' }}
              labelStyle={{ color: 'var(--c-txt-3)' }}
            />
            <Area type="monotone" dataKey="命中"   stroke="var(--c-green)" strokeWidth={1.5} fill="url(#gHit)"  dot={false} />
            <Area type="monotone" dataKey="未命中" stroke="var(--c-txt-3)" strokeWidth={1}   fill="url(#gMiss)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          {[{ color: 'var(--c-green)', label: '命中' }, { color: 'var(--c-txt-3)', label: '未命中' }].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[9px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 按模型命中率排行 ──────────────────────────────────────────────────────────

function ModelHitRateTable({ data }: { data: CacheStats['modelStats'] }) {
  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>模型命中率排行</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>过去 24 小时，按命中次数降序</div>
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>暂无缓存数据</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              {['模型', '命中', '未命中', '命中率'].map(h => (
                <th key={h} className="px-5 py-2.5 text-left" style={LABEL_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(m => {
              const pct    = Math.round(m.hitRate * 100);
              const barColor = pct >= 60 ? 'var(--c-green)' : pct >= 30 ? 'var(--c-amber)' : 'var(--c-txt-3)';
              return (
                <tr key={m.model} style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                  <td className="px-5 py-2.5">
                    <span className="text-[11px]" style={{ ...MONO, color: 'var(--c-txt-1)' }}>{m.model}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-[11px]" style={{ ...MONO, color: 'var(--c-green)' }}>{m.hits}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-[11px]" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{m.misses}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full" style={{ background: 'var(--c-border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <span className="text-[11px]" style={{ ...MONO, color: barColor }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── 相似度分布 ────────────────────────────────────────────────────────────────

function ScoreDistribution({ data }: { data: CacheStats['scoreBuckets'] }) {
  const chartData = data.map(b => ({ label: b.label, count: b.count, pct: Math.round(b.pct * 100) }));
  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>相似度分布</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>命中请求的 cacheScore 分布（阈值 ≥ 0.95）</div>
      </div>
      <div className="p-5">
        {data.every(b => b.count === 0) ? (
          <div className="py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>暂无缓存命中数据</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--c-border-dim)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--c-txt-3)', fontSize: 9, fontFamily: 'IBM Plex Mono' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'var(--c-txt-3)', fontSize: 9, fontFamily: 'IBM Plex Mono' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: '4px', ...MONO, fontSize: '11px', color: 'var(--c-txt-1)' }}
                  formatter={(v: unknown) => [`${v} 次`, '次数']}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={['var(--c-amber)', 'var(--c-blue)', 'var(--c-green)', 'var(--c-green)'][i] ?? 'var(--c-green)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5">
              {data.map(b => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="text-[10px] w-20 flex-shrink-0" style={{ ...MONO, color: 'var(--c-txt-3)' }}>{b.label}</span>
                  <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--c-border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(b.pct * 100)}%`, background: 'var(--c-green)', opacity: 0.5 + b.pct * 0.5 }} />
                  </div>
                  <span className="text-[10px] w-16 text-right" style={{ ...MONO, color: 'var(--c-txt-2)' }}>
                    {b.count} 次 ({Math.round(b.pct * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── 最近命中列表 ──────────────────────────────────────────────────────────────

function RecentHitsList({ data }: { data: CacheStats['recentHits'] }) {
  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>最近缓存命中</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>最近 20 条 HIT 请求（相似度 ≥ 0.95）</div>
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>暂无命中记录</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              {['时间', '模型', '相似度', 'App', '延迟'].map(h => (
                <th key={h} className="px-5 py-2.5 text-left" style={LABEL_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const scoreColor = r.score >= 0.99 ? 'var(--c-green)' : r.score >= 0.97 ? 'var(--c-blue)' : 'var(--c-amber)';
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                  <td className="px-5 py-2.5">
                    <div className="text-[11px]" style={{ ...MONO, color: 'var(--c-txt-1)' }}>{fmtTime(r.timestamp)}</div>
                    <div className="text-[9px] mt-0.5" style={{ color: 'var(--c-txt-3)' }}>{relTime(r.timestamp)}</div>
                  </td>
                  <td className="px-5 py-2.5 max-w-[180px]">
                    <span className="text-[11px] truncate block" style={{ ...MONO, color: 'var(--c-txt-2)' }}>{r.model}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-[11px]" style={{ ...MONO, color: scoreColor }}>{r.score.toFixed(4)}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-[11px]" style={{ color: 'var(--c-txt-2)' }}>{r.app}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-[11px]" style={{ ...MONO, color: r.latencyMs > 0 ? 'var(--c-green)' : 'var(--c-txt-3)' }}>
                      {r.latencyMs > 0 ? `${r.latencyMs}ms` : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function CacheStatsView({ stats }: { stats: CacheStats }) {
  const hitRatePct = Math.round(stats.hitRate * 100);

  return (
    <div className="space-y-4">
      {/* 摘要卡片 */}
      <div className="grid grid-cols-4 gap-3.5">
        <SummaryCard
          label="缓存命中 / 24h"
          value={String(stats.totalHits)}
          sub={`占总请求 ${hitRatePct}%`}
          color="var(--c-green)"
        />
        <SummaryCard
          label="缓存未命中 / 24h"
          value={String(stats.totalMisses)}
          sub={`占总请求 ${100 - hitRatePct}%`}
          color="var(--c-txt-3)"
        />
        <SummaryCard
          label="综合命中率"
          value={`${hitRatePct}%`}
          sub={`共 ${stats.totalRequests} 次有效请求`}
          color={hitRatePct >= 50 ? 'var(--c-green)' : hitRatePct >= 20 ? 'var(--c-amber)' : 'var(--c-txt-3)'}
        />
        <SummaryCard
          label="节省 LLM 调用"
          value={String(stats.estimatedSaving)}
          sub="每次命中节省一次完整调用"
          color="var(--c-blue)"
        />
      </div>

      {/* 趋势图 */}
      <HourlyChart data={stats.hourlyTrend} />

      {/* 模型排行 + 相似度分布 */}
      <div className="grid grid-cols-2 gap-3.5">
        <ModelHitRateTable data={stats.modelStats} />
        <ScoreDistribution data={stats.scoreBuckets} />
      </div>

      {/* 最近命中列表 */}
      <RecentHitsList data={stats.recentHits} />
    </div>
  );
}
