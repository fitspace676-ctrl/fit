'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { z } from 'zod';
import {
  GYM_LOGO_MAX_WIDTH,
  HEX_COLOR_PATTERN,
  MAX_CANCELLATION_CUTOFF_HOURS,
  SUPPORTED_LANGUAGES,
  WEEKDAYS,
  gymLanguageSchema,
  isValidTimeZone,
  type GymLanguage,
  type GymSettings,
  type UpdateGymSettingsInput,
  type Weekday,
  type WeeklyHours,
} from '@fit/types';
import {
  Btn,
  Controller,
  Form,
  Icon,
  NumberField,
  SelectField,
  Switch,
  TextField,
  fieldErrorText,
  useFormContext,
  useToast,
  useWatch,
  useZodForm,
  type FieldErrors,
  type IconName,
} from '@/components/ui';
import { finalizeGymLogoAction, requestLogoUploadAction, updateGymSettingsAction } from './actions';

/** Accepted logo MIME types, matching the storage service's extension map. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** `HH:MM` 24-hour time, mirroring the schema pattern in `@fit/types`. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Common currencies for the picker; the gym's current code is always included. */
const COMMON_CURRENCIES = ['GEL', 'USD', 'EUR', 'GBP', 'RUB', 'TRY', 'AMD', 'AZN', 'UAH'];

/** A reasonable fallback set when `Intl.supportedValuesOf` is unavailable. */
const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Tbilisi',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Los_Angeles',
];

/** The Tailwind `animate-ping` echo, reproduced as a StyleX keyframe. */
const ping = stylex.keyframes({
  '75%, 100%': { transform: 'scale(2)', opacity: 0 },
});

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    paddingBottom: '6rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  breadcrumbCurrent: {
    color: 'var(--color-text-primary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  layout: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '230px 1fr',
    },
  },
  minCol: {
    minWidth: 0,
  },
  // General section
  stack5: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  colorRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.5rem',
  },
  localeSection: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '1.25rem',
  },
  legend: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  localeGrid: {
    marginTop: '1rem',
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, 1fr)',
    },
  },
  spanTwo: {
    gridColumn: {
      default: 'auto',
      '@media (min-width: 640px)': 'span 2 / span 2',
    },
  },
  maxXs: {
    maxWidth: '20rem',
  },
  stack2: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  stack4: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  // Section rail
  railWrap: {
    height: 'fit-content',
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'sticky',
    },
    top: {
      default: 'auto',
      '@media (min-width: 1024px)': '88px',
    },
  },
  railCard: {
    padding: '0.375rem',
  },
  railList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  railBtn: {
    display: 'flex',
    height: '2.75rem',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    borderStyle: 'none',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  railBtnActive: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    boxShadow: '0 6px 20px -8px var(--color-shadow)',
  },
  railBtnInactive: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  railIcon: {
    width: '1.125rem',
    height: '1.125rem',
  },
  railLabel: {
    flex: 1,
    textAlign: 'left',
  },
  // Section card
  card: {
    padding: {
      default: '1.25rem',
      '@media (min-width: 640px)': '1.5rem',
    },
  },
  cardTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  cardDesc: {
    marginTop: '0.125rem',
    marginBottom: '1.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  // Logo field
  fieldLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  logoImg: {
    height: '4rem',
    width: '4rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    objectFit: 'contain',
  },
  logoNone: {
    display: 'flex',
    height: '4rem',
    width: '4rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  logoControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  fileInput: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
    '::file-selector-button': {
      marginRight: '0.75rem',
      borderStyle: 'none',
      borderRadius: 'var(--radius-element)',
      paddingInline: '0.75rem',
      paddingBlock: '0.375rem',
      fontSize: '0.875rem',
      fontWeight: 500,
      backgroundColor: {
        default: 'var(--color-accent-muted)',
        ':hover': 'var(--color-accent-muted)',
      },
      color: 'var(--color-text-accent)',
      cursor: 'pointer',
    },
  },
  logoHintRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  removeBtn: {
    borderStyle: 'none',
    background: 'none',
    padding: 0,
    cursor: 'pointer',
    fontWeight: 500,
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-error)',
    },
  },
  uploadError: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-warning-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-warning)',
  },
  // Color field
  colorField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  colorRowInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  colorInput: {
    height: '2.75rem',
    width: '3.5rem',
    cursor: 'pointer',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.25rem',
  },
  colorHex: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  // Day row
  dayRow: {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.75rem',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  dayInner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  dayLabel: {
    width: '6rem',
    flexShrink: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  dayLabelOpen: {
    color: 'var(--color-text-primary)',
  },
  dayLabelClosed: {
    color: 'var(--color-text-disabled)',
  },
  closedText: {
    flex: 1,
    fontSize: '0.875rem',
    color: 'var(--color-text-disabled)',
  },
  timeRange: {
    display: 'flex',
    flex: 1,
    alignItems: 'center',
    gap: '0.5rem',
  },
  timeInput: {
    height: '2.5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.625rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  timeDash: {
    color: 'var(--color-text-disabled)',
  },
  toggleWrap: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  toggleLabel: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  dayError: {
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-error)',
  },
  // Save bar
  saveBar: {
    position: 'fixed',
    bottom: '1.25rem',
    left: '50%',
    zIndex: 40,
    transitionProperty: 'transform, opacity',
    transitionDuration: '300ms',
  },
  saveBarVisible: {
    transform: 'translateX(-50%) translateY(0)',
    opacity: 1,
  },
  saveBarHidden: {
    transform: 'translateX(-50%) translateY(1rem)',
    opacity: 0,
    pointerEvents: 'none',
  },
  saveBarInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    paddingBlock: '0.625rem',
    paddingLeft: '1rem',
    paddingRight: '0.625rem',
    color: 'var(--color-text-primary)',
    boxShadow: '0 24px 60px -16px var(--color-shadow)',
  },
  pingWrap: {
    position: 'relative',
    display: 'grid',
    height: '0.625rem',
    width: '0.625rem',
    placeItems: 'center',
  },
  pingEcho: {
    position: 'absolute',
    inset: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-warning)',
    opacity: 0.6,
    animationName: ping,
    animationDuration: '1s',
    animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
    animationIterationCount: 'infinite',
  },
  pingDot: {
    position: 'relative',
    height: '0.625rem',
    width: '0.625rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-warning)',
  },
  saveBarText: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  saveBarDivider: {
    marginInline: '0.125rem',
    height: '1.25rem',
    width: '1px',
    backgroundColor: 'var(--color-border)',
  },
  discardBtn: {
    height: '2.25rem',
    borderStyle: 'none',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    opacity: {
      default: 1,
      ':disabled': 0.4,
    },
  },
});

