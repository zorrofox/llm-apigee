'use client';

import { useLocale } from 'next-intl';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import type { CacheStats } from '@/lib/cache-stats';

const T_EN = {
  hourlyTitle: 'Past 24 Hours',
  hourlyDesc: 'Hits vs misses (per hour)',
  hit: 'hit',
  miss: 'miss',
  modelTitle: 'Hit Rate by Model',
  modelDesc: 'Past 24h, sorted by hit count',
  noData: 'No cache data',
  thModel: 'Model',
  thHit: 'Hits',
  thMiss: 'Misses',
  thRate: 'Hit Rate',
  scoreTitle: 'Similarity Distribution',
  scoreDesc: 'cacheScore distribution for hits (threshold ≥ 0.95)',
  noHit: 'No cache hits',
  countLabel: 'Count',
  countSuffix: (n: number) => `${n} hits`,
  recentTitle: 'Recent Cache Hits',
  recentDesc: 'Last 20 HIT requests (similarity ≥ 0.95)',
  noRecent: 'No hit records',
  thTime: 'Time',
  thScore: 'Score',
  thApp: 'App',
  thLatency: 'Latency',
  cardHit: 'Cache Hits / 24h',
  cardMiss: 'Cache Misses / 24h',
  cardRate: 'Overall Hit Rate',
  cardSaving: 'LLM Calls Saved',
  cardHitSub: (n: number) => `${n}% of total requests`,
  cardMissSub: (n: number) => `${n}% of total requests`,
  cardRateSub: (n: number) => `${n} effective requests`,
  cardSavingSub: 'Each hit saves one full call',
  countItems: (n: number, p: number) => `${n} hits (${p}%)`,
  secondsAgo: (n: number) => `${n}s ago`,
  minutesAgo: (n: number) => `${n}m ago`,
  hoursAgo: (n: number) => `${n}h ago`,
};

const T_ZH = {
  hourlyTitle: '过去 24 小时趋势',
  hourlyDesc: '命中次数 vs 未命中次数（每小时）',
  hit: '命中',
  miss: '未命中',
  modelTitle: '模型命中率排行',
  modelDesc: '过去 24 小时，按命中次数降序',
  noData: '暂无缓存数据',
  thModel: '模型',
  thHit: '命中',
  thMiss: '未命中',
  thRate: '命中率',
  scoreTitle: '相似度分布',
  scoreDesc: '命中请求的 cacheScore 分布（阈值 ≥ 0.95）',
  noHit: '暂无缓存命中数据',
  countLabel: '次数',
  countSuffix: (n: number) => `${n} 次`,
  recentTitle: '最近缓存命中',
  recentDesc: '最近 20 条 HIT 请求（相似度 ≥ 0.95）',
  noRecent: '暂无命中记录',
  thTime: '时间',
  thScore: '相似度',
  thApp: 'App',
  thLatency: '延迟',
  cardHit: '缓存命中 / 24h',
  cardMiss: '缓存未命中 / 24h',
  cardRate: '综合命中率',
  cardSaving: '节省 LLM 调用',
  cardHitSub: (n: number) => `占总请求 ${n}%`,
  cardMissSub: (n: number) => `占总请求 ${n}%`,
  cardRateSub: (n: number) => `共 ${n} 次有效请求`,
  cardSavingSub: '每次命中节省一次完整调用',
  countItems: (n: number, p: number) => `${n} 次 (${p}%)`,
  secondsAgo: (n: number) => `${n}秒前`,
  minutesAgo: (n: number) => `${n}分前`,
  hoursAgo: (n: number) => `${n}小时前`,
};

const MONO = { fontFamily: 'IBM Plex Mono, monospace' };
const LABEL_STYLE = { ...MONO, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--c-txt-3)' };

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

