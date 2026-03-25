/**
 * 告警策略模板（客户端安全，无服务端依赖）
 */
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertCategory  = 'performance' | 'cost' | 'cache' | 'availability';

export interface AlertTemplate {
  displayName:    string;
  severity:       AlertSeverity;
  category:       AlertCategory;
  conditionName:  string;
  filter:         string;
  comparison:     'COMPARISON_GT' | 'COMPARISON_LT';
  threshold:      number;
  thresholdUnit:  string;
  duration:       string;
  aligner:        string;
  description:    string;
}

export const ALERT_TEMPLATES: AlertTemplate[] = [
  {
    displayName:   'LLM Gateway - 高错误率',
    severity:      'critical',
    category:      'performance',
    conditionName: '错误率超过阈值',
    filter:        `metric.type="logging.googleapis.com/user/llm_error_count" resource.type="global"`,
    comparison:    'COMPARISON_GT',
    threshold:     0.05,
    thresholdUnit: '/s（5% ≈ 0.05/s）',
    duration:      '300s',
    aligner:       'ALIGN_RATE',
    description:   '错误率持续 5 分钟超过阈值时触发',
  },
  {
    displayName:   'LLM Gateway - 高请求量',
    severity:      'warning',
    category:      'performance',
    conditionName: '请求速率超过阈值',
    filter:        `metric.type="logging.googleapis.com/user/llm_request_count" resource.type="global"`,
    comparison:    'COMPARISON_GT',
    threshold:     8.33,
    thresholdUnit: '/s（500rpm ≈ 8.33/s）',
    duration:      '120s',
    aligner:       'ALIGN_RATE',
    description:   '请求量持续 2 分钟超过阈值时触发',
  },
  {
    displayName:   'LLM Gateway - Token 用量激增',
    severity:      'warning',
    category:      'cost',
    conditionName: 'Token 用量速率超过阈值',
    filter:        `metric.type="logging.googleapis.com/user/llm_token_usage" resource.type="global"`,
    comparison:    'COMPARISON_GT',
    threshold:     100,
    thresholdUnit: '次/min（有效请求）',
    duration:      '300s',
    aligner:       'ALIGN_RATE',
    description:   'Token 使用量持续 5 分钟异常增长时触发',
  },
  {
    displayName:   'LLM Gateway - 低缓存命中率',
    severity:      'info',
    category:      'cache',
    conditionName: '请求量异常告警占位',
    filter:        `metric.type="logging.googleapis.com/user/llm_request_count" resource.type="global"`,
    comparison:    'COMPARISON_GT',
    threshold:     8.33,
    thresholdUnit: '（当前版本为请求量兜底）',
    duration:      '300s',
    aligner:       'ALIGN_RATE',
    description:   '注：缓存命中率比例告警需额外配置，当前用请求量占位',
  },
];