/** All IANA time zones the runtime knows, falling back to a small curated set. */
function timeZones(): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  try {
    return typeof fn === 'function' ? fn('timeZone') : FALLBACK_TIMEZONES;
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

/** Build an option list that always contains `current`, even if not in `base`. */
function withCurrent(base: string[], current: string): string[] {
  return base.includes(current) ? base : [current, ...base];
}

/** The settings form value shape — one flat mirror of `GymSettings` the form edits. */
interface SettingsFormValues {
  brand: { name: string; logoUrl: string | null; primaryColor: string; secondaryColor: string };
  locale: { language: GymLanguage; currency: string; timezone: string };
  hours: WeeklyHours;
  notifications: { fromName: string; fromEmail: string; replyTo: string };
  booking: { cancellationCutoffHours: number };
}

/** The rail sections, in order — each maps onto a slice of the real settings contract. */
type SectionKey = 'general' | 'hours' | 'booking' | 'notifications';
const SECTIONS: { key: SectionKey; icon: IconName }[] = [
  { key: 'general', icon: 'home' },
  { key: 'hours', icon: 'clock' },
  { key: 'booking', icon: 'calendar' },
  { key: 'notifications', icon: 'bell' },
];

/** Which rail section holds the first validation error, so a failed save jumps there. */
function sectionForErrors(errors: FieldErrors<SettingsFormValues>): SectionKey | null {
  if (errors.brand || errors.locale) return 'general';
  if (errors.hours) return 'hours';
  if (errors.booking) return 'booking';
  if (errors.notifications) return 'notifications';
  return null;
}

/**
 * The gym settings form (T2.12), rebuilt to the formacore settings artboard on the
 * shared form kit (T1.7). A section rail (General · Business hours · Booking rules ·
 * Notifications) swaps between cards over one `useZodForm` instance, and a sticky
 * save bar surfaces the moment the form is dirty — Discard resets to the last-saved
 * truth, Save submits the whole `PATCH /gyms/settings`. Only sections backed by the
 * real settings contract are shown; the artboard's payments / integrations mock-ups
 * have no backend and are intentionally omitted.
 *
 * The logo is uploaded straight to R2 via a presigned `PUT` and persisted through
 * {@link finalizeGymLogoAction}; the returned URL is folded into the form so the
 * next Save keeps it. On a clean submit the form resets to the server's normalised
 * response, clearing the dirty state and dismissing the save bar.
 */
export function SettingsForm({ initial }: { initial: GymSettings }) {
  const t = useTranslations('admin.settings');
  const router = useRouter();
  const { toast } = useToast();
  const [section, setSection] = useState<SectionKey>('general');

  const timezoneOptions = useMemo(
    () => withCurrent(timeZones(), initial.locale.timezone),
    [initial.locale.timezone],
  );
  const currencyOptions = useMemo(
    () => withCurrent(COMMON_CURRENCIES, initial.locale.currency),
    [initial.locale.currency],
  );

  // Built with translated messages so inline validation reads in the active locale.
  const schema = useMemo(() => {
    const emailOrEmpty = z
      .string()
      .trim()
      .refine((v) => v === '' || z.string().email().safeParse(v).success, {
        message: t('errors.email'),
      });
    const day = z
      .object({
        closed: z.boolean(),
        open: z.string().regex(TIME_PATTERN, t('errors.time')),
        close: z.string().regex(TIME_PATTERN, t('errors.time')),
      })
      .refine((d) => d.closed || d.close > d.open, {
        message: t('errors.closeAfterOpen'),
        path: ['close'],
      });
    return z.object({
      brand: z.object({
        name: z.string().trim().min(1, t('errors.nameRequired')).max(100),
        logoUrl: z.string().url().nullable(),
        primaryColor: z.string().regex(HEX_COLOR_PATTERN, t('errors.color')),
        secondaryColor: z.string().regex(HEX_COLOR_PATTERN, t('errors.color')),
      }),
      locale: z.object({
        language: gymLanguageSchema,
        currency: z.string().regex(/^[A-Z]{3}$/, t('errors.currency')),
        timezone: z.string().refine(isValidTimeZone, t('errors.timezone')),
      }),
      hours: z.object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day }),
      notifications: z.object({
        fromName: z.string().trim().max(100),
        fromEmail: emailOrEmpty,
        replyTo: emailOrEmpty,
      }),
      booking: z.object({
        cancellationCutoffHours: z
          .number({ invalid_type_error: t('errors.cutoffNumber') })
          .int(t('errors.cutoffNumber'))
          .min(0, t('errors.cutoffMin'))
          .max(
            MAX_CANCELLATION_CUTOFF_HOURS,
            t('errors.cutoffMax', {
              max: MAX_CANCELLATION_CUTOFF_HOURS,
            }),
          ),
      }),
    });
  }, [t]);

  const form = useZodForm(schema, { defaultValues: toFormValues(initial) });
  const submitCount = form.formState.submitCount;

  // On a failed save, surface the offending section so the error isn't hidden in
  // a rail tab the user isn't looking at.
  useEffect(() => {
    if (submitCount === 0) return;
    const target = sectionForErrors(form.formState.errors);
    if (target) setSection(target);
  }, [submitCount, form]);

  async function handleSubmit(values: SettingsFormValues): Promise<void> {
    const input: UpdateGymSettingsInput = {
      brand: {
        name: values.brand.name,
        logoUrl: values.brand.logoUrl,
        primaryColor: values.brand.primaryColor,
        secondaryColor: values.brand.secondaryColor,
      },
      locale: values.locale,
      hours: values.hours,
      notifications: {
        fromName: values.notifications.fromName.trim() || null,
        fromEmail: values.notifications.fromEmail.trim() || null,
        replyTo: values.notifications.replyTo.trim() || null,
      },
      booking: values.booking,
    };
    const result = await updateGymSettingsAction(input);
    if (result.ok) {
      // Resync to the server's normalised truth, which also clears the dirty state.
      form.reset(toFormValues(result.data));
      toast(t('toast.saved'), { tone: 'success', icon: 'check' });
      router.refresh();
    } else {
      toast(result.error || t('toast.saveFailed'), { tone: 'danger', icon: 'info' });
    }
  }

  return (
    <Form
      form={form}
      onSubmit={(values) => void handleSubmit(values)}
      {...stylex.props(styles.form)}
    >
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>Iron Gym</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.breadcrumbCurrent)}>{t('breadcrumb.settings')}</span>
      </nav>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      <div {...stylex.props(styles.layout)}>
        <SectionRail section={section} onSelect={setSection} />

        <div {...stylex.props(styles.minCol)}>
          {section === 'general' ? (
            <SectionCard title={t('general.title')} description={t('general.subtitle')}>
              <div {...stylex.props(styles.stack5)}>
                <LogoField />
                <TextField
                  name="brand.name"
                  label={t('general.nameLabel')}
                  autoComplete="off"
                  required
                />
                <div {...stylex.props(styles.colorRow)}>
                  <ColorField name="brand.primaryColor" label={t('general.primaryColor')} />
                  <ColorField name="brand.secondaryColor" label={t('general.secondaryColor')} />
                </div>
                <div {...stylex.props(styles.localeSection)}>
                  <p {...stylex.props(styles.legend)}>{t('general.localeLegend')}</p>
                  <div {...stylex.props(styles.localeGrid)}>
                    <SelectField name="locale.language" label={t('general.language')}>
                      {SUPPORTED_LANGUAGES.map((code) => (
                        <option key={code} value={code}>
                          {t(`language.${code}`)}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField name="locale.currency" label={t('general.currency')}>
                      {currencyOptions.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      name="locale.timezone"
                      label={t('general.timezone')}
                      hint={t('general.timezoneHint')}
                      fieldClassName={stylex.props(styles.spanTwo).className}
                    >
                      {timezoneOptions.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {section === 'hours' ? (
            <SectionCard title={t('hours.title')} description={t('hours.subtitle')}>
              <div {...stylex.props(styles.stack2)}>
                {WEEKDAYS.map((day) => (
                  <DayRow key={day} day={day} />
                ))}
              </div>
            </SectionCard>
          ) : null}

          {section === 'booking' ? (
            <SectionCard title={t('booking.title')} description={t('booking.subtitle')}>
              <NumberField
                name="booking.cancellationCutoffHours"
                label={t('booking.cutoffLabel')}
                min={0}
                max={MAX_CANCELLATION_CUTOFF_HOURS}
                step={1}
                hint={<BookingHint />}
                fieldClassName={stylex.props(styles.maxXs).className}
              />
            </SectionCard>
          ) : null}

          {section === 'notifications' ? (
            <SectionCard title={t('notifications.title')} description={t('notifications.subtitle')}>
              <div {...stylex.props(styles.stack4)}>
                <TextField
                  name="notifications.fromName"
                  label={t('notifications.fromNameLabel')}
                  placeholder={t('notifications.fromNamePlaceholder')}
                  autoComplete="off"
                />
                <TextField
                  name="notifications.fromEmail"
                  type="email"
                  label={t('notifications.fromEmailLabel')}
                  placeholder={t('notifications.fromEmailPlaceholder')}
                  autoComplete="off"
                />
                <TextField
                  name="notifications.replyTo"
                  type="email"
                  label={t('notifications.replyToLabel')}
                  placeholder={t('notifications.replyToPlaceholder')}
                  autoComplete="off"
                />
              </div>
            </SectionCard>
          ) : null}
        </div>
      </div>

      <SaveBar />
    </Form>
  );
}

/** Map the API settings shape onto the flat form values (nullable senders → ''). */
function toFormValues(settings: GymSettings): SettingsFormValues {
  return {
    brand: {
      name: settings.brand.name,
      logoUrl: settings.brand.logoUrl,
      primaryColor: settings.brand.primaryColor,
      secondaryColor: settings.brand.secondaryColor,
    },
    locale: {
      language: settings.locale.language,
      currency: settings.locale.currency,
      timezone: settings.locale.timezone,
    },
    hours: settings.hours,
    notifications: {
      fromName: settings.notifications.fromName ?? '',
      fromEmail: settings.notifications.fromEmail ?? '',
      replyTo: settings.notifications.replyTo ?? '',
    },
    booking: { cancellationCutoffHours: settings.booking.cancellationCutoffHours },
  };
}

/** The sticky section-picker rail — the active tab paints the brand gradient. */
function SectionRail({
  section,
  onSelect,
}: {
  section: SectionKey;
  onSelect: (next: SectionKey) => void;
}) {
  const t = useTranslations('admin.settings');
  return (
    <div {...stylex.props(styles.railWrap)}>
      <Card variant="default" padding={0} xstyle={styles.railCard}>
        <div {...stylex.props(styles.railList)}>
          {SECTIONS.map((item) => {
            const active = section === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={active ? 'page' : undefined}
                {...stylex.props(
                  styles.railBtn,
                  active ? styles.railBtnActive : styles.railBtnInactive,
                )}
              >
                <Icon name={item.icon} {...stylex.props(styles.railIcon)} sw={2} />
                <span {...stylex.props(styles.railLabel)}>{t(`sections.${item.key}`)}</span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/** A titled settings card — the surface each rail section renders into. */
function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.cardTitle)}>{title}</h3>
      <p {...stylex.props(styles.cardDesc)}>{description}</p>
      {children}
    </Card>
  );
}

/**
 * The logo uploader. Bytes go straight to R2 via a presigned PUT (after a
 * client-side type / size / width check), the API finalises them into a public
 * URL, and that URL is written into the form (marked dirty) so the next Save keeps
 * it. Removing a logo clears the form value; the removal persists on Save.
 */
function LogoField() {
  const t = useTranslations('admin.settings');
  const { control, setValue, formState } = useFormContext<SettingsFormValues>();
  const logoUrl = useWatch({ control, name: 'brand.logoUrl' });
  const name = useWatch({ control, name: 'brand.name' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetFileInput(): void {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onLogoChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError(t('logo.errorType'));
      resetFileInput();
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadError(t('logo.errorSize'));
      resetFileInput();
      return;
    }

    // Reject an over-wide logo *before* fetching a signed URL. SVGs have no
    // intrinsic raster width, so the dimension check only applies to bitmaps.
    if (file.type !== 'image/svg+xml' && typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        const { width } = bitmap;
        bitmap.close();
        if (width > GYM_LOGO_MAX_WIDTH) {
          setUploadError(t('logo.errorWidth', { width, max: GYM_LOGO_MAX_WIDTH }));
          resetFileInput();
          return;
        }
      } catch {
        setUploadError(t('logo.errorRead'));
        resetFileInput();
        return;
      }
    }

    setUploading(true);
    try {
      const signed = await requestLogoUploadAction({
        contentType: file.type,
        contentLength: file.size,
        fileName: file.name,
      });
      if (!signed.ok) {
        setUploadError(signed.error);
        return;
      }
      const put = await fetch(signed.data.url, {
        method: 'PUT',
        headers: { 'content-type': signed.data.contentType },
        body: file,
      });
      if (!put.ok) {
        setUploadError(t('logo.errorUpload', { status: put.status }));
        return;
      }
      const finalized = await finalizeGymLogoAction(signed.data.key);
      if (!finalized.ok) {
        setUploadError(finalized.error);
        return;
      }
      setValue('brand.logoUrl', finalized.data.logoUrl, { shouldDirty: true });
    } catch {
      setUploadError(t('logo.errorNetwork'));
    } finally {
      setUploading(false);
      resetFileInput();
    }
  }

  const disabled = uploading || formState.isSubmitting;

  return (
    <div {...stylex.props(styles.stack2)}>
      <span {...stylex.props(styles.fieldLabel)}>{t('logo.label')}</span>
      <div {...stylex.props(styles.logoRow)}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={t('logo.alt', { name: name || t('logo.fallbackName') })}
            {...stylex.props(styles.logoImg)}
          />
        ) : (
          <span {...stylex.props(styles.logoNone)}>{t('logo.none')}</span>
        )}
        <div {...stylex.props(styles.logoControls)}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={(event) => void onLogoChange(event)}
            disabled={disabled}
            {...stylex.props(styles.fileInput)}
          />
          <div {...stylex.props(styles.logoHintRow)}>
            <span>
              {uploading ? t('logo.uploading') : t('logo.hint', { max: GYM_LOGO_MAX_WIDTH })}
            </span>
            {logoUrl && !uploading ? (
              <button
                type="button"
                onClick={() => setValue('brand.logoUrl', null, { shouldDirty: true })}
                {...stylex.props(styles.removeBtn)}
              >
                {t('logo.remove')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {uploadError ? (
        <p role="alert" {...stylex.props(styles.uploadError)}>
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}

/** A paired colour-picker swatch + hex readout, bound to the form by `name`. */
function ColorField({
  name,
  label,
}: {
  name: 'brand.primaryColor' | 'brand.secondaryColor';
  label: string;
}) {
  const { control, register } = useFormContext<SettingsFormValues>();
  const value = useWatch({ control, name });
  const id = useId();
  return (
    <div {...stylex.props(styles.colorField)}>
      <label htmlFor={id} {...stylex.props(styles.fieldLabel)}>
        {label}
      </label>
      <div {...stylex.props(styles.colorRowInner)}>
        <input id={id} type="color" {...register(name)} {...stylex.props(styles.colorInput)} />
        <span {...stylex.props(styles.colorHex)}>{value}</span>
      </div>
    </div>
  );
}

/** One weekday's opening-hours row: an Open switch, time range, and inline error. */
function DayRow({ day }: { day: Weekday }) {
  const t = useTranslations('admin.settings');
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<SettingsFormValues>();
  const closed = useWatch({ control, name: `hours.${day}.closed` });
  const closeError = fieldErrorText(errors, `hours.${day}.close`);
  const label = t(`weekday.${day}`);

  return (
    <div {...stylex.props(styles.dayRow)}>
      <div {...stylex.props(styles.dayInner)}>
        <span
          {...stylex.props(styles.dayLabel, closed ? styles.dayLabelClosed : styles.dayLabelOpen)}
        >
          {label}
        </span>
        {closed ? (
          <span {...stylex.props(styles.closedText)}>{t('hours.closed')}</span>
        ) : (
          <div {...stylex.props(styles.timeRange)}>
            <input
              type="time"
              aria-label={t('hours.openAria', { day: label })}
              {...register(`hours.${day}.open`)}
              {...stylex.props(styles.timeInput)}
            />
            <span {...stylex.props(styles.timeDash)}>—</span>
            <input
              type="time"
              aria-label={t('hours.closeAria', { day: label })}
              {...register(`hours.${day}.close`)}
              {...stylex.props(styles.timeInput)}
            />
          </div>
        )}
        <div {...stylex.props(styles.toggleWrap)}>
          <span {...stylex.props(styles.toggleLabel)}>{t('hours.open')}</span>
          <Controller
            control={control}
            name={`hours.${day}.closed`}
            render={({ field }) => (
              <Switch
                checked={!field.value}
                onChange={(open) => field.onChange(!open)}
                label={t('hours.toggleAria', { day: label })}
              />
            )}
          />
        </div>
      </div>
      {closeError ? <p {...stylex.props(styles.dayError)}>{closeError}</p> : null}
    </div>
  );
}

/** The live cancellation-policy explainer under the cutoff field. */
function BookingHint() {
  const t = useTranslations('admin.settings');
  const { control } = useFormContext<SettingsFormValues>();
  const value = useWatch({ control, name: 'booking.cancellationCutoffHours' });
  if (!Number.isFinite(value) || value <= 0) return <>{t('booking.hintNone')}</>;
  return <>{t('booking.hintActive', { count: value })}</>;
}

/** The sticky "unsaved changes" bar — appears on any edit, gone once saved/reset. */
function SaveBar() {
  const t = useTranslations('admin.settings');
  const {
    reset,
    formState: { isDirty, isSubmitting },
  } = useFormContext<SettingsFormValues>();
  return (
    <div
      // Kept mounted for the fade transition; `inert` while hidden so its
      // controls are neither focusable nor announced until there are changes.
      inert={!isDirty}
      aria-hidden={!isDirty}
      {...stylex.props(styles.saveBar, isDirty ? styles.saveBarVisible : styles.saveBarHidden)}
    >
      <div {...stylex.props(styles.saveBarInner)}>
        <span {...stylex.props(styles.pingWrap)}>
          <span {...stylex.props(styles.pingEcho)} />
          <span {...stylex.props(styles.pingDot)} />
        </span>
        <span {...stylex.props(styles.saveBarText)}>{t('saveBar.unsaved')}</span>
        <div {...stylex.props(styles.saveBarDivider)} />
        <button
          type="button"
          onClick={() => reset()}
          disabled={isSubmitting}
          {...stylex.props(styles.discardBtn)}
        >
          {t('saveBar.discard')}
        </button>
        <Btn type="submit" v="primary" size="sm" icon="check" disabled={isSubmitting}>
          {isSubmitting ? t('saveBar.saving') : t('saveBar.save')}
        </Btn>
      </div>
    </div>
  );
}
