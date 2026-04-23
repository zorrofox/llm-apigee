'use client';

import { useTranslations } from 'next-intl';
import type { LogEntry } from '@/lib/logging';

interface ActivityFeedProps {
  entries: LogEntry[];
}

type Level = 'ok' | 'warn' | 'err';

function getLevel(entry: LogEntry): Level {
  const code = Number(entry.statusCode);
  if (code >= 500) return 'err';
  if (code >= 400) return 'warn';
  return 'ok';
}

const LEVEL_COLOR: Record<Level, string> = {
  ok:   'var(--c-green)',
  warn: 'var(--c-amber)',
  err:  'var(--c-red)',
};

export function ActivityFeed({ entries }: ActivityFeedProps) {
  const t    = useTranslations('dashboard');
  const list = entries;

  function relativeTime(ts: string): string {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60)   return t('secondsAgo', { n: Math.floor(diff) });
    if (diff < 3600) return t('minutesAgo', { n: Math.floor(diff / 60) });
    return t('hoursAgo', { n: Math.floor(diff / 3600) });
  }

  function describe(entry: LogEntry): { msg: string; meta: string } {
    const code = Number(entry.statusCode);
    if (code === 429 && entry.modelRequested) {
      return {
        msg:  t('activityQuotaExceeded', { model: entry.modelRequested }),
        meta: t('activityQuotaMeta', { app: entry.apiKeyApp || '' }),
      };
    }
    if (entry.cacheStatus === 'HIT') {
      return {
        msg:  t('activityCacheHit', { model: entry.modelResolved || '' }),
        meta: t('activityCacheMeta', {
          app: entry.apiKeyApp || '',
          score: parseFloat(entry.cacheScore || '0').toFixed(4),
          tokens: entry.totalTokens || 0,
        }),
      };
    }
    return {
      msg:  t('activityCompleted', { model: entry.modelResolved || entry.modelRequested || '' }),
      meta: t('activityCompletedMeta', {
        app: entry.apiKeyApp || '',
        tokens: entry.totalTokens || 0,
        effective: entry.effectiveTokens || 0,
        code,
      }),
    };
  }

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
    >
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--c-border-dim)' }}
      >
        <span className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>
          {t('activityTitle')}
        </span>
        <a
          href="/logs"
          className="text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)', letterSpacing: '0.05em' }}
        >
          {t('activityViewAllLogs')}
        </a>
      </div>

      {list.length === 0 && (
        <div className="px-5 py-10 text-center text-[12px]" style={{ color: 'var(--c-txt-3)', fontFamily: 'IBM Plex Mono, monospace' }}>
          {t('activityNoEntries')}
        </div>
      )}

      {list.slice(0, 8).map((entry, i) => {
        const level = getLevel(entry);
        const { msg, meta } = describe(entry);
        return (
          <div
            key={entry.requestId || i}
            className="flex gap-3 px-5 py-2.5"
            style={{ borderBottom: '1px solid var(--c-border-dim)' }}
          >
            <div
              className="text-[10px] pt-0.5 flex-shrink-0 w-12 text-right"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}
            >
              {relativeTime(entry.timestamp)}
            </div>

            <div className="relative flex-shrink-0 flex flex-col items-center">
              <span
                className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                style={{ background: LEVEL_COLOR[level] }}
              />
              {i < list.slice(0, 8).length - 1 && (
                <span
                  className="flex-1 w-px mt-1"
                  style={{ background: 'var(--c-border-dim)' }}
                />
              )}
            </div>

            <div className="flex-1 min-w-0 pb-2">
              <div className="text-[12px]" style={{ color: 'var(--c-txt-2)', lineHeight: 1.5 }}>
                {msg}
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}
              >
                {meta}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
