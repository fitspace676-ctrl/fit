'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { locales, type Locale } from '@fit/i18n';
import { LOCALE_COOKIE } from '@/i18n/locale-cookie';
import css from './onboarding.module.css';

type Step = {
  id: string;
  title: string;
  subtitle: string;
  current: boolean;
  done: boolean;
  disabled: boolean;
  onClick: () => void;
};

export function StateIcon({ kind }: { kind: 'clock' | 'link' | 'check' | 'mail' }) {
  return (
    <span className={css.stateIcon} data-kind={kind} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === 'clock' ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </>
        ) : kind === 'check' ? (
          <path d="m5 12 4 4L19 6" />
        ) : kind === 'mail' ? (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 6 9 7 9-7" />
          </>
        ) : (
          <>
            <path d="m10 13 4-4 M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />
          </>
        )}
      </svg>
    </span>
  );
}

export function OnboardingShell({ children, steps }: { children: ReactNode; steps: Step[] }) {
  const t = useTranslations('admin.onboarding');
  const language = useTranslations('admin.common.language');
  const locale = useLocale();
  const router = useRouter();
  // Same cookie + refresh mechanism as the console LocaleSwitcher; local markup
  // keeps the artboard's pill visible on phones and uses its Georgian label.
  function select(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    router.refresh();
  }
  return (
    <main className={css.page}>
      <aside className={css.aside}>
        <div className={css.logo} aria-label="FormaCore">
          <svg width="40" height="40" viewBox="0 0 320 320" aria-hidden="true">
            <defs>
              <linearGradient id="onboarding-logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4A8AA5" />
                <stop offset=".45" stopColor="#2F7896" />
                <stop offset="1" stopColor="#1F4A72" />
              </linearGradient>
            </defs>
            <rect width="320" height="320" rx="72" fill="url(#onboarding-logo)" />
            <g transform="translate(59 65) scale(.2552)" fill="#F7F7F6">
              <polygon points="207,0 791,0 653,185 314,185 237,297 0,299" />
              <polygon points="237,297 717,297 592,455 387,455 187,742 72,538" />
            </g>
          </svg>
          <div>
            <span>
              <b>Forma</b>
              <span>Core</span>
            </span>
            <small>MANAGEMENT PLATFORM</small>
          </div>
        </div>
        {steps.length > 0 && (
          <nav className={css.progress} aria-label={t('progressLabel')}>
            <ol>
              {steps.map((step, i) => (
                <li key={step.id} data-current={step.current} data-done={step.done}>
                  <button
                    type="button"
                    aria-label={`${step.title}${step.done ? ` · ${t('done')}` : ''}`}
                    aria-current={step.current ? 'step' : undefined}
                    disabled={step.disabled}
                    onClick={step.onClick}
                  >
                    <span className={css.number} aria-hidden="true">
                      {step.done && !step.current ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className={css.stepCopy}>
                      <strong>{step.title}</strong>
                      <span>{step.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <p className={css.asideNote}>{t('resumeHint')}</p>
      </aside>
      <section className={css.right}>
        <div className={css.language} role="group" aria-label={language('label')}>
          {locales.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === locale}
              onClick={() => select(value)}
            >
              {value === 'ka' ? 'ქარ' : 'EN'}
            </button>
          ))}
        </div>
        <div className={css.body} data-state={steps.length === 0}>
          <header className={css.header}>
            <h1>{t('title')}</h1>
            <p>{t('subtitle')}</p>
          </header>
          {children}
          <p className={css.footer}>{t('footer')}</p>
        </div>
      </section>
    </main>
  );
}