function HourlyChart({ T, data }: { T: typeof T_EN; data: CacheStats['hourlyTrend'] }) {
  const hitKey  = T.hit;
  const missKey = T.miss;
  const chartData = data.map(d => {
    const obj: Record<string, string | number> = { hour: d.hour };
    obj[hitKey]  = d.hits;
    obj[missKey] = d.misses;
    return obj;
  });
  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{T.hourlyTitle}</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>{T.hourlyDesc}</div>
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
            <Area type="monotone" dataKey={hitKey}  stroke="var(--c-green)" strokeWidth={1.5} fill="url(#gHit)"  dot={false} />
            <Area type="monotone" dataKey={missKey} stroke="var(--c-txt-3)" strokeWidth={1}   fill="url(#gMiss)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          {[{ color: 'var(--c-green)', label: T.hit }, { color: 'var(--c-txt-3)', label: T.miss }].map(({ color, label }) => (
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

function ModelHitRateTable({ T, data }: { T: typeof T_EN; data: CacheStats['modelStats'] }) {
  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{T.modelTitle}</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>{T.modelDesc}</div>
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>{T.noData}</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              {[T.thModel, T.thHit, T.thMiss, T.thRate].map(h => (
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

function ScoreDistribution({ T, data }: { T: typeof T_EN; data: CacheStats['scoreBuckets'] }) {
  const chartData = data.map(b => ({ label: b.label, count: b.count, pct: Math.round(b.pct * 100) }));
  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{T.scoreTitle}</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>{T.scoreDesc}</div>
      </div>
      <div className="p-5">
        {data.every(b => b.count === 0) ? (
          <div className="py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>{T.noHit}</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--c-border-dim)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--c-txt-3)', fontSize: 9, fontFamily: 'IBM Plex Mono' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'var(--c-txt-3)', fontSize: 9, fontFamily: 'IBM Plex Mono' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: '4px', ...MONO, fontSize: '11px', color: 'var(--c-txt-1)' }}
                  formatter={(v: unknown) => [T.countSuffix(Number(v)), T.countLabel]}
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
                  <span className="text-[10px] w-20 text-right" style={{ ...MONO, color: 'var(--c-txt-2)' }}>
                    {T.countItems(b.count, Math.round(b.pct * 100))}
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

function RecentHitsList({ T, data, locale }: { T: typeof T_EN; data: CacheStats['recentHits']; locale: string }) {
  function fmtTime(ts: string) {
    return new Date(ts).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US',
      { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }
  function relTime(ts: string) {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60)    return T.secondsAgo(Math.floor(s));
    if (s < 3600)  return T.minutesAgo(Math.floor(s / 60));
    return T.hoursAgo(Math.floor(s / 3600));
  }

  return (
    <div className="rounded-md overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{T.recentTitle}</div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--c-txt-3)' }}>{T.recentDesc}</div>
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px]" style={{ color: 'var(--c-txt-3)' }}>{T.noRecent}</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
              {[T.thTime, T.thModel, T.thScore, T.thApp, T.thLatency].map(h => (
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

export function CacheStatsView({ stats }: { stats: CacheStats }) {
  const locale = useLocale();
  const T = locale === 'zh' ? T_ZH : T_EN;
  const hitRatePct = Math.round(stats.hitRate * 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3.5">
        <SummaryCard label={T.cardHit}    value={String(stats.totalHits)}    sub={T.cardHitSub(hitRatePct)}    color="var(--c-green)" />
        <SummaryCard label={T.cardMiss}   value={String(stats.totalMisses)}  sub={T.cardMissSub(100 - hitRatePct)} color="var(--c-txt-3)" />
        <SummaryCard label={T.cardRate}   value={`${hitRatePct}%`}           sub={T.cardRateSub(stats.totalRequests)} color={hitRatePct >= 50 ? 'var(--c-green)' : hitRatePct >= 20 ? 'var(--c-amber)' : 'var(--c-txt-3)'} />
        <SummaryCard label={T.cardSaving} value={String(stats.estimatedSaving)} sub={T.cardSavingSub} color="var(--c-blue)" />
      </div>

      <HourlyChart T={T} data={stats.hourlyTrend} />

      <div className="grid grid-cols-2 gap-3.5">
        <ModelHitRateTable T={T} data={stats.modelStats} />
        <ScoreDistribution T={T} data={stats.scoreBuckets} />
      </div>

      <RecentHitsList T={T} data={stats.recentHits} locale={locale} />
    </div>
  );
}
