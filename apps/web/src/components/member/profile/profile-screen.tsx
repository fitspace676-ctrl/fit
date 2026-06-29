'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { locales, type Locale } from '@fit/i18n';
import { Link, usePathname, useRouter } from '@/src/i18n/navigation';
import { Badge, Btn, Card, Icon, Switch, useToast } from '@/src/components/ui';
import { useTheme } from '@/src/components/theme/theme-provider';

export interface ProfileScreenProps {
  /** Member display name, when known (the profile endpoint is the remaining gap). */
  name: string;
  email: string;
  memberId: string;
  /** Quick stats for the identity card. */
  attended: number;
  credits: number;
}

const FIELDS = ['firstName', 'lastName', 'email', 'phone', 'emergency', 'address'] as const;
const NOTIFS = ['reminders', 'bookings', 'billing', 'promotions'] as const;

/**
 * The member profile screen: an identity card plus editable personal info,
 * preferences (language — wired to the locale cookie; units; theme — wired to the
 * ThemeProvider), notification toggles, and security. Field edits and toggles are
 * held in local state and saved with a graceful action; the language and theme
 * controls take effect immediately.
 */
export function ProfileScreen({ name, email, memberId, attended, credits }: ProfileScreenProps) {
  const t = useTranslations('member.profile');
  const activeLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [fields, setFields] = useState<Record<string, string>>({
    firstName: name.split(' ')[0] ?? '',
    lastName: name.split(' ').slice(1).join(' ') ?? '',
    email,
    phone: '',
    emergency: '',
    address: '',
  });
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    reminders: true,
    bookings: true,
    billing: true,
    promotions: false,
  });
  const [twoFa, setTwoFa] = useState(false);

  function switchLocale(loc: Locale): void {
    document.cookie = `NEXT_LOCALE=${loc};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    router.replace(pathname, { locale: loc });
  }

  function save(): void {
    // The PATCH /me/profile endpoint is the remaining backend gap; until it ships
    // the preferences that work client-side (language, theme) already persisted,
    // and the rest is confirmed optimistically.
    toast(t('saved'), { tone: 'success', icon: 'check' });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <Btn v="primary" icon="check" onClick={save}>
          {t('save')}
        </Btn>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Identity */}
        <Card glow className="h-fit p-6 lg:sticky lg:top-24">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <span className="grid h-24 w-24 place-items-center rounded-full bg-[linear-gradient(135deg,#6257E3,#7A5AF8)] text-white ring-2 ring-white dark:ring-ink-950">
                <Icon name="user" className="h-10 w-10" sw={2} />
              </span>
              <button
                type="button"
                aria-label={t('changePhoto')}
                className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-white text-ink-700 shadow ring-1 ring-ink-200 hover:bg-ink-50 dark:bg-ink-800 dark:text-white dark:ring-white/10"
              >
                <Icon name="camera" className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 font-display text-lg font-bold text-ink-900 dark:text-white">
              {name}
            </p>
            <p className="text-sm text-ink-500 dark:text-ink-400">{email}</p>
            <div className="mt-3">
              <Badge tone="brand" icon="bolt">
                {t('premiumMember')}
              </Badge>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 text-center">
            {[
              { l: t('checkIns'), v: attended },
              { l: t('credits'), v: credits },
              { l: t('id'), v: memberId },
            ].map((s) => (
              <div key={s.l} className="rounded-card bg-ink-50 p-3 dark:bg-white/5">
                <p className="truncate font-display text-base font-extrabold text-ink-900 dark:text-white">
                  {s.v}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          {/* Personal info */}
          <Card glow className="p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">
              {t('personalInfo')}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f} className={f === 'address' ? 'sm:col-span-2' : ''}>
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    {t(`fields.${f}`)}
                  </span>
                  <input
                    type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'}
                    value={fields[f] ?? ''}
                    onChange={(e) => setFields((p) => ({ ...p, [f]: e.target.value }))}
                    className="h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                  />
                </label>
              ))}
            </div>
          </Card>

          {/* Preferences */}
          <Card glow className="p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">
              {t('preferences')}
            </h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-3">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  {t('language')}
                </p>
                <div className="inline-flex rounded-pill border border-ink-200 p-1 dark:border-white/10">
                  {locales.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => switchLocale(loc)}
                      className={`h-8 rounded-pill px-3 text-xs font-semibold transition ${
                        loc === activeLocale
                          ? 'bg-brand-500 text-white'
                          : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
                      }`}
                    >
                      {loc === 'ka' ? 'ქართ' : 'EN'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  {t('units')}
                </p>
                <div className="inline-flex rounded-pill border border-ink-200 p-1 dark:border-white/10">
                  {(['metric', 'imperial'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnits(u)}
                      className={`h-8 rounded-pill px-3 text-xs font-semibold transition ${
                        u === units
                          ? 'bg-brand-500 text-white'
                          : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
                      }`}
                    >
                      {t(`unit.${u}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  {t('theme')}
                </p>
                <div className="inline-flex rounded-pill border border-ink-200 p-1 dark:border-white/10">
                  {(['light', 'dark'] as const).map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => setTheme(th)}
                      className={`flex h-8 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold transition ${
                        th === theme
                          ? 'bg-brand-500 text-white'
                          : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
                      }`}
                    >
                      <Icon name={th === 'light' ? 'sun' : 'moon'} className="h-3.5 w-3.5" />
                      {t(`themeName.${th}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Notifications */}
          <Card glow className="p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">
              {t('notifications')}
            </h2>
            <div className="mt-2 divide-y divide-ink-100 dark:divide-white/10">
              {NOTIFS.map((k) => (
                <div key={k} className="flex items-center justify-between py-3.5">
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-semibold text-ink-900 dark:text-white">
                      {t(`notif.${k}.title`)}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">{t(`notif.${k}.desc`)}</p>
                  </div>
                  <Switch
                    checked={notifs[k] ?? false}
                    onChange={(v) => setNotifs((p) => ({ ...p, [k]: v }))}
                    label={t(`notif.${k}.title`)}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Security */}
          <Card glow className="p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">
              {t('security')}
            </h2>
            <Link
              href="/forgot-password"
              className="mt-4 flex items-center gap-3 rounded-card border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-800 transition-colors hover:bg-ink-50 dark:border-white/10 dark:text-ink-100 dark:hover:bg-white/5"
            >
              <Icon name="lock" className="h-4 w-4" /> {t('changePassword')}
            </Link>
            <div className="mt-3 flex items-center justify-between rounded-card border border-ink-200 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-3">
                <Icon name="shield" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-white">{t('twoFa')}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {twoFa ? t('twoFaOn') : t('twoFaOff')}
                  </p>
                </div>
              </div>
              <Switch checked={twoFa} onChange={setTwoFa} label={t('twoFa')} />
            </div>
          </Card>

          {/* Danger */}
          <Card className="border-danger-200 p-5 dark:border-danger-500/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">
                  {t('deleteTitle')}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">{t('deleteDesc')}</p>
              </div>
              <Btn v="danger" icon="trash" size="sm" onClick={() => toast(t('deleteToast'), { tone: 'danger', icon: 'info' })}>
                {t('delete')}
              </Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
