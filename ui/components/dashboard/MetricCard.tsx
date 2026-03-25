/** 指标卡片，顶部彩色高亮线 + 迷你折线图 */

interface MetricCardProps {
  label:   string;
  value:   string;
  delta:   string;
  deltaOk?: boolean;
  color:   'green' | 'blue' | 'amber' | 'red';
  sparkData?: number[]; // 24 个点
}

const COLOR = {
  green: { main: 'var(--c-green)', dim: 'rgba(0,232,122,0.08)' },
  blue:  { main: 'var(--c-blue)',  dim: 'rgba(61,158,255,0.08)' },
  amber: { main: 'var(--c-amber)', dim: 'rgba(245,158,11,0.08)' },
  red:   { main: 'var(--c-red)',   dim: 'rgba(244,63,94,0.08)' },
};

export function MetricCard({ label, value, delta, deltaOk = true, color, sparkData = [] }: MetricCardProps) {
  const c   = COLOR[color];
  const max = Math.max(...sparkData, 1);

  return (
    <div
      className="relative overflow-hidden rounded-md p-5"
      style={{
        background:  'var(--c-card)',
        border:      '1px solid var(--c-border)',
        transition:  'border-color 0.2s',
      }}
    >
      {/* 顶部渐变高亮线 */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: `linear-gradient(90deg, transparent, ${c.main}, transparent)` }}
      />

      {/* 标签 */}
      <div
        className="text-[10px] tracking-[0.15em] uppercase mb-3"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}
      >
        {label}
      </div>

      {/* 主数值 */}
      <div
        className="text-3xl font-extrabold leading-none mb-2 animate-count"
        style={{ fontFamily: 'Syne, sans-serif', color: c.main }}
      >
        {value}
      </div>

      {/* 增量说明 */}
      <div
        className="text-[10px]"
        style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}
      >
        {delta}
        {deltaOk && <span style={{ color: 'var(--c-green)' }}> ↑</span>}
      </div>

      {/* 迷你柱状图 */}
      {sparkData.length > 0 && (
        <div className="flex items-end gap-0.5 mt-3" style={{ height: '36px' }}>
          {sparkData.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm"
              style={{
                height:     `${Math.max(4, (v / max) * 36)}px`,
                background: c.main,
                opacity:    i === sparkData.length - 1 ? 1 : 0.4 + (i / sparkData.length) * 0.4,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
