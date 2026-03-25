/**
 * Cloud Logging API 客户端
 * 读取 llm-gateway-requests 日志
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const BASE    = 'https://logging.googleapis.com/v2';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/logging.read'],
});

export interface LogEntry {
  requestId:        string;
  timestamp:        string;
  statusCode:       string;
  modelRequested:   string;
  modelResolved:    string;
  publisher:        string;
  backend:          string;
  cacheStatus:      string;
  cacheScore:       string;
  promptTokens:     string;
  completionTokens: string;
  totalTokens:      string;
  effectiveTokens:  string;
  tokenWeight:      string;
  totalLatencyMs:   string;
  targetLatencyMs:  string;
  apiKeyApp:        string;
  apiKeyDeveloper:  string;
  clientIp:         string;
}

export interface LogFilter {
  model?:       string;  // modelResolved
  app?:         string;  // apiKeyApp
  statusCode?:  string;  // 200 / 4xx / 5xx
  cacheStatus?: string;  // HIT / MISS
  since?:       string;  // ISO 时间戳，起始时间
}

export interface LogPage {
  entries:       LogEntry[];
  nextPageToken: string | null;
}

/** 将筛选条件转为 Cloud Logging filter 字符串 */
function buildFilter(f: LogFilter, extra = ''): string {
  const parts = [`logName="projects/${PROJECT}/logs/llm-gateway-requests"`];

  if (f.model)
    parts.push(`jsonPayload.modelResolved="${f.model}"`);
  if (f.app)
    parts.push(`jsonPayload.apiKeyApp="${f.app}"`);
  if (f.statusCode) {
    if (f.statusCode === '2xx')      parts.push('jsonPayload.statusCode>="200" AND jsonPayload.statusCode<"300"');
    else if (f.statusCode === '4xx') parts.push('jsonPayload.statusCode>="400" AND jsonPayload.statusCode<"500"');
    else if (f.statusCode === '5xx') parts.push('jsonPayload.statusCode>="500"');
    else                             parts.push(`jsonPayload.statusCode="${f.statusCode}"`);
  }
  if (f.cacheStatus)
    parts.push(`jsonPayload.cacheStatus="${f.cacheStatus}"`);
  if (f.since)
    parts.push(`timestamp>="${f.since}"`);
  if (extra) parts.push(extra);

  return parts.join(' AND ');
}

/** 查询日志（支持过滤和分页） */
export async function queryLogs(
  filter: LogFilter = {},
  pageSize = 50,
  pageToken?: string,
): Promise<LogPage> {
  const client = await auth.getClient();
  const token  = await client.getAccessToken();

  const body: Record<string, unknown> = {
    resourceNames: [`projects/${PROJECT}`],
    filter:   buildFilter(filter),
    orderBy:  'timestamp desc',
    pageSize,
  };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetch(`${BASE}/entries:list`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Cloud Logging 查询失败: ${res.status}`);
  const data = await res.json();

  const entries = (data.entries ?? []).map(
    (e: { jsonPayload: Record<string, string>; timestamp: string }) => ({
      ...(e.jsonPayload ?? {}),
      timestamp: e.timestamp,
    })
  ) as LogEntry[];

  return { entries, nextPageToken: data.nextPageToken ?? null };
}

/** 查询最近 N 条请求日志（简化接口，向后兼容） */
export async function listRecentLogs(limit = 50, extra = ''): Promise<LogEntry[]> {
  const { entries } = await queryLogs({ since: extra.match(/timestamp>="([^"]+)"/)?.[1] }, limit);
  // 若 extra 包含非时间过滤条件，走完整路径
  if (extra && !extra.startsWith('jsonPayload.effectiveTokens') && !extra.startsWith('timestamp')) {
    const client = await auth.getClient();
    const token  = await client.getAccessToken();
    const filterStr = [
      `logName="projects/${PROJECT}/logs/llm-gateway-requests"`,
      extra,
    ].filter(Boolean).join(' AND ');
    const res = await fetch(`${BASE}/entries:list`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceNames: [`projects/${PROJECT}`], filter: filterStr, orderBy: 'timestamp desc', pageSize: limit }),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.entries ?? []).map((e: { jsonPayload: Record<string, string>; timestamp: string }) => ({ ...(e.jsonPayload ?? {}), timestamp: e.timestamp })) as LogEntry[];
  }
  return entries;
}

/** 获取日志中出现过的 App 名称列表（用于筛选器下拉） */
export async function getLogApps(): Promise<string[]> {
  const { entries } = await queryLogs({}, 200);
  const apps = new Set(entries.map(e => e.apiKeyApp).filter(Boolean));
  return Array.from(apps).sort();
}

/** 获取日志中出现过的模型名称列表 */
export async function getLogModels(): Promise<string[]> {
  const { entries } = await queryLogs({}, 200);
  const models = new Set(entries.map(e => e.modelResolved).filter(Boolean));
  return Array.from(models).sort();
}
