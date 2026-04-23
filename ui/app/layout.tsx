import type { Metadata }           from 'next';
import { headers }                  from 'next/headers';
import { NextIntlClientProvider }   from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { Syne, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { Sidebar }                  from '@/components/layout/Sidebar';
import { getIAPUser }               from '@/lib/auth';
import { GoogleAuth }               from 'google-auth-library';

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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale   = await getLocale();
  const messages = await getMessages();

  const hdrs      = await headers();
  const userEmail = getIAPUser(hdrs) ?? 'dev@localhost';

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
      alertCount = all.filter(p => {
        const labels = (p.userLabels ?? {}) as Record<string, string>;
        const name   = String(p.displayName ?? '');
        return (labels.service === 'llm-gateway' || name.includes('LLM Gateway')) && p.enabled !== false;
      }).length;
    }
  } catch { /* don't block page render on fetch failure */ }

  const htmlLang = locale === 'zh' ? 'zh-CN' : 'en';

  return (
    <html lang={htmlLang} className={`${syne.variable} ${ibmMono.variable} ${ibmSans.variable}`}>
      <body className="antialiased" style={{ fontFamily: 'var(--font-ibm-sans), IBM Plex Sans, sans-serif' }}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="flex min-h-screen">
            <Sidebar userEmail={userEmail} alertCount={alertCount} />
            <main className="flex-1 flex flex-col min-w-0">
              {children}
            </main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
