/**
 * 告警策略页面
 * Server Component — 读取 Cloud Monitoring 策略和通知渠道
 */
import { Suspense }          from 'react';
import { Topbar }            from '@/components/layout/Topbar';
import { AlertsList }        from '@/components/alerts/AlertsList';
import { listAlertPolicies, listNotificationChannels } from '@/lib/alerts';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

export default async function AlertsPage() {
  const [policies, channels] = await Promise.allSettled([
    listAlertPolicies(),
    listNotificationChannels(),
  ]);

  const policyList  = policies.status  === 'fulfilled' ? policies.value  : [];
  const channelList = channels.status  === 'fulfilled' ? channels.value  : [];
  const loadError   = policies.status  === 'rejected'  ? String(policies.reason) : '';

  return (
    <>
      <Topbar title="告警" parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} gatewayLive />
      <div className="p-7 space-y-4">
        {loadError && (
          <div className="px-4 py-3 rounded-md text-[11px]"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            加载失败：{loadError}
          </div>
        )}
        <Suspense fallback={<div style={{ color: 'var(--c-txt-3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }}>加载中…</div>}>
          <AlertsList policies={policyList} channels={channelList} />
        </Suspense>
      </div>
    </>
  );
}
