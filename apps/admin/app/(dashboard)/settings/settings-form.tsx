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
  MAX_PENALTY_AMOUNT,
  SUPPORTED_LANGUAGES,
  WEEKDAYS,
  gymLanguageSchema,
  invoiceNumberFormatSchema,
  isValidTimeZone,
  penaltyTypeSchema,
  refundPolicyModeSchema,
  waitlistModeSchema,
  type GymLanguage,
  type GymSettings,
  type InvoiceNumberFormat,
  type PenaltyType,
  type RefundPolicyMode,
  type UpdateGymSettingsInput,
  type WaitlistMode,
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
  subSection: {
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
  grid2: {
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
  stack5col: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  // Switch rows
  switchList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  switchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.875rem 1rem',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  switchText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    flex: 1,
    minWidth: 0,
  },
  switchLabel: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  switchDesc: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
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
    height: '2.5rem',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    borderStyle: 'none',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    fontSize: '0.8125rem',
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
    flexShrink: 0,
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
  business: { address: string; phone: string; email: string; website: string };
  locale: { language: GymLanguage; currency: string; timezone: string };
  hours: WeeklyHours;
  notifications: { fromName: string; fromEmail: string; replyTo: string };
  booking: {
    cancellationCutoffHours: number;
    lateCancellationPenalty: number;
    lateCancellationPenaltyType: PenaltyType;
    bookingWindowDays: number;
    maxBookingsPerDay: number;
    maxBookingsPerWeek: number;
    waitlistMode: WaitlistMode;
  };
  noShow: {
    penalty: number;
    penaltyType: PenaltyType;
    penaltyDays: number;
    autoCancelMinutes: number;
  };
  freeze: {
    minFreezeDays: number;
    maxFreezeDays: number;
    maxFreezeDaysPerYear: number;
    freezeFee: number;
    requiresApproval: boolean;
  };
  guestPass: {
    passesPerMonth: number;
    price: number;
    durationDays: number;
    requiresWaiver: boolean;
    mustBeAccompanied: boolean;
    sameGuestCooldownDays: number;
  };
  trial: {
    durationDays: number;
    price: number;
    includesClasses: boolean;
    maxClassBookings: number;
    requiresPaymentMethod: boolean;
    conversionDiscountPercent: number;
  };
  membership: { gracePeriodDays: number };
  payments: { acceptCash: boolean; acceptCard: boolean; acceptPrepaidCredits: boolean };
  invoice: { prefix: string; startNumber: number; format: InvoiceNumberFormat };
  tax: {
    enabled: boolean;
    membershipRate: number;
    classRate: number;
    productRate: number;
    serviceRate: number;
  };
  refund: { mode: RefundPolicyMode; windowDays: number };
  receipt: { emailEnabled: boolean; printEnabled: boolean };
  autoRenewal: {
    enabled: boolean;
    retryAttempts: number;
    retryIntervalDays: number;
    renewalReminderDays: number;
  };
}

/** Every boolean form path — the `name`s {@link SwitchRow} may bind to. */
type BoolFieldName =
  | 'freeze.requiresApproval'
  | 'guestPass.requiresWaiver'
  | 'guestPass.mustBeAccompanied'
  | 'trial.includesClasses'
  | 'trial.requiresPaymentMethod'
  | 'payments.acceptCash'
  | 'payments.acceptCard'
  | 'payments.acceptPrepaidCredits'
  | 'tax.enabled'
  | 'receipt.emailEnabled'
  | 'receipt.printEnabled'
  | 'autoRenewal.enabled';

/** The rail sections, in order — each maps onto a slice of the real settings contract. */
type SectionKey =
  | 'general'
  | 'business'
  | 'hours'
  | 'booking'
  | 'noShow'
  | 'freeze'
  | 'guestPass'
  | 'trial'
  | 'membership'
  | 'payments'
  | 'invoice'
  | 'tax'
  | 'refund'
  | 'receipt'
  | 'autoRenewal'
  | 'notifications';

