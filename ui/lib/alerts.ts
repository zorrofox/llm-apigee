/**
 * Cloud Monitoring 告警策略管理
 * - 列出本网关相关策略（userLabels.service=llm-gateway OR displayName 含 "LLM Gateway"）
 * - 首次发现无标签旧策略时自动补打 service=llm-gateway 标签
 * - 查询当前指标值以近似判断告警状态
 */
import { GoogleAuth } from 'google-auth-library';
export { ALERT_TEMPLATES } from './alert-templates';
import type { AlertTemplate } from './alert-templates';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
const BASE    = `https://monitoring.googleapis.com/v3/projects/${PROJECT}`;
const auth    = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getToken() {
  const client = await auth.getClient();
  return (await client.getAccessToken()).token!;
}

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type { AlertSeverity, AlertCategory } from './alert-templates';
import type { AlertSeverity, AlertCategory } from './alert-templates';
export type AlertStatus    = 'ok' | 'approaching' | 'firing' | 'unknown';

export interface AlertCondition {
  name:           string;
  displayName:    string;
  conditionType:  'threshold' | 'absent' | 'ratio' | 'mql' | 'unknown';
  filter?:        string;
  comparison?:    string;  // COMPARISON_GT | COMPARISON_LT
  thresholdValue?: number;
  duration?:      string;  // e.g. "300s"
  aligner?:       string;  // ALIGN_RATE | ALIGN_MEAN | etc.
}

export interface AlertPolicy {
  name:                 string;   // projects/{project}/alertPolicies/{id}
  id:                   string;   // numeric ID
  displayName:          string;
  enabled:              boolean;
  severity:             AlertSeverity;
  category:             AlertCategory;
  conditions:           AlertCondition[];
  notificationChannels: string[];
  userLabels:           Record<string, string>;
  autoClose:            string;   // e.g. "1800s"
  // 运行时计算
  currentValue?:        number | null;
  status:               AlertStatus;
}

export interface NotificationChannel {
  name:        string;
  id:          string;
  type:        string;  // email | pagerduty | slack
  displayName: string;
  enabled:     boolean;
}

// ── API 工具 ──────────────────────────────────────────────────────────────────

async function monGet(path: string) {
  const token = await getToken();
  const res   = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Monitoring API 错误 ${res.status}: ${path}`);
  return res.json();
}

async function monPatch(path: string, body: unknown, updateMask: string) {
  const token = await getToken();
  const url   = `${BASE}${path}?updateMask=${updateMask}`;
  const res   = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Monitoring PATCH 错误 ${res.status}: ${err}`);
  }
  return res.json();
}

