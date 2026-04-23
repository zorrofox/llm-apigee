/**
 * Alert policies page
 * Server Component — reads Cloud Monitoring policies and notification channels
 */
import { Suspense }          from 'react';
import { getTranslations }   from 'next-intl/server';
import { Topbar }            from '@/components/layout/Topbar';
import { AlertsList }        from '@/components/alerts/AlertsList';
import { listAlertPolicies, listNotificationChannels } from '@/lib/alerts';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

export default async function AlertsPage() {
  const t = await getTranslations('alerts');
  const [policies, channels] = await Promise.allSettled([
    listAlertPolicies(),
    listNotificationChannels(),
  ]);

  const policyList  = policies.status  === 'fulfilled' ? policies.value  : [];
  const channelList = channels.status  === 'fulfilled' ? channels.value  : [];
  const loadError   = policies.status  === 'rejected'  ? String(policies.reason) : '';

  return (
    <>
      <Topbar title={t('title')} parent={process.env.GOOGLE_CLOUD_PROJECT ?? ''} gatewayLive />
      <div className="p-7 space-y-4">
        {loadError && (
          <div className="px-4 py-3 rounded-md text-[11px]"
            style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-red)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
            {t('loadFailed', { err: loadError })}
          </div>
        )}
        <Suspense fallback={<div style={{ color: 'var(--c-txt-3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }}>{t('loading')}</div>}>
          <AlertsList policies={policyList} channels={channelList} />
        </Suspense>
      </div>
    </>
  );
}