const SECTIONS: { key: SectionKey; icon: IconName }[] = [
  { key: 'general', icon: 'home' },
  { key: 'business', icon: 'phone' },
  { key: 'hours', icon: 'clock' },
  { key: 'booking', icon: 'calendar' },
  { key: 'noShow', icon: 'eyeOff' },
  { key: 'freeze', icon: 'moon' },
  { key: 'guestPass', icon: 'ticket' },
  { key: 'trial', icon: 'spark' },
  { key: 'membership', icon: 'shield' },
  { key: 'payments', icon: 'card' },
  { key: 'invoice', icon: 'tag' },
  { key: 'tax', icon: 'chart' },
  { key: 'refund', icon: 'arrowLeft' },
  { key: 'receipt', icon: 'mail' },
  { key: 'autoRenewal', icon: 'bolt' },
  { key: 'notifications', icon: 'bell' },
];

/** Which rail section holds the first validation error, so a failed save jumps there. */
function sectionForErrors(errors: FieldErrors<SettingsFormValues>): SectionKey | null {
  if (errors.brand || errors.locale) return 'general';
  if (errors.business) return 'business';
  if (errors.hours) return 'hours';
  if (errors.booking) return 'booking';
  if (errors.noShow) return 'noShow';
  if (errors.freeze) return 'freeze';
  if (errors.guestPass) return 'guestPass';
  if (errors.trial) return 'trial';
  if (errors.membership) return 'membership';
  if (errors.payments) return 'payments';
  if (errors.invoice) return 'invoice';
  if (errors.tax) return 'tax';
  if (errors.refund) return 'refund';
  if (errors.receipt) return 'receipt';
  if (errors.autoRenewal) return 'autoRenewal';
  if (errors.notifications) return 'notifications';
  return null;
}

