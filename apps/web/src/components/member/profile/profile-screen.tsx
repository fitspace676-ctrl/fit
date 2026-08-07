'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Switch } from '@astryxdesign/core/Switch';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { locales } from '@fit/i18n';
import type { Locale } from '@fit/i18n';
import { Link, usePathname, useRouter } from '@/src/i18n/navigation';
import { Icon, useToast } from '@/src/components/ui';
import { useTheme } from '@/src/components/theme/theme-provider';
import { updateProfileAction } from '@/app/actions/profile';

// Astryx migration (T11.16): the member profile is rebuilt on the Astryx design
// system over the Fit brand theme. The identity card, the tabbed sections
// (personal info / preferences / notifications / security) and the danger zone
// use Astryx Card / TabList / TextInput / SegmentedControl / Switch / Badge /
// Button; all layout is compiled StyleX (`var(--color-*)`), no Tailwind
// utilities. The save action, locale-cookie and theme wiring are unchanged.

export interface ProfileScreenProps {
  /** Member display name (from GET /me/profile, or a placeholder). */
  name: string;
  email: string;
  phone: string;
  memberId: string;
  /** Quick stats for the identity card. */
  attended: number;
  credits: number;
}

const FIELDS = ['firstName', 'lastName', 'email', 'phone', 'emergency', 'address'] as const;
const NOTIFS = ['reminders', 'bookings', 'billing', 'promotions'] as const;
type Section = 'personal' | 'preferences' | 'notifications' | 'security';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  eyebrow: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    color: 'var(--color-text-secondary)',
  },
  title: {
    margin: 0,
    marginTop: '0.25rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  grid: {
    display: 'grid',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '320px 1fr',
    },
    alignItems: 'start',
  },
  identity: {
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'sticky',
    },
    top: '6rem',
  },
  identityInner: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  avatar: {
    position: 'relative',
  },
  avatarDisc: {
    display: 'grid',
    placeItems: 'center',
    height: '6rem',
    width: '6rem',
    borderRadius: 'var(--radius-full)',
    backgroundImage:
      'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 92%, #7c3aed), #ec4899)',
    color: '#ffffff',
  },
  avatarIcon: {
    height: '2.5rem',
    width: '2.5rem',
  },
  name: {
    margin: 0,
    marginTop: '1rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  email: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  badgeWrap: {
    marginTop: '0.75rem',
  },
  stats: {
    marginTop: '1.5rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    width: '100%',
    textAlign: 'center',
  },
  stat: {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.75rem',
  },
  statValue: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
  },
  statLabel: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-text-secondary)',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  panel: {
    padding: '1.5rem',
  },
  sectionTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  fieldGrid: {
    marginTop: '1rem',
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': '1fr 1fr',
    },
  },
  fieldWide: {
    gridColumn: {
      default: 'auto',
      '@media (min-width: 640px)': '1 / -1',
    },
  },
  prefRow: {
    marginTop: '1rem',
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(3, 1fr)',
    },
  },
  prefLabel: {
    margin: 0,
    marginBottom: '0.5rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  toggles: {
    marginTop: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingBlock: '0.875rem',
  },
  toggleRowFirst: {
    borderTopWidth: 0,
  },
  toggleText: {
    minWidth: 0,
  },
  toggleTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  toggleDesc: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  secLink: {
    marginTop: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    textDecoration: 'none',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-tint-hover)',
    },
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  secRow: {
    marginTop: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  secRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  secIcon: {
    height: '1rem',
    width: '1rem',
    color: 'var(--color-text-secondary)',
  },
  glyph: {
    height: '1rem',
    width: '1rem',
  },
  danger: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '1.25rem',
  },
  dangerTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-red)',
  },
  dangerDesc: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The member profile screen, on the Astryx design system: an identity card plus
 * tabbed sections — personal info, preferences (language wired to the locale
 * cookie; units; theme wired to the ThemeProvider), notification toggles, and
 * security. Field edits and toggles are held in local state and persisted with a
 * graceful action; the language and theme controls take effect immediately.
 */
