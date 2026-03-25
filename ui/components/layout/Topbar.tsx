'use client';

import { useRouter } from 'next/navigation';

interface TopbarProps {
  title:    string;
  parent?:  string;       // 面包屑父级
  actions?: React.ReactNode;
  alertCount?: number;
  gatewayLive?: boolean;
}

export function Topbar({
  title,
  parent,
  actions,
  alertCount = 0,
  gatewayLive = true,
}: TopbarProps) {
  const router = useRouter();

  return (
    <header
      className="flex items-center justify-between px-7 h-14 sticky top-0 z-10"
      style={{
        background:   'var(--c-bg)',
        borderBottom: '1px solid var(--c-border)',
      }}
    >
      {/* 面包屑 + 页面标题 */}
      <div
        className="flex items-center gap-2 font-bold text-[15px]"
        style={{ fontFamily: 'Syne, sans-serif' }}
      >
        {parent && (
          <>
            <span style={{ color: 'var(--c-txt-3)', fontWeight: 400 }}>{parent}</span>
            <span style={{ color: 'var(--c-border)' }}>/</span>
          </>
        )}
        <span style={{ color: 'var(--c-txt-1)' }}>{title}</span>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-2.5">
        {/* 告警状态 */}
        {alertCount > 0 && (
          <StatusChip color="amber">
            <PulseDot color="amber" />
            {alertCount} 告警
          </StatusChip>
        )}

        {/* 网关状态 */}
        <StatusChip color={gatewayLive ? 'green' : 'red'}>
          <PulseDot color={gatewayLive ? 'green' : 'red'} />
          {gatewayLive ? '网关运行中' : '网关离线'}
        </StatusChip>

        {/* 刷新 */}
        <button
          onClick={() => router.refresh()}
          className="text-[11px] px-3.5 py-1.5 rounded-md transition-colors"
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            letterSpacing: '0.05em',
            background: 'transparent',
            color: 'var(--c-txt-2)',
            border: '1px solid var(--c-border)',
          }}
        >
          ↻ 刷新
        </button>

        {actions}
      </div>
    </header>
  );
}

/** 状态标签 chip */
function StatusChip({
  children,
  color,
}: {
  children: React.ReactNode;
  color: 'green' | 'amber' | 'red' | 'blue';
}) {
  const colors = {
    green: { c: 'var(--c-green)', bg: 'rgba(0,232,122,0.08)',   border: 'rgba(0,232,122,0.2)' },
    amber: { c: 'var(--c-amber)', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)' },
    red:   { c: 'var(--c-red)',   bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.2)' },
    blue:  { c: 'var(--c-blue)',  bg: 'rgba(61,158,255,0.08)',  border: 'rgba(61,158,255,0.2)' },
  }[color];

  return (
    <div
      className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-sm"
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        letterSpacing: '0.08em',
        color:   colors.c,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      {children}
    </div>
  );
}

/** 脉冲圆点 */
function PulseDot({ color }: { color: 'green' | 'amber' | 'red' }) {
  const bg = {
    green: 'var(--c-green)',
    amber: 'var(--c-amber)',
    red:   'var(--c-red)',
  }[color];
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full animate-pulse-dot"
      style={{ background: bg }}
    />
  );
}