/**
 * The gym settings form (T2.12 / T12.17), rebuilt to the formacore settings
 * artboard on the shared form kit (T1.7) and extended to gym-admin parity. A
 * section rail (General · Business · Business hours · Booking · No-show · Freeze ·
 * Guest passes · Trials · Membership · Payments · Invoicing · Tax · Refunds ·
 * Receipts · Auto-renewal · Notifications) swaps between cards over one
 * `useZodForm` instance, and a sticky save bar surfaces the moment the form is
 * dirty — Discard resets to the last-saved truth, Save submits the whole
 * `PATCH /gyms/settings`. Every section is backed by the real settings contract
 * (T12.16); nothing here is a mock.
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
    // Shared numeric validator with translated bounds — the source of truth for
    // every min/max lives in the `@fit/types` schemas; these mirror them so the
    // form rejects the same values the API would, only with localised copy.
    const num = (opts: { min: number; max: number; int?: boolean }) => {
      const base = z.number({ invalid_type_error: t('errors.number') });
      const bounded = opts.int ? base.int(t('errors.integer')) : base;
      return bounded
        .min(opts.min, t('errors.min', { min: opts.min }))
        .max(opts.max, t('errors.max', { max: opts.max }));
    };
    return z.object({
      brand: z.object({
        name: z.string().trim().min(1, t('errors.nameRequired')).max(100),
        logoUrl: z.string().url().nullable(),
        primaryColor: z.string().regex(HEX_COLOR_PATTERN, t('errors.color')),
        secondaryColor: z.string().regex(HEX_COLOR_PATTERN, t('errors.color')),
      }),
      business: z.object({
        address: z.string().trim().max(200),
        phone: z.string().trim().max(40),
        email: emailOrEmpty,
        website: z.string().trim().max(200),
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
            t('errors.cutoffMax', { max: MAX_CANCELLATION_CUTOFF_HOURS }),
          ),
        lateCancellationPenalty: num({ min: 0, max: MAX_PENALTY_AMOUNT }),
        lateCancellationPenaltyType: penaltyTypeSchema,
        bookingWindowDays: num({ min: 0, max: 365, int: true }),
        maxBookingsPerDay: num({ min: 0, max: 100, int: true }),
        maxBookingsPerWeek: num({ min: 0, max: 500, int: true }),
        waitlistMode: waitlistModeSchema,
      }),
      noShow: z.object({
        penalty: num({ min: 0, max: MAX_PENALTY_AMOUNT }),
        penaltyType: penaltyTypeSchema,
        penaltyDays: num({ min: 0, max: 365, int: true }),
        autoCancelMinutes: num({ min: 0, max: 240, int: true }),
      }),
      freeze: z.object({
        minFreezeDays: num({ min: 0, max: 365, int: true }),
        maxFreezeDays: num({ min: 0, max: 365, int: true }),
        maxFreezeDaysPerYear: num({ min: 0, max: 365, int: true }),
        freezeFee: num({ min: 0, max: MAX_PENALTY_AMOUNT }),
        requiresApproval: z.boolean(),
      }),
      guestPass: z.object({
        passesPerMonth: num({ min: 0, max: 100, int: true }),
        price: num({ min: 0, max: MAX_PENALTY_AMOUNT }),
        durationDays: num({ min: 1, max: 30, int: true }),
        requiresWaiver: z.boolean(),
        mustBeAccompanied: z.boolean(),
        sameGuestCooldownDays: num({ min: 0, max: 365, int: true }),
      }),
      trial: z.object({
        durationDays: num({ min: 0, max: 365, int: true }),
        price: num({ min: 0, max: MAX_PENALTY_AMOUNT }),
        includesClasses: z.boolean(),
        maxClassBookings: num({ min: 0, max: 100, int: true }),
        requiresPaymentMethod: z.boolean(),
        conversionDiscountPercent: num({ min: 0, max: 100 }),
      }),
      membership: z.object({
        gracePeriodDays: num({ min: 0, max: 90, int: true }),
      }),
      payments: z.object({
        acceptCash: z.boolean(),
        acceptCard: z.boolean(),
        acceptPrepaidCredits: z.boolean(),
      }),
      invoice: z.object({
        prefix: z.string().trim().max(10),
        startNumber: num({ min: 1, max: 1_000_000_000, int: true }),
        format: invoiceNumberFormatSchema,
      }),
      tax: z.object({
        enabled: z.boolean(),
        membershipRate: num({ min: 0, max: 100 }),
        classRate: num({ min: 0, max: 100 }),
        productRate: num({ min: 0, max: 100 }),
        serviceRate: num({ min: 0, max: 100 }),
      }),
      refund: z.object({
        mode: refundPolicyModeSchema,
        windowDays: num({ min: 0, max: 365, int: true }),
      }),
      receipt: z.object({
        emailEnabled: z.boolean(),
        printEnabled: z.boolean(),
      }),
      autoRenewal: z.object({
        enabled: z.boolean(),
        retryAttempts: num({ min: 0, max: 10, int: true }),
        retryIntervalDays: num({ min: 0, max: 30, int: true }),
        renewalReminderDays: num({ min: 0, max: 90, int: true }),
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
      business: {
        address: values.business.address.trim() || null,
        phone: values.business.phone.trim() || null,
        email: values.business.email.trim() || null,
        website: values.business.website.trim() || null,
      },
      locale: values.locale,
      hours: values.hours,
      notifications: {
        fromName: values.notifications.fromName.trim() || null,
        fromEmail: values.notifications.fromEmail.trim() || null,
        replyTo: values.notifications.replyTo.trim() || null,
      },
      booking: values.booking,
      noShow: values.noShow,
      freeze: values.freeze,
      guestPass: values.guestPass,
      trial: values.trial,
      membership: values.membership,
      payments: values.payments,
      invoice: values.invoice,
      tax: values.tax,
      refund: values.refund,
      receipt: values.receipt,
      autoRenewal: values.autoRenewal,
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
                <div {...stylex.props(styles.subSection)}>
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

          {section === 'business' ? (
            <SectionCard title={t('business.title')} description={t('business.subtitle')}>
              <div {...stylex.props(styles.stack4)}>
                <TextField
                  name="business.address"
                  label={t('business.addressLabel')}
                  autoComplete="off"
                />
                <div {...stylex.props(styles.grid2)}>
                  <TextField
                    name="business.phone"
                    type="tel"
                    label={t('business.phoneLabel')}
                    autoComplete="off"
                  />
                  <TextField
                    name="business.email"
                    type="email"
                    label={t('business.emailLabel')}
                    autoComplete="off"
                  />
                </div>
                <TextField
                  name="business.website"
                  label={t('business.websiteLabel')}
                  placeholder={t('business.websitePlaceholder')}
                  autoComplete="off"
                />
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
              <div {...stylex.props(styles.stack5col)}>
                <NumberField
                  name="booking.cancellationCutoffHours"
                  label={t('booking.cutoffLabel')}
                  min={0}
                  max={MAX_CANCELLATION_CUTOFF_HOURS}
                  step={1}
                  hint={<BookingHint />}
                  fieldClassName={stylex.props(styles.maxXs).className}
                />
                <div {...stylex.props(styles.grid2)}>
                  <NumberField
                    name="booking.lateCancellationPenalty"
                    label={t('booking.lateCancellationPenaltyLabel')}
                    min={0}
                    max={MAX_PENALTY_AMOUNT}
                    step="any"
                  />
                  <SelectField
                    name="booking.lateCancellationPenaltyType"
                    label={t('booking.penaltyTypeLabel')}
                  >
                    {penaltyTypeSchema.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {t(`penaltyType.${opt}`)}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div {...stylex.props(styles.subSection)}>
                  <p {...stylex.props(styles.legend)}>{t('booking.limitsLegend')}</p>
                  <div {...stylex.props(styles.localeGrid)}>
                    <NumberField
                      name="booking.bookingWindowDays"
                      label={t('booking.bookingWindowLabel')}
                      hint={t('booking.bookingWindowHint')}
                      min={0}
                      max={365}
                      step={1}
                    />
                    <SelectField name="booking.waitlistMode" label={t('booking.waitlistModeLabel')}>
                      {waitlistModeSchema.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {t(`waitlistMode.${opt}`)}
                        </option>
                      ))}
                    </SelectField>
                    <NumberField
                      name="booking.maxBookingsPerDay"
                      label={t('booking.maxPerDayLabel')}
                      hint={t('booking.zeroUnlimited')}
                      min={0}
                      max={100}
                      step={1}
                    />
                    <NumberField
                      name="booking.maxBookingsPerWeek"
                      label={t('booking.maxPerWeekLabel')}
                      hint={t('booking.zeroUnlimited')}
                      min={0}
                      max={500}
                      step={1}
                    />
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {section === 'noShow' ? (
            <SectionCard title={t('noShow.title')} description={t('noShow.subtitle')}>
              <div {...stylex.props(styles.stack5col)}>
                <div {...stylex.props(styles.grid2)}>
                  <NumberField
                    name="noShow.penalty"
                    label={t('noShow.penaltyLabel')}
                    min={0}
                    max={MAX_PENALTY_AMOUNT}
                    step="any"
                  />
                  <SelectField name="noShow.penaltyType" label={t('noShow.penaltyTypeLabel')}>
                    {penaltyTypeSchema.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {t(`penaltyType.${opt}`)}
                      </option>
                    ))}
                  </SelectField>
                  <NumberField
                    name="noShow.penaltyDays"
                    label={t('noShow.penaltyDaysLabel')}
                    hint={t('noShow.penaltyDaysHint')}
                    min={0}
                    max={365}
                    step={1}
                  />
                  <NumberField
                    name="noShow.autoCancelMinutes"
                    label={t('noShow.autoCancelLabel')}
                    hint={t('noShow.autoCancelHint')}
                    min={0}
                    max={240}
                    step={1}
                  />
                </div>
              </div>
            </SectionCard>
          ) : null}

          {section === 'freeze' ? (
            <SectionCard title={t('freeze.title')} description={t('freeze.subtitle')}>
              <div {...stylex.props(styles.stack5col)}>
                <div {...stylex.props(styles.localeGrid)}>
                  <NumberField
                    name="freeze.minFreezeDays"
                    label={t('freeze.minLabel')}
                    hint={t('freeze.zeroNoLimit')}
                    min={0}
                    max={365}
                    step={1}
                  />
                  <NumberField
                    name="freeze.maxFreezeDays"
                    label={t('freeze.maxLabel')}
                    hint={t('freeze.zeroNoLimit')}
                    min={0}
                    max={365}
                    step={1}
                  />
                  <NumberField
                    name="freeze.maxFreezeDaysPerYear"
                    label={t('freeze.perYearLabel')}
                    hint={t('freeze.zeroNoLimit')}
                    min={0}
                    max={365}
                    step={1}
                  />
                  <NumberField
                    name="freeze.freezeFee"
                    label={t('freeze.feeLabel')}
                    min={0}
                    max={MAX_PENALTY_AMOUNT}
                    step="any"
                  />
                </div>
                <div {...stylex.props(styles.switchList)}>
                  <SwitchRow
                    name="freeze.requiresApproval"
                    label={t('freeze.requiresApprovalLabel')}
                    description={t('freeze.requiresApprovalDesc')}
                  />
                </div>
              </div>
            </SectionCard>
          ) : null}

          {section === 'guestPass' ? (
            <SectionCard title={t('guestPass.title')} description={t('guestPass.subtitle')}>
              <div {...stylex.props(styles.stack5col)}>
                <div {...stylex.props(styles.localeGrid)}>
                  <NumberField
                    name="guestPass.passesPerMonth"
                    label={t('guestPass.passesPerMonthLabel')}
                    hint={t('guestPass.zeroDisables')}
                    min={0}
                    max={100}
                    step={1}
                  />
                  <NumberField
                    name="guestPass.price"
                    label={t('guestPass.priceLabel')}
                    min={0}
                    max={MAX_PENALTY_AMOUNT}
                    step="any"
                  />
                  <NumberField
                    name="guestPass.durationDays"
                    label={t('guestPass.durationLabel')}
                    min={1}
                    max={30}
                    step={1}
                  />
                  <NumberField
                    name="guestPass.sameGuestCooldownDays"
                    label={t('guestPass.cooldownLabel')}
                    hint={t('guestPass.cooldownHint')}
                    min={0}
                    max={365}
                    step={1}
                  />
                </div>
                <div {...stylex.props(styles.switchList)}>
                  <SwitchRow
                    name="guestPass.requiresWaiver"
                    label={t('guestPass.requiresWaiverLabel')}
                    description={t('guestPass.requiresWaiverDesc')}
                  />
                  <SwitchRow
                    name="guestPass.mustBeAccompanied"
                    label={t('guestPass.mustBeAccompaniedLabel')}
                    description={t('guestPass.mustBeAccompaniedDesc')}
                  />
                </div>
              </div>
            </SectionCard>
          ) : null}

          {section === 'trial' ? (
            <SectionCard title={t('trial.title')} description={t('trial.subtitle')}>
              <div {...stylex.props(styles.stack5col)}>
                <div {...stylex.props(styles.localeGrid)}>
                  <NumberField
                    name="trial.durationDays"
                    label={t('trial.durationLabel')}
                    hint={t('trial.zeroDisables')}
                    min={0}
                    max={365}
                    step={1}
                  />
                  <NumberField
                    name="trial.price"
                    label={t('trial.priceLabel')}
                    min={0}
                    max={MAX_PENALTY_AMOUNT}
                    step="any"
                  />
                  <NumberField
                    name="trial.maxClassBookings"
                    label={t('trial.maxClassBookingsLabel')}
                    hint={t('trial.zeroUnlimited')}
                    min={0}
                    max={100}
                    step={1}
                  />
                  <NumberField
                    name="trial.conversionDiscountPercent"
                    label={t('trial.conversionDiscountLabel')}
                    min={0}
                    max={100}
                    step="any"
                  />
                </div>
                <div {...stylex.props(styles.switchList)}>
                  <SwitchRow
                    name="trial.includesClasses"
                    label={t('trial.includesClassesLabel')}
                    description={t('trial.includesClassesDesc')}
                  />
                  <SwitchRow
                    name="trial.requiresPaymentMethod"
                    label={t('trial.requiresPaymentLabel')}
                    description={t('trial.requiresPaymentDesc')}
                  />
                </div>
              </div>
            </SectionCard>
          ) : null}

          {section === 'membership' ? (
            <SectionCard title={t('membership.title')} description={t('membership.subtitle')}>
              <NumberField
                name="membership.gracePeriodDays"
                label={t('membership.gracePeriodLabel')}
                hint={t('membership.gracePeriodHint')}
                min={0}
                max={90}
                step={1}
                fieldClassName={stylex.props(styles.maxXs).className}
              />
            </SectionCard>
          ) : null}

          {section === 'payments' ? (
            <SectionCard title={t('payments.title')} description={t('payments.subtitle')}>
              <div {...stylex.props(styles.switchList)}>
                <SwitchRow
                  name="payments.acceptCash"
                  label={t('payments.acceptCashLabel')}
                  description={t('payments.acceptCashDesc')}
                />
                <SwitchRow
                  name="payments.acceptCard"
                  label={t('payments.acceptCardLabel')}
                  description={t('payments.acceptCardDesc')}
                />
                <SwitchRow
                  name="payments.acceptPrepaidCredits"
                  label={t('payments.acceptPrepaidLabel')}
                  description={t('payments.acceptPrepaidDesc')}
                />
              </div>
            </SectionCard>
          ) : null}

          {section === 'invoice' ? (
            <SectionCard title={t('invoice.title')} description={t('invoice.subtitle')}>
              <div {...stylex.props(styles.stack5col)}>
                <div {...stylex.props(styles.grid2)}>
                  <TextField
                    name="invoice.prefix"
                    label={t('invoice.prefixLabel')}
                    autoComplete="off"
                  />
                  <NumberField
                    name="invoice.startNumber"
                    label={t('invoice.startNumberLabel')}
                    min={1}
                    max={1_000_000_000}
                    step={1}
                  />
                </div>
                <SelectField
                  name="invoice.format"
                  label={t('invoice.formatLabel')}
                  hint={<InvoiceHint />}
                  fieldClassName={stylex.props(styles.maxXs).className}
                >
                  {invoiceNumberFormatSchema.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(`invoiceFormat.${opt}`)}
                    </option>
                  ))}
                </SelectField>
              </div>
            </SectionCard>
          ) : null}

          {section === 'tax' ? (
            <SectionCard title={t('tax.title')} description={t('tax.subtitle')}>
              <div {...stylex.props(styles.stack5col)}>
                <div {...stylex.props(styles.switchList)}>
                  <SwitchRow
                    name="tax.enabled"
                    label={t('tax.enabledLabel')}
                    description={t('tax.enabledDesc')}
                  />
                </div>
                <div {...stylex.props(styles.subSection)}>
                  <p {...stylex.props(styles.legend)}>{t('tax.ratesLegend')}</p>
                  <div {...stylex.props(styles.localeGrid)}>
                    <NumberField
                      name="tax.membershipRate"
                      label={t('tax.membershipRateLabel')}
                      min={0}
                      max={100}
                      step="any"
                    />
                    <NumberField
                      name="tax.classRate"
                      label={t('tax.classRateLabel')}
                      min={0}
                      max={100}
                      step="any"
                    />
                    <NumberField
                      name="tax.productRate"
                      label={t('tax.productRateLabel')}
                      min={0}
                      max={100}
                      step="any"
                    />
                    <NumberField
                      name="tax.serviceRate"
                      label={t('tax.serviceRateLabel')}
                      min={0}
                      max={100}
                      step="any"
                    />
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {section === 'refund' ? (
            <SectionCard title={t('refund.title')} description={t('refund.subtitle')}>
              <div {...stylex.props(styles.grid2)}>
                <SelectField name="refund.mode" label={t('refund.modeLabel')}>
                  {refundPolicyModeSchema.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(`refundMode.${opt}`)}
                    </option>
                  ))}
                </SelectField>
                <NumberField
                  name="refund.windowDays"
                  label={t('refund.windowLabel')}
                  hint={t('refund.windowHint')}
                  min={0}
                  max={365}
                  step={1}
                />
              </div>
            </SectionCard>
          ) : null}

          {section === 'receipt' ? (
            <SectionCard title={t('receipt.title')} description={t('receipt.subtitle')}>
              <div {...stylex.props(styles.switchList)}>
                <SwitchRow
                  name="receipt.emailEnabled"
                  label={t('receipt.emailEnabledLabel')}
                  description={t('receipt.emailEnabledDesc')}
                />
                <SwitchRow
                  name="receipt.printEnabled"
                  label={t('receipt.printEnabledLabel')}
                  description={t('receipt.printEnabledDesc')}
                />
              </div>
            </SectionCard>
          ) : null}

          {section === 'autoRenewal' ? (
            <SectionCard title={t('autoRenewal.title')} description={t('autoRenewal.subtitle')}>
              <div {...stylex.props(styles.stack5col)}>
                <div {...stylex.props(styles.switchList)}>
                  <SwitchRow
                    name="autoRenewal.enabled"
                    label={t('autoRenewal.enabledLabel')}
                    description={t('autoRenewal.enabledDesc')}
                  />
                </div>
                <div {...stylex.props(styles.localeGrid)}>
                  <NumberField
                    name="autoRenewal.retryAttempts"
                    label={t('autoRenewal.retryAttemptsLabel')}
                    min={0}
                    max={10}
                    step={1}
                  />
                  <NumberField
                    name="autoRenewal.retryIntervalDays"
                    label={t('autoRenewal.retryIntervalLabel')}
                    min={0}
                    max={30}
                    step={1}
                  />
                  <NumberField
                    name="autoRenewal.renewalReminderDays"
                    label={t('autoRenewal.reminderLabel')}
                    hint={t('autoRenewal.reminderHint')}
                    min={0}
                    max={90}
                    step={1}
                    fieldClassName={stylex.props(styles.spanTwo).className}
                  />
                </div>
              </div>
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
    business: {
      address: settings.business.address ?? '',
      phone: settings.business.phone ?? '',
      email: settings.business.email ?? '',
      website: settings.business.website ?? '',
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
    booking: {
      cancellationCutoffHours: settings.booking.cancellationCutoffHours,
      lateCancellationPenalty: settings.booking.lateCancellationPenalty,
      lateCancellationPenaltyType: settings.booking.lateCancellationPenaltyType,
      bookingWindowDays: settings.booking.bookingWindowDays,
      maxBookingsPerDay: settings.booking.maxBookingsPerDay,
      maxBookingsPerWeek: settings.booking.maxBookingsPerWeek,
      waitlistMode: settings.booking.waitlistMode,
    },
    noShow: {
      penalty: settings.noShow.penalty,
      penaltyType: settings.noShow.penaltyType,
      penaltyDays: settings.noShow.penaltyDays,
      autoCancelMinutes: settings.noShow.autoCancelMinutes,
    },
    freeze: {
      minFreezeDays: settings.freeze.minFreezeDays,
      maxFreezeDays: settings.freeze.maxFreezeDays,
      maxFreezeDaysPerYear: settings.freeze.maxFreezeDaysPerYear,
      freezeFee: settings.freeze.freezeFee,
      requiresApproval: settings.freeze.requiresApproval,
    },
    guestPass: {
      passesPerMonth: settings.guestPass.passesPerMonth,
      price: settings.guestPass.price,
      durationDays: settings.guestPass.durationDays,
      requiresWaiver: settings.guestPass.requiresWaiver,
      mustBeAccompanied: settings.guestPass.mustBeAccompanied,
      sameGuestCooldownDays: settings.guestPass.sameGuestCooldownDays,
    },
    trial: {
      durationDays: settings.trial.durationDays,
      price: settings.trial.price,
      includesClasses: settings.trial.includesClasses,
      maxClassBookings: settings.trial.maxClassBookings,
      requiresPaymentMethod: settings.trial.requiresPaymentMethod,
      conversionDiscountPercent: settings.trial.conversionDiscountPercent,
    },
    membership: { gracePeriodDays: settings.membership.gracePeriodDays },
    payments: {
      acceptCash: settings.payments.acceptCash,
      acceptCard: settings.payments.acceptCard,
      acceptPrepaidCredits: settings.payments.acceptPrepaidCredits,
    },
    invoice: {
      prefix: settings.invoice.prefix,
      startNumber: settings.invoice.startNumber,
      format: settings.invoice.format,
    },
    tax: {
      enabled: settings.tax.enabled,
      membershipRate: settings.tax.membershipRate,
      classRate: settings.tax.classRate,
      productRate: settings.tax.productRate,
      serviceRate: settings.tax.serviceRate,
    },
    refund: { mode: settings.refund.mode, windowDays: settings.refund.windowDays },
    receipt: {
      emailEnabled: settings.receipt.emailEnabled,
      printEnabled: settings.receipt.printEnabled,
    },
    autoRenewal: {
      enabled: settings.autoRenewal.enabled,
      retryAttempts: settings.autoRenewal.retryAttempts,
      retryIntervalDays: settings.autoRenewal.retryIntervalDays,
      renewalReminderDays: settings.autoRenewal.renewalReminderDays,
    },
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
 * A labelled boolean toggle row: title + description on the left, an on/off
 * {@link Switch} on the right, bound to the form by `name` through a `Controller`.
 */