async function monPost(path: string, body: unknown) {
  const token = await getToken();
  const res   = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Monitoring POST 错误 ${res.status}: ${err}`);
  }
  return res.json();
}

async function monDelete(path: string) {
  const token = await getToken();
  const res   = await fetch(`${BASE}${path}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Monitoring DELETE 错误 ${res.status}: ${path}`);
}

// ── 策略解析 ──────────────────────────────────────────────────────────────────

function parsePolicy(raw: Record<string, unknown>): AlertPolicy {
  const labels = (raw.userLabels ?? {}) as Record<string, string>;
  const conditions = ((raw.conditions ?? []) as Record<string, unknown>[]).map(c => {
    const ct  = (c.conditionThreshold ?? {}) as Record<string, unknown>;
    const ca  = (c.conditionAbsent    ?? {}) as Record<string, unknown>;
    const mql = (c.conditionMonitoringQueryLanguage ?? {}) as Record<string, unknown>;

    const hasThreshold = Object.keys(ct).length > 0;
    const hasAbsent    = Object.keys(ca).length > 0;
    const hasMql       = Object.keys(mql).length > 0;

    const src  = hasThreshold ? ct : hasAbsent ? ca : {};
    const type = hasThreshold ? 'threshold' : hasAbsent ? 'absent' : hasMql ? 'mql' : 'unknown';

    return {
      name:           String(c.name ?? ''),
      displayName:    String(c.displayName ?? ''),
      conditionType:  type,
      filter:         src.filter as string | undefined,
      comparison:     ct.comparison as string | undefined,
      thresholdValue: ct.thresholdValue !== undefined ? Number(ct.thresholdValue) : undefined,
      duration:       (src.duration ?? ct.duration) as string | undefined,
      aligner:        ((src.aggregations as Record<string, unknown>[])?.[0]?.perSeriesAligner ?? ct.trigger) as string | undefined,
    } as AlertCondition;
  });

  return {
    name:                 String(raw.name ?? ''),
    id:                   String(raw.name ?? '').split('/').pop() ?? '',
    displayName:          String(raw.displayName ?? ''),
    enabled:              raw.enabled !== false,
    severity:             (labels.severity as AlertSeverity) ?? 'warning',
    category:             (labels.category as AlertCategory) ?? 'performance',
    conditions,
    notificationChannels: (raw.notificationChannels ?? []) as string[],
    userLabels:           labels,
    autoClose:            String((raw.alertStrategy as Record<string, unknown>)?.autoClose ?? '1800s'),
    status:               'unknown',
  };
}

// ── 查询当前指标值 ─────────────────────────────────────────────────────────────

async function getCurrentValue(condition: AlertCondition): Promise<number | null> {
  if (!condition.filter) return null;
  // absent 条件用 30 分钟窗口 + ALIGN_SUM，threshold 条件用 1 小时窗口
  const windowMs = condition.conditionType === 'absent' ? 30 * 60 * 1000 : 60 * 60 * 1000;
  const end   = new Date();
  const start = new Date(end.getTime() - windowMs);
  const aligner = condition.conditionType === 'absent' ? 'ALIGN_SUM' : (condition.aligner ?? 'ALIGN_RATE');
  const params  = new URLSearchParams({
    filter:                             condition.filter,
    'interval.startTime':               start.toISOString(),
    'interval.endTime':                 end.toISOString(),
    'aggregation.alignmentPeriod':      '300s',
    'aggregation.perSeriesAligner':     aligner,
    'aggregation.crossSeriesReducer':   'REDUCE_SUM',
  });
  try {
    const data   = await monGet(`/timeSeries?${params}`);
    const series = data.timeSeries?.[0];
    if (!series?.points?.length) return null;
    const v = series.points[0].value;
    return Number(v.doubleValue ?? v.int64Value ?? 0);
  } catch {
    return null;
  }
}

function calcStatus(policy: AlertPolicy, currentValue: number | null): AlertStatus {
  if (currentValue === null) return 'unknown';
  const cond = policy.conditions[0];
  if (!cond?.thresholdValue || !cond.comparison) return 'unknown';

  const threshold = cond.thresholdValue;
  const isGt      = cond.comparison === 'COMPARISON_GT';

  if (isGt) {
    if (currentValue >= threshold) return 'firing';
    if (currentValue >= threshold * 0.7) return 'approaching';
    return 'ok';
  } else {
    // COMPARISON_LT：value < threshold 才告警
    if (currentValue <= threshold) return 'firing';
    if (currentValue <= threshold * 1.3) return 'approaching';
    return 'ok';
  }
}

// ── 自动补打标签（方案 A）────────────────────────────────────────────────────

async function autoLabelPolicy(policy: AlertPolicy): Promise<void> {
  if (policy.userLabels['service'] === 'llm-gateway') return; // 已有标签
  const newLabels = {
    ...policy.userLabels,
    service: 'llm-gateway',
    // 从 displayName 推断 severity
    severity: policy.displayName.toLowerCase().includes('error') ? 'critical'
            : policy.displayName.toLowerCase().includes('cache')  ? 'info'
            : 'warning',
    category: policy.displayName.toLowerCase().includes('cache') ? 'cache' : 'performance',
  };
  await monPatch(
    `/${policy.name}`,
    { userLabels: newLabels },
    'userLabels',
  );
}

// ── 主要导出函数 ──────────────────────────────────────────────────────────────

/** 列出所有本网关相关告警策略，自动补打标签，并查询当前指标值 */
export async function listAlertPolicies(): Promise<AlertPolicy[]> {
  const data = await monGet('/alertPolicies');
  const raw  = (data.alertPolicies ?? []) as Record<string, unknown>[];

  // 筛选：已有 service=llm-gateway 标签，或 displayName 含 "LLM Gateway"
  const relevant = raw.filter(p => {
    const labels = (p.userLabels ?? {}) as Record<string, string>;
    return labels.service === 'llm-gateway' ||
           String(p.displayName ?? '').includes('LLM Gateway');
  });

  const policies = relevant.map(parsePolicy);

  // 自动补打标签（方案 A），并发执行，失败不中断
  await Promise.allSettled(policies.map(autoLabelPolicy));

  // 并发查询当前指标值
  const enriched = await Promise.all(policies.map(async p => {
    const cond         = p.conditions[0];
    const currentValue = await getCurrentValue(cond).catch(() => null);
    return { ...p, currentValue, status: calcStatus(p, currentValue) };
  }));

  return enriched.sort((a, b) => {
    const ORDER = { critical: 0, warning: 1, info: 2 };
    return (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3);
  });
}

/** 列出通知渠道 */
export async function listNotificationChannels(): Promise<NotificationChannel[]> {
  const data = await monGet('/notificationChannels');
  return ((data.notificationChannels ?? []) as Record<string, unknown>[]).map(c => ({
    name:        String(c.name ?? ''),
    id:          String(c.name ?? '').split('/').pop() ?? '',
    type:        String(c.type ?? ''),
    displayName: String(c.displayName ?? ''),
    enabled:     c.enabled !== false,
  }));
}

/** 启用/禁用告警策略 */
export async function setAlertEnabled(policyName: string, enabled: boolean): Promise<void> {
  await monPatch(`/${policyName}`, { enabled }, 'enabled');
}

/** 更新告警阈值 */
export async function updateAlertThreshold(policyName: string, conditionName: string, newThreshold: number): Promise<void> {
  const policy = await monGet(`/${policyName}`);
  const conds  = (policy.conditions ?? []) as Record<string, unknown>[];
  const updated = conds.map(c => {
    if (c.name !== conditionName) return c;
    const ct = { ...(c.conditionThreshold as Record<string, unknown> ?? {}), thresholdValue: newThreshold };
    return { ...c, conditionThreshold: ct };
  });
  await monPatch(`/${policyName}`, { conditions: updated }, 'conditions');
}

/** 删除告警策略 */
export async function deleteAlertPolicy(policyName: string): Promise<void> {
  await monDelete(`/${policyName}`);
}

// ── 创建告警策略（模板）────────────────────────────────────────────────────────

export type { AlertTemplate } from './alert-templates';

// ── 创建告警策略（模板）────────────────────────────────────────────────────────


/** 从模板创建告警策略 */
export async function createAlertPolicy(
  template:    AlertTemplate,
  threshold:   number,
  channelIds:  string[],
): Promise<AlertPolicy> {
  const body = {
    displayName: template.displayName,
    enabled:     true,
    userLabels: {
      service:  'llm-gateway',
      severity: template.severity,
      category: template.category,
    },
    conditions: [{
      displayName: template.conditionName,
      conditionThreshold: {
        filter:      template.filter,
        comparison:  template.comparison,
        thresholdValue: threshold,
        duration:    template.duration,
        aggregations: [{
          alignmentPeriod:   '60s',
          perSeriesAligner:  template.aligner,
          crossSeriesReducer:'REDUCE_SUM',
        }],
      },
    }],
    notificationChannels: channelIds.map(id => `projects/${PROJECT}/notificationChannels/${id}`),
    alertStrategy: { autoClose: '1800s' },
    combiner: 'OR',
  };
  const raw = await monPost('/alertPolicies', body);
  return parsePolicy(raw as Record<string, unknown>);
}
