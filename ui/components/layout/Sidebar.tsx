'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** 导航项定义 */
const NAV = [
  {
    group: '监控',
    items: [
      { href: '/',       icon: '◈', label: 'Dashboard',   badge: null },
      { href: '/logs',   icon: '≡', label: '请求日志',    badge: 'live' },
    ],
  },
  {
    group: '管理',
    items: [
      { href: '/keys',   icon: '⬡', label: 'API Keys',    badge: null },
      { href: '/quota',  icon: '◎', label: '配额配置',    badge: null },
      { href: '/models', icon: '⊞', label: '模型路由',    badge: null },
    ],
  },
  {
    group: '系统',
    items: [
      { href: '/cache',  icon: '◇', label: '缓存管理',    badge: null },
      { href: '/alerts', icon: '△', label: '告警',        badge: null },  // badge 由 alertCount prop 动态覆盖
    ],
  },
];

interface SidebarProps {
  userEmail?:   string;
  alertCount?:  number;  // 告警策略数量，>0 时显示 badge
}

export function Sidebar({ userEmail = 'admin', alertCount = 0 }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col h-screen sticky top-0"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--c-card)',
        borderRight: '1px solid var(--c-border)',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-5 py-6"
        style={{ borderBottom: '1px solid var(--c-border)' }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 text-sm"
          style={{
            background: 'rgba(0,232,122,0.08)',
            border: '1px solid var(--c-green)',
            borderRadius: '6px',
          }}
        >
          ⬡
        </div>
        <div>
          <div
            className="text-xs font-bold tracking-widest uppercase"
            style={{ fontFamily: 'Syne, sans-serif', color: 'var(--c-txt-1)' }}
          >
            LLM Gateway
          </div>
          <div
            className="text-[9px] tracking-[0.15em] uppercase"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}
          >
            Admin Console
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-5">
            <div
              className="px-2.5 pb-1.5 text-[9px] tracking-[0.2em] uppercase"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}
            >
              {group}
            </div>
            {items.map(({ href, icon, label, badge }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] mb-0.5 transition-colors"
                  style={{
                    color:      active ? 'var(--c-green)' : 'var(--c-txt-2)',
                    background: active ? 'rgba(0,232,122,0.08)' : 'transparent',
                    border:     active ? '1px solid rgba(0,232,122,0.18)' : '1px solid transparent',
                  }}
                >
                  <span className="w-[18px] text-center text-sm">{icon}</span>
                  <span className="flex-1">{label}</span>
                  {(badge || (href === '/alerts' && alertCount > 0)) && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-sm"
                      style={{
                        fontFamily: 'IBM Plex Mono, monospace',
                        background: href === '/alerts' ? 'rgba(244,63,94,0.1)' : 'rgba(61,158,255,0.1)',
                        color:      href === '/alerts' ? 'var(--c-red)' : 'var(--c-blue)',
                        border:     href === '/alerts' ? '1px solid rgba(244,63,94,0.2)' : '1px solid rgba(61,158,255,0.2)',
                      }}
                    >
                      {href === '/alerts' ? String(alertCount) : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 用户信息 / IAP 状态 */}
      <div
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderTop: '1px solid var(--c-border)' }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] flex-shrink-0"
          style={{
            background: 'var(--c-border)',
            color: 'var(--c-txt-2)',
            fontFamily: 'IBM Plex Mono, monospace',
          }}
        >
          {userEmail.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] truncate"
            style={{ color: 'var(--c-txt-2)' }}
          >
            {userEmail}
          </div>
          <div
            className="text-[9px] tracking-[0.1em]"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-green)' }}
          >
            IAP VERIFIED
          </div>
        </div>
      </div>
    </aside>
  );
}
