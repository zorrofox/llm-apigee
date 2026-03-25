import type { Metadata }           from 'next';
import { headers }                  from 'next/headers';
import { Syne, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { Sidebar }                  from '@/components/layout/Sidebar';
import { getIAPUser }               from '@/lib/auth';
import { GoogleAuth }               from 'google-auth-library';

/* ── 字体（next/font 优化加载，消除 CLS） */
const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-syne',
});
const ibmMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-mono',
});
const ibmSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-sans',
});

export const metadata: Metadata = {
  title: 'LLM Gateway — 管理控制台',
  description: 'Apigee LLM 网关管理控制台',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 从 IAP header 读取已认证用户（Server Component）
  const hdrs      = await headers();
  const userEmail = getIAPUser(hdrs) ?? 'dev@localhost';

  // 快速获取告警策略数量（仅读列表，不查指标值，避免影响页面加载速度）
  let alertCount = 0;
  try {
    const auth    = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client  = await auth.getClient();
    const token   = (await client.getAccessToken()).token!;
    const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
    const res     = await fetch(
      `https://monitoring.googleapis.com/v3/projects/${PROJECT}/alertPolicies?pageSize=50`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (res.ok) {
      const data = await res.json();
      const all  = (data.alertPolicies ?? []) as Array<Record<string, unknown>>;
      // 只计入与本网关相关的已启用策略
      alertCount = all.filter(p => {
        const labels = (p.userLabels ?? {}) as Record<string, string>;
        const name   = String(p.displayName ?? '');
        return (labels.service === 'llm-gateway' || name.includes('LLM Gateway')) && p.enabled !== false;
      }).length;
    }
  } catch { /* 失败时不影响页面渲染 */ }

  return (
    <html lang="zh-CN" className={`${syne.variable} ${ibmMono.variable} ${ibmSans.variable}`}>
      <body className="antialiased" style={{ fontFamily: 'var(--font-ibm-sans), IBM Plex Sans, sans-serif' }}>
        <div className="flex min-h-screen">
          <Sidebar userEmail={userEmail} alertCount={alertCount} />
          <main className="flex-1 flex flex-col min-w-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
