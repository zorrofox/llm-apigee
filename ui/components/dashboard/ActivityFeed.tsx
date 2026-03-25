/** 近期活动日志流 */
import type { LogEntry } from '@/lib/logging';

interface ActivityFeedProps {
  entries: LogEntry[];
}

/** 格式化相对时间 */
function relativeTime(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  return `${Math.floor(diff / 3600)}小时前`;
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

/** 生成活动描述 */
function describe(entry: LogEntry): { msg: string; meta: string } {
  const code = Number(entry.statusCode);
  if (code === 429 && entry.modelRequested) {
    return {
      msg:  `Token 配额超限 · ${entry.modelRequested}`,
      meta: `${entry.apiKeyApp} · 429`,
    };
  }
  if (entry.cacheStatus === 'HIT') {
    return {
      msg:  `缓存命中 · ${entry.modelResolved}`,
      meta: `${entry.apiKeyApp} · 相似度 ${parseFloat(entry.cacheScore || '0').toFixed(4)} · ${entry.totalTokens || 0} tokens`,
    };
  }
  return {
    msg:  `请求完成 · ${entry.modelResolved || entry.modelRequested}`,
    meta: `${entry.apiKeyApp} · ${entry.totalTokens || 0} tokens (有效 ${entry.effectiveTokens || 0}) · ${code}`,
  };
}

export function ActivityFeed({ entries }: ActivityFeedProps) {
  const list = entries;

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
    >
      {/* 标题 */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--c-border-dim)' }}
      >
        <span className="text-[13px] font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>
          近期活动
        </span>
        <a
          href="/logs"
          className="text-[10px]"
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-blue)', letterSpacing: '0.05em' }}
        >
          查看全部日志 →
        </a>
      </div>

      {/* 空状态 */}
      {list.length === 0 && (
        <div className="px-5 py-10 text-center text-[12px]" style={{ color: 'var(--c-txt-3)', fontFamily: 'IBM Plex Mono, monospace' }}>
          暂无活动记录
        </div>
      )}

      {/* 活动条目 */}
      {list.slice(0, 8).map((entry, i) => {
        const level = getLevel(entry);
        const { msg, meta } = describe(entry);
        return (
          <div
            key={entry.requestId || i}
            className="flex gap-3 px-5 py-2.5"
            style={{ borderBottom: '1px solid var(--c-border-dim)' }}
          >
            {/* 时间 */}
            <div
              className="text-[10px] pt-0.5 flex-shrink-0 w-12 text-right"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-txt-3)' }}
            >
              {relativeTime(entry.timestamp)}
            </div>

            {/* 竖线 + 状态点 */}
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

            {/* 内容 */}
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
