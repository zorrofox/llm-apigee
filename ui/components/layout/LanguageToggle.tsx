'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { setLocaleCookie } from '@/lib/locale-actions';

export function LanguageToggle() {
  const locale  = useLocale();
  const t       = useTranslations('topbar');
  const [pending, startTransition] = useTransition();

  function switchTo(next: 'en' | 'zh') {
    if (next === locale) return;
    startTransition(() => {
      setLocaleCookie(next);
    });
  }

  return (
    <div
      className="flex items-center text-[10px] rounded-sm overflow-hidden"
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        letterSpacing: '0.05em',
        border: '1px solid var(--c-border)',
        opacity: pending ? 0.5 : 1,
      }}
      role="group"
      aria-label={t('language')}
    >
      <button
        onClick={() => switchTo('en')}
        disabled={pending}
        className="px-2 py-1 transition-colors"
        style={{
          background: locale === 'en' ? 'rgba(0,232,122,0.08)' : 'transparent',
          color:      locale === 'en' ? 'var(--c-green)'      : 'var(--c-txt-2)',
        }}
      >
        {t('english')}
      </button>
      <button
        onClick={() => switchTo('zh')}
        disabled={pending}
        className="px-2 py-1 transition-colors"
        style={{
          background: locale === 'zh' ? 'rgba(0,232,122,0.08)' : 'transparent',
          color:      locale === 'zh' ? 'var(--c-green)'      : 'var(--c-txt-2)',
          borderLeft: '1px solid var(--c-border)',
        }}
      >
        {t('chinese')}
      </button>
    </div>
  );
}