function SwitchRow({
  name,
  label,
  description,
}: {
  name: BoolFieldName;
  label: string;
  description?: string;
}) {
  const { control } = useFormContext<SettingsFormValues>();
  return (
    <div {...stylex.props(styles.switchRow)}>
      <div {...stylex.props(styles.switchText)}>
        <span {...stylex.props(styles.switchLabel)}>{label}</span>
        {description ? <span {...stylex.props(styles.switchDesc)}>{description}</span> : null}
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch checked={Boolean(field.value)} onChange={field.onChange} label={label} />
        )}
      />
    </div>
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

/** A live sample invoice number, reflecting the chosen prefix + format. */
function InvoiceHint() {
  const t = useTranslations('admin.settings');
  const { control } = useFormContext<SettingsFormValues>();
  const prefix = useWatch({ control, name: 'invoice.prefix' });
  const start = useWatch({ control, name: 'invoice.startNumber' });
  const format = useWatch({ control, name: 'invoice.format' });
  const seq = Number.isFinite(start) ? String(Math.trunc(start)).padStart(4, '0') : '0000';
  const pfx = (prefix ?? '').trim() || 'INV';
  const year = new Date().getFullYear();
  const sample =
    format === 'prefix-number'
      ? `${pfx}-${seq}`
      : format === 'year-number'
        ? `${year}-${seq}`
        : `${pfx}-${year}-${seq}`;
  return <>{t('invoice.preview', { sample })}</>;
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
