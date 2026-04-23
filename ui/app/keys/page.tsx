/**
 * P1 API Keys management page
 */
import { getTranslations } from 'next-intl/server';
import { Topbar }    from '@/components/layout/Topbar';
import { KeyTable }  from '@/components/keys/KeyTable';
import { listAllApps } from '@/lib/apigee';
import type { ApiApp } from '@/lib/apigee';

export const dynamic   = 'force-dynamic';
export const revalidate = 0;

export default async function KeysPage() {
  const t = await getTranslations('keys');
  let apps: ApiApp[] = [];
  try {
    apps = await listAllApps();
  } catch {
    apps = MOCK_APPS;
  }

  return (
    <>
      <Topbar
        title={t('title')}
        parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''}
        alertCount={0}
        gatewayLive
      />
      <div className="p-7">
        <KeyTable apps={apps} />
      </div>
    </>
  );
}

/** 本地开发 Mock 数据 */
const MOCK_APPS: ApiApp[] = [
  {
    appId: 'app-001',
    name: 'llm-gateway-demo',
    developerId: 'dev-001',
    developerEmail: 'demo@llm-gateway.internal',
    status: 'approved',
    credentials: [{
      consumerKey: 'K5Y6bsKAgxG70oViKsZV5SiJQyNe4qaeKcIjCwBMmLH7k8lU',
      consumerSecret: '***',
      status: 'approved',
      expiresAt: '-1',
      apiProducts: [{ apiproduct: 'llm-gateway-product', status: 'approved' }],
    }],
    attributes: [
      { name: 'developer.token.quota.limit',    value: '1000000' },
      { name: 'developer.token.quota.interval', value: '1' },
      { name: 'developer.token.quota.timeunit', value: 'hour' },
    ],
    createdAt: String(Date.now() - 7 * 86400000),
    lastModifiedAt: String(Date.now() - 86400000),
  },
  {
    appId: 'app-002',
    name: 'prod-app-01',
    developerId: 'dev-002',
    developerEmail: 'prod@company.com',
    status: 'approved',
    credentials: [{
      consumerKey: 'Xp3mNqRT8fKzLvP2jQ9wYbDsHcAiUeNm4rG6tEoW1xVk7yBZ',
      consumerSecret: '***',
      status: 'approved',
      expiresAt: '-1',
      apiProducts: [{ apiproduct: 'llm-gateway-product', status: 'approved' }],
    }],
    attributes: [
      { name: 'developer.token.quota.limit',    value: '5000000' },
      { name: 'developer.token.quota.interval', value: '1' },
      { name: 'developer.token.quota.timeunit', value: 'hour' },
    ],
    createdAt: String(Date.now() - 30 * 86400000),
    lastModifiedAt: String(Date.now() - 3600000),
  },
  {
    appId: 'app-003',
    name: 'dev-sandbox',
    developerId: 'dev-003',
    developerEmail: 'dev@company.com',
    status: 'approved',
    credentials: [{
      consumerKey: 'Bn7kLmPQ3sRvTdWxYzCeJfGhNiOqUaKbMcFpElDgHjIoSt2u',
      consumerSecret: '***',
      status: 'approved',
      expiresAt: '-1',
      apiProducts: [{ apiproduct: 'llm-gateway-product', status: 'approved' }],
    }],
    attributes: [
      { name: 'developer.token.quota.limit',    value: '100000' },
      { name: 'developer.token.quota.interval', value: '1' },
      { name: 'developer.token.quota.timeunit', value: 'hour' },
    ],
    createdAt: String(Date.now() - 14 * 86400000),
    lastModifiedAt: String(Date.now() - 7200000),
  },
];