export function ProfileScreen({
  name,
  email,
  phone,
  memberId,
  attended,
  credits,
}: ProfileScreenProps) {
  const t = useTranslations('member.profile');
  const activeLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [saving, startSaving] = useTransition();
  const [section, setSection] = useState<Section>('personal');

  const [fields, setFields] = useState<Record<string, string>>({
    firstName: name.split(' ')[0] ?? '',
    lastName: name.split(' ').slice(1).join(' ') ?? '',
    email,
    phone,
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
    // Name + phone persist via PATCH /me/profile; the remaining preferences that
    // work client-side (language, theme) have already been applied on change.
    const fullName = `${fields.firstName ?? ''} ${fields.lastName ?? ''}`.trim();
    startSaving(async () => {
      const res = await updateProfileAction({
        ...(fullName ? { name: fullName } : {}),
        phone: (fields.phone ?? '').trim() || null,
      });
      if (res.ok) {
        toast(t('saved'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(res.code === 'UNAUTHENTICATED' ? t('saveAuth') : t('saveError'), {
          tone: 'danger',
          icon: 'x',
        });
      }
    });
  }

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.head)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>{t('eyebrow')}</p>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Icon name="check" {...stylex.props(styles.glyph)} />}
          label={saving ? t('saving') : t('save')}
          onClick={save}
          isDisabled={saving}
        />
      </div>

      <div {...stylex.props(styles.grid)}>
        {/* Identity */}
        <div {...stylex.props(styles.identity)}>
          <Card variant="default" padding={0}>
            <div {...stylex.props(styles.identityInner)}>
              <span {...stylex.props(styles.avatar)}>
                <span {...stylex.props(styles.avatarDisc)}>
                  <Icon name="user" sw={2} {...stylex.props(styles.avatarIcon)} />
                </span>
              </span>
              <p {...stylex.props(styles.name)}>{name}</p>
              <p {...stylex.props(styles.email)}>{email}</p>
              <span {...stylex.props(styles.badgeWrap)}>
                <Badge
                  variant="purple"
                  icon={<Icon name="bolt" {...stylex.props(styles.glyph)} />}
                  label={t('premiumMember')}
                />
              </span>
              <div {...stylex.props(styles.stats)}>
                {[
                  { l: t('checkIns'), v: attended },
                  { l: t('credits'), v: credits },
                  { l: t('id'), v: memberId },
                ].map((s) => (
                  <div key={s.l} {...stylex.props(styles.stat)}>
                    <p {...stylex.props(styles.statValue)}>{s.v}</p>
                    <p {...stylex.props(styles.statLabel)}>{s.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Tabbed sections */}
        <div {...stylex.props(styles.main)}>
          <TabList
            value={section}
            onChange={(v) => setSection(v as Section)}
            aria-label={t('title')}
            hasDivider
          >
            <Tab
              value="personal"
              label={t('personalInfo')}
              icon={<Icon name="user" {...stylex.props(styles.glyph)} />}
            />
            <Tab
              value="preferences"
              label={t('preferences')}
              icon={<Icon name="spark" {...stylex.props(styles.glyph)} />}
            />
            <Tab
              value="notifications"
              label={t('notifications')}
              icon={<Icon name="bell" {...stylex.props(styles.glyph)} />}
            />
            <Tab
              value="security"
              label={t('security')}
              icon={<Icon name="shield" {...stylex.props(styles.glyph)} />}
            />
          </TabList>

          {section === 'personal' && (
            <Card variant="default" padding={0}>
              <div {...stylex.props(styles.panel)}>
                <h2 {...stylex.props(styles.sectionTitle)}>{t('personalInfo')}</h2>
                <div {...stylex.props(styles.fieldGrid)}>
                  {FIELDS.map((f) => (
                    <div key={f} {...stylex.props(f === 'address' && styles.fieldWide)}>
                      <TextInput
                        label={t(`fields.${f}`)}
                        type={f === 'email' ? 'email' : 'text'}
                        value={fields[f] ?? ''}
                        onChange={(value) => setFields((p) => ({ ...p, [f]: value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {section === 'preferences' && (
            <Card variant="default" padding={0}>
              <div {...stylex.props(styles.panel)}>
                <h2 {...stylex.props(styles.sectionTitle)}>{t('preferences')}</h2>
                <div {...stylex.props(styles.prefRow)}>
                  <div>
                    <p {...stylex.props(styles.prefLabel)}>{t('language')}</p>
                    <SegmentedControl
                      value={activeLocale}
                      onChange={(v) => switchLocale(v as Locale)}
                      label={t('language')}
                    >
                      {locales.map((loc) => (
                        <SegmentedControlItem
                          key={loc}
                          value={loc}
                          label={loc === 'ka' ? 'ქართული' : 'English'}
                        />
                      ))}
                    </SegmentedControl>
                  </div>
                  <div>
                    <p {...stylex.props(styles.prefLabel)}>{t('units')}</p>
                    <SegmentedControl
                      value={units}
                      onChange={(v) => setUnits(v as 'metric' | 'imperial')}
                      label={t('units')}
                    >
                      {(['metric', 'imperial'] as const).map((u) => (
                        <SegmentedControlItem key={u} value={u} label={t(`unit.${u}`)} />
                      ))}
                    </SegmentedControl>
                  </div>
                  <div>
                    <p {...stylex.props(styles.prefLabel)}>{t('theme')}</p>
                    <SegmentedControl
                      value={theme}
                      onChange={(v) => setTheme(v as 'light' | 'dark')}
                      label={t('theme')}
                    >
                      {(['light', 'dark'] as const).map((th) => (
                        <SegmentedControlItem
                          key={th}
                          value={th}
                          label={t(`themeName.${th}`)}
                          icon={
                            <Icon
                              name={th === 'light' ? 'sun' : 'moon'}
                              {...stylex.props(styles.glyph)}
                            />
                          }
                        />
                      ))}
                    </SegmentedControl>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {section === 'notifications' && (
            <Card variant="default" padding={0}>
              <div {...stylex.props(styles.panel)}>
                <h2 {...stylex.props(styles.sectionTitle)}>{t('notifications')}</h2>
                <div {...stylex.props(styles.toggles)}>
                  {NOTIFS.map((k, i) => (
                    <div
                      key={k}
                      {...stylex.props(styles.toggleRow, i === 0 && styles.toggleRowFirst)}
                    >
                      <div {...stylex.props(styles.toggleText)}>
                        <p {...stylex.props(styles.toggleTitle)}>{t(`notif.${k}.title`)}</p>
                        <p {...stylex.props(styles.toggleDesc)}>{t(`notif.${k}.desc`)}</p>
                      </div>
                      <Switch
                        label={t(`notif.${k}.title`)}
                        isLabelHidden
                        value={notifs[k] ?? false}
                        onChange={(v) => setNotifs((p) => ({ ...p, [k]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {section === 'security' && (
            <>
              <Card variant="default" padding={0}>
                <div {...stylex.props(styles.panel)}>
                  <h2 {...stylex.props(styles.sectionTitle)}>{t('security')}</h2>
                  <Link href="/member/forgot-password" {...stylex.props(styles.secLink)}>
                    <Icon name="lock" {...stylex.props(styles.glyph)} /> {t('changePassword')}
                  </Link>
                  <div {...stylex.props(styles.secRow)}>
                    <div {...stylex.props(styles.secRowLeft)}>
                      <Icon name="shield" {...stylex.props(styles.secIcon)} />
                      <div>
                        <p {...stylex.props(styles.toggleTitle)}>{t('twoFa')}</p>
                        <p {...stylex.props(styles.toggleDesc)}>
                          {twoFa ? t('twoFaOn') : t('twoFaOff')}
                        </p>
                      </div>
                    </div>
                    <Switch label={t('twoFa')} isLabelHidden value={twoFa} onChange={setTwoFa} />
                  </div>
                </div>
              </Card>

              <Card variant="default" padding={0}>
                <div {...stylex.props(styles.danger)}>
                  <div>
                    <p {...stylex.props(styles.dangerTitle)}>{t('deleteTitle')}</p>
                    <p {...stylex.props(styles.dangerDesc)}>{t('deleteDesc')}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    icon={<Icon name="trash" {...stylex.props(styles.glyph)} />}
                    label={t('delete')}
                    onClick={() => toast(t('deleteToast'), { tone: 'danger', icon: 'info' })}
                  />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
