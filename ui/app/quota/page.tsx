/**
 * P1 配额配置页面（Server Component）
 */
import { Topbar }         from '@/components/layout/Topbar';
import { QuotaEditor }    from '@/components/quota/QuotaEditor';
import { listAllApps, getApiProduct } from '@/lib/apigee';
import { listRecentLogs } from '@/lib/logging';
import type { ApiApp }    from '@/lib/apigee';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const MOCK_APPS: ApiApp[] = [
  {
    appId: 'app-001', name: 'llm-gateway-demo', developerId: 'dev-001',
    developerEmail: 'demo@llm-gateway.internal', status: 'approved',
    credentials: [{ consumerKey: 'K5Y6bsKA···', consumerSecret: '', status: 'approved', expiresAt: '-1', apiProducts: [{ apiproduct: 'llm-gateway-product', status: 'approved' }] }],
    attributes: [{ name: 'token.quota.limit', value: '' }],
    createdAt: '', lastModifiedAt: '',
  },
];

/** 从 API Product 属性中提取配额配置，属性不存在时用默认值 */
function parseProductConfig(attrs: Array<{ name: string; value: string }>) {
  const get = (name: string) => attrs.find(a => a.name === name)?.value ?? '';
  return {
    reqQuota:   Number(get('developer.quota.limit')            || 1000),
    tokenQuota: Number(get('developer.token.quota.limit')      || 1_000_000),
    interval:          get('developer.quota.interval')         || '1',
    timeUnit:          get('developer.quota.timeunit')         || 'hour',
  };
}

/** 从 Cloud Logging 统计当前小时各 App 消耗的 effectiveTokens */
async function getAppTokenUsage(): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  try {
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const logs  = await listRecentLogs(500, `jsonPayload.effectiveTokens!="" timestamp>="${since}"`);
    for (const log of logs) {
      const app    = log.apiKeyApp;
      const tokens = Number(log.effectiveTokens || 0);
      if (app && tokens > 0) usage.set(app, (usage.get(app) ?? 0) + tokens);
    }
  } catch { /* 查询失败降级 */ }
  return usage;
}

export default async function QuotaPage() {
  const [apps, product, tokenUsage] = await Promise.all([
    listAllApps().catch(() => MOCK_APPS),
    getApiProduct('llm-gateway-product').catch(() => null),
    getAppTokenUsage(),
  ]);

  // 从 Apigee 读取真实的 Product 配置
  const productConfig = parseProductConfig(product?.attributes ?? []);

  return (
    <>
      <Topbar title="配额配置" parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} alertCount={0} gatewayLive />
      <div className="p-7 space-y-4">
        <QuotaEditor
          apps={apps}
          tokenUsage={Object.fromEntries(tokenUsage)}
          initialProductConfig={productConfig}
        />
      </div>
    </>
  );
}
