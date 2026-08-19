'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/button-link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { z } from 'zod';
import {
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  GYM_LOGO_MAX_WIDTH,
  REPORT_CATALOG,
  STAFF_COLUMN_FIELDS,
  STAFF_SECTION_FIELDS,
  WEEKDAYS,
  enabledPaymentMethods,
  formatInvoiceNumber,
  groupReportsBySegment,
  gymReportsSettingsSchema,
  gymStaffDirectorySettingsSchema,
  invoiceNumberFormatSchema,
  isValidDayWindow,
  isValidTimeZone,
  type AdminLocationRow,
  type GymReportsSettings,
  type GymSettings,
  type GymStaffDirectorySettings,
  type InvoiceNumberFormat,
  type ReportToggle,
  type UpdateGymSettingsInput,
  type Weekday,
  type WeeklyHours,
} from '@fit/types';
import { Button, Card, Switch } from '@fit/ui-kit';
import {
  Controller,
  Form,
  Icon,
  fieldErrorText,
  useFormContext,
  useToast,
  useWatch,
  useZodForm,
  type FieldErrors,
  type IconName,
} from '@/components/ui';
import { NumberField, SelectField, TextField } from '@/components/ui/form-fields';
import {
  finalizeGymLogoAction,
  renameLocationAction,
  requestLogoUploadAction,
  updateGymSettingsAction,
} from './actions';

/**
 * Accepted logo MIME types. Narrowed to the two raster formats `pdfkit` can embed,
 * because the logo is drawn on the invoice PDF as well as in the app — accepting a
 * WebP or SVG here would produce a logo that shows on screen but silently vanishes
 * from every invoice.
 */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** `HH:MM` 24-hour time, mirroring the schema pattern in `@fit/types`. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The currencies a gym may price in — GEL (the platform default) and USD. A gym
 * already stored on some other ISO code still sees its own code in the list (via
 * {@link withCurrent}), so opening Settings can never silently re-price it.
 */
const COMMON_CURRENCIES = [DEFAULT_CURRENCY, 'USD'];

/**
 * The zones offered at the top of the picker, before the full IANA list. The
 * console's own market first, then the zones its gyms and their head offices are
 * actually run from — enough that nobody scrolls past `Africa/…` to find home.
 */
const COMMON_TIMEZONES = [
  'Asia/Tbilisi',
  'Europe/Istanbul',
  'Asia/Baku',
  'Asia/Yerevan',
  'Europe/Kyiv',
  'Europe/Moscow',
  'Europe/Berlin',
  'Europe/London',
  'Asia/Dubai',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

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
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
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
    backgroundImage: 'var(--brand-fill-image, none)',
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
  deviceZoneBtn: {
    alignSelf: 'flex-start',
    borderStyle: 'none',
    background: 'none',
    padding: 0,
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
    textDecorationLine: {
      default: 'none',
      ':hover': 'underline',
    },
    color: 'var(--color-text-accent)',
  },
  // Locations card
  locationRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.75rem',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  locationInput: {
    minWidth: '12rem',
    flex: '1 1 16rem',
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
  locationMeta: {
    flexBasis: '100%',
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  locationInactive: {
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  locationError: {
    margin: 0,
    flexBasis: '100%',
    fontSize: '0.75rem',
    color: 'var(--color-error)',
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
  brand: { name: string; logoUrl: string | null };
  business: { address: string; phone: string; email: string; website: string };
  locale: { currency: string; timezone: string };
  hours: WeeklyHours;
  memberIntake: {
    name: boolean;
    surname: boolean;
    email: boolean;
    phone: boolean;
    gender: boolean;
    dateOfBirth: boolean;
    personalId: boolean;
    address: boolean;
    emergencyContact: boolean;
    membershipPlan: boolean;
    paymentMethod: boolean;
    medicalNotes: boolean;
  };
  freeAccount: { enabled: boolean; name: string; description: string };
  staffDirectory: GymStaffDirectorySettings;
  reports: GymReportsSettings;
  payments: { acceptCash: boolean; acceptCard: boolean; acceptPrepaidCredits: boolean };
  invoice: { prefix: string; startNumber: number; format: InvoiceNumberFormat };
  receipt: { emailEnabled: boolean; printEnabled: boolean };
}

/** Every boolean form path — the `name`s {@link SwitchRow} may bind to. */
type BoolFieldName =
  | 'payments.acceptCash'
  | 'payments.acceptCard'
  | 'payments.acceptPrepaidCredits'
  | 'receipt.emailEnabled'
  | 'receipt.printEnabled'
  | 'memberIntake.name'
  | 'memberIntake.surname'
  | 'memberIntake.email'
  | 'memberIntake.phone'
  | 'memberIntake.gender'
  | 'memberIntake.dateOfBirth'
  | 'memberIntake.personalId'
  | 'memberIntake.address'
  | 'memberIntake.emergencyContact'
  | 'memberIntake.membershipPlan'
  | 'memberIntake.paymentMethod'
  | 'memberIntake.medicalNotes'
  | 'freeAccount.enabled'
  | 'staffDirectory.lastName'
  | 'staffDirectory.role'
  | 'staffDirectory.location'
  | 'staffDirectory.email'
  | 'staffDirectory.phone'
  | 'staffDirectory.status'
  | 'staffDirectory.joined'
  | 'staffDirectory.whosWorking'
  | 'staffDirectory.roles'
  | `reports.${ReportToggle}`;

/** The rail sections, in order — each maps onto a slice of the real settings contract. */
type SectionKey =
  | 'general'
  | 'business'
  | 'locations'
  | 'hours'
  | 'membership'
  | 'staff'
  | 'reports'
  | 'payments'
  | 'invoice'
  | 'receipt';

const SECTIONS: { key: SectionKey; icon: IconName }[] = [
  { key: 'general', icon: 'home' },
  { key: 'business', icon: 'phone' },
  { key: 'locations', icon: 'pin' },
  { key: 'hours', icon: 'clock' },
  { key: 'membership', icon: 'shield' },
  { key: 'staff', icon: 'users' },
  { key: 'reports', icon: 'chart' },
  { key: 'payments', icon: 'card' },
  { key: 'invoice', icon: 'tag' },
  { key: 'receipt', icon: 'mail' },
];

/** Which rail section holds the first validation error, so a failed save jumps there. */
function sectionForErrors(errors: FieldErrors<SettingsFormValues>): SectionKey | null {
  if (errors.brand || errors.locale) return 'general';
  if (errors.business) return 'business';
  if (errors.hours) return 'hours';
  if (errors.memberIntake || errors.freeAccount) return 'membership';
  if (errors.staffDirectory) return 'staff';
  if (errors.reports) return 'reports';
  if (errors.payments) return 'payments';
  if (errors.invoice) return 'invoice';
  if (errors.receipt) return 'receipt';
  return null;
}

/**
 * The gym settings form (T2.12 / T12.17), rebuilt to the formacore settings
 * artboard on the shared form kit (T1.7) and extended to gym-admin parity. A
 * section rail (General · Business · Business hours · Booking · No-show · Freeze ·
 * Guest passes · Trials · Membership · Payments · Invoicing ·
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
export function SettingsForm({
  initial,
  locations = [],
}: {
  initial: GymSettings;
  /** The gym's branches, for the Locations card's inline rename. Empty is normal. */
  locations?: AdminLocationRow[];
}) {
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
      // `00:00` closes the day at midnight rather than before it opens — see
      // `isValidDayWindow`. Without it a gym open until midnight had to say 23:59.
      .refine((d) => d.closed || isValidDayWindow(d.open, d.close), {
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
      }),
      business: z.object({
        address: z.string().trim().max(200),
        phone: z.string().trim().max(40),
        email: emailOrEmpty,
        website: z.string().trim().max(200),
      }),
      locale: z.object({
        currency: z.string().regex(/^[A-Z]{3}$/, t('errors.currency')),
        timezone: z.string().refine(isValidTimeZone, t('errors.timezone')),
      }),
      hours: z.object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day }),
      memberIntake: z.object({
        name: z.boolean(),
        surname: z.boolean(),
        email: z.boolean(),
        phone: z.boolean(),
        gender: z.boolean(),
        dateOfBirth: z.boolean(),
        personalId: z.boolean(),
        address: z.boolean(),
        emergencyContact: z.boolean(),
        membershipPlan: z.boolean(),
        paymentMethod: z.boolean(),
        medicalNotes: z.boolean(),
      }),
      // The offer's wording is the gym's own, so both strings may be blank —
      // the member portal falls back to its translated default copy. Only the
      // lengths are enforced, and they mirror the contract's.
      freeAccount: z.object({
        enabled: z.boolean(),
        name: z.string().trim().max(60),
        description: z.string().trim().max(240),
      }),
      // The staff-page toggles are a plain boolean map, so the contract's own
      // schema is the form schema — no field-by-field restatement to drift.
      staffDirectory: gymStaffDirectorySettingsSchema,
      // Same reasoning — the contract's own schema is the form schema.
      reports: gymReportsSettingsSchema,
      // A till that accepts nothing cannot ring up a sale, so the last method
      // standing may not be switched off. The API refuses the same save; checking
      // here means the operator is told before the round trip, on the screen where
      // the switch was just flipped.
      payments: z
        .object({
          acceptCash: z.boolean(),
          acceptCard: z.boolean(),
          acceptPrepaidCredits: z.boolean(),
        })
        .refine((value) => enabledPaymentMethods(value).length > 0, t('payments.noneEnabled')),
      invoice: z.object({
        prefix: z.string().trim().max(10),
        startNumber: num({ min: 1, max: 1_000_000_000, int: true }),
        format: invoiceNumberFormatSchema,
      }),
      receipt: z.object({
        emailEnabled: z.boolean(),
        printEnabled: z.boolean(),
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
      },
      business: {
        address: values.business.address.trim() || null,
        phone: values.business.phone.trim() || null,
        email: values.business.email.trim() || null,
        website: values.business.website.trim() || null,
      },
      locale: values.locale,
      hours: values.hours,
      memberIntake: values.memberIntake,
      freeAccount: values.freeAccount,
      staffDirectory: values.staffDirectory,
      reports: values.reports,
      payments: values.payments,
      invoice: values.invoice,
      receipt: values.receipt,
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
        <span>{t('breadcrumb.home')}</span>
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
                <div {...stylex.props(styles.subSection)}>
                  <p {...stylex.props(styles.legend)}>{t('general.localeLegend')}</p>
                  <div {...stylex.props(styles.localeGrid)}>
                    <SelectField
                      name="locale.currency"
                      label={t('general.currency')}
                      options={currencyOptions.map((code) => ({ value: code, label: code }))}
                    />
                    <TimeZoneField options={timezoneOptions} stored={initial.locale.timezone} />
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

          {section === 'membership' ? (
            <>
              <SectionCard title={t('membership.title')} description={t('membership.subtitle')}>
                <div {...stylex.props(styles.switchList)}>
                  {(
                    [
                      'name',
                      'surname',
                      'email',
                      'phone',
                      'gender',
                      'dateOfBirth',
                      'personalId',
                      'address',
                      'emergencyContact',
                      'membershipPlan',
                      'paymentMethod',
                      'medicalNotes',
                    ] as const
                  ).map((field) => (
                    <SwitchRow
                      key={field}
                      name={`memberIntake.${field}`}
                      label={t(`membership.fields.${field}`)}
                      description={
                        field === 'name' || field === 'email'
                          ? t('membership.requiredWarning')
                          : undefined
                      }
                    />
                  ))}
                </div>
              </SectionCard>

              {/* The free-account offer is the other half of "how someone becomes a
                member here": the intake card is what the DESK collects, this is
                what the public join screen offers. Same section, because a gym
                deciding its membership policy decides both in one sitting. */}
              <SectionCard title={t('freeAccount.title')} description={t('freeAccount.subtitle')}>
                <div {...stylex.props(styles.stack4)}>
                  <SwitchRow
                    name="freeAccount.enabled"
                    label={t('freeAccount.enabledLabel')}
                    description={t('freeAccount.enabledDescription')}
                  />
                  {/* The wording is optional on purpose: a gym can switch the offer
                    on and let the portal's own copy stand, or name it itself. */}
                  <TextField
                    name="freeAccount.name"
                    label={t('freeAccount.nameLabel')}
                    placeholder={t('freeAccount.namePlaceholder')}
                    hint={t('freeAccount.wordingHint')}
                    autoComplete="off"
                  />
                  <TextField
                    name="freeAccount.description"
                    label={t('freeAccount.descriptionLabel')}
                    placeholder={t('freeAccount.descriptionPlaceholder')}
                    autoComplete="off"
                  />
                </div>
              </SectionCard>
            </>
          ) : null}

          {section === 'staff' ? (
            <>
              <SectionCard
                title={t('staff.columns.title')}
                description={t('staff.columns.subtitle')}
              >
                <div {...stylex.props(styles.switchList)}>
                  {STAFF_COLUMN_FIELDS.map((field) => (
                    <SwitchRow
                      key={field}
                      name={`staffDirectory.${field}`}
                      label={t(`staff.fields.${field}`)}
                    />
                  ))}
                </div>
              </SectionCard>
              <SectionCard
                title={t('staff.sections.title')}
                description={t('staff.sections.subtitle')}
              >
                <div {...stylex.props(styles.switchList)}>
                  {STAFF_SECTION_FIELDS.map((field) => (
                    <SwitchRow
                      key={field}
                      name={`staffDirectory.${field}`}
                      label={t(`staff.fields.${field}`)}
                    />
                  ))}
                </div>
              </SectionCard>
            </>
          ) : null}

          {section === 'reports' ? (
            <>
              {groupReportsBySegment(REPORT_CATALOG).map((group) => (
                <SectionCard
                  key={group.segment}
                  title={group.label}
                  description={t(`reports.groupHints.${group.segment}`)}
                >
                  <div {...stylex.props(styles.switchList)}>
                    {group.reports.map((report) => (
                      <SwitchRow
                        key={report.key}
                        name={`reports.${report.key as ReportToggle}`}
                        label={report.name}
                        // The purpose is what a gym decides by — "Refunds detail" alone
                        // does not say whether it is the one they need.
                        description={report.description}
                      />
                    ))}
                  </div>
                </SectionCard>
              ))}
            </>
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
              <PaymentsWarning />
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
                  options={invoiceNumberFormatSchema.options.map((opt) => ({
                    value: opt,
                    label: t(`invoiceFormat.${opt}`),
                  }))}
                />
                {/* The worked example moved out of the field's `hint`: that slot
                    is a string, and this is a rendered sample of the numbering
                    scheme, not a sentence about it. */}
                <InvoiceHint />
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

          {section === 'locations' ? (
            <SectionCard title={t('locations.title')} description={t('locations.subtitle')}>
              <div {...stylex.props(styles.stack4)}>
                <LocationNames locations={locations} />
                <p {...stylex.props(styles.cardDesc)}>{t('locations.description')}</p>
                <div>
                  <ButtonLink
                    href="/locations"
                    variant="primary"
                    size="inline"
                    label={t('locations.cta')}
                  />
                </div>
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
    },
    business: {
      address: settings.business.address ?? '',
      phone: settings.business.phone ?? '',
      email: settings.business.email ?? '',
      website: settings.business.website ?? '',
    },
    locale: {
      currency: settings.locale.currency,
      timezone: settings.locale.timezone,
    },
    hours: settings.hours,
    memberIntake: {
      name: settings.memberIntake.name,
      surname: settings.memberIntake.surname,
      email: settings.memberIntake.email,
      phone: settings.memberIntake.phone,
      gender: settings.memberIntake.gender,
      dateOfBirth: settings.memberIntake.dateOfBirth,
      personalId: settings.memberIntake.personalId,
      address: settings.memberIntake.address,
      emergencyContact: settings.memberIntake.emergencyContact,
      membershipPlan: settings.memberIntake.membershipPlan,
      paymentMethod: settings.memberIntake.paymentMethod,
      medicalNotes: settings.memberIntake.medicalNotes,
    },
    freeAccount: {
      enabled: settings.freeAccount.enabled,
      name: settings.freeAccount.name,
      description: settings.freeAccount.description,
    },
    staffDirectory: settings.staffDirectory,
    reports: settings.reports,
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
    receipt: {
      emailEnabled: settings.receipt.emailEnabled,
      printEnabled: settings.receipt.printEnabled,
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
      <Card padding="none" xstyle={styles.railCard}>
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
    <Card padding="none" xstyle={styles.card}>
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

    // Reject an over-wide logo *before* fetching a signed URL.
    if (typeof createImageBitmap === 'function') {
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

/**
 * This browser's own IANA zone, or `null` when the runtime will not name one.
 *
 * Resolved after mount rather than during render: the server render has no device
 * to ask (it would answer with the *server's* zone), and a value that differs
 * between the two renders is a hydration mismatch.
 */
function useDeviceTimeZone(): string | null {
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setZone(resolved && isValidTimeZone(resolved) ? resolved : null);
    } catch {
      setZone(null);
    }
  }, []);
  return zone;
}

/**
 * The gym's time zone.
 *
 * The IANA database has ~430 zones, and a flat alphabetical list of them is a
 * scroll from `Africa/Abidjan` to wherever the gym actually is. So the picker
 * opens on a short **Suggested** group — this computer's zone, the gym's saved
 * one, the platform default, and the handful this console is actually used from —
 * with the complete list still underneath for everyone else. A one-click "use
 * where you are now" sits below the field while the two differ.
 *
 * The device zone is a suggestion, never an override. The zone every displayed
 * time is rendered in belongs to the *gym*, not to whichever staff laptop is
 * signed in — a manager opening the console from another country must not silently
 * re-stamp the class schedule. So it is offered and the choice stays explicit.
 */
function TimeZoneField({ options, stored }: { options: string[]; stored: string }) {
  const t = useTranslations('admin.settings');
  const { control, setValue } = useFormContext<SettingsFormValues>();
  const current = useWatch({ control, name: 'locale.timezone' });
  const device = useDeviceTimeZone();

  // Keyed off `stored`, not the live field value: the shortlist must not reshuffle
  // under the cursor while the select is open and the user is changing zones.
  const suggested = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tz of [device, stored, DEFAULT_TIMEZONE, ...COMMON_TIMEZONES]) {
      if (!tz || seen.has(tz) || !isValidTimeZone(tz)) continue;
      seen.add(tz);
      out.push(tz);
    }
    return out;
  }, [device, stored]);

  // A zone the browser reports but `Intl.supportedValuesOf` omits still has to be
  // selectable, or the shortcut would set a value with no matching option.
  const list = useMemo(() => (device ? withCurrent(options, device) : options), [options, device]);

  return (
    <div {...stylex.props(styles.spanTwo, styles.stack2)}>
      <SelectField
        name="locale.timezone"
        label={t('general.timezone')}
        hint={t('general.timezoneHint')}
        options={[
          {
            label: t('general.timezoneSuggested'),
            options: suggested.map((tz) => ({ value: tz, label: tz })),
          },
          {
            label: t('general.timezoneAll'),
            options: list.map((tz) => ({ value: tz, label: tz })),
          },
        ]}
      />
      {device && device !== current ? (
        <div>
          <button
            type="button"
            onClick={() => setValue('locale.timezone', device, { shouldDirty: true })}
            {...stylex.props(styles.deviceZoneBtn)}
          >
            {t('general.useDeviceTimezone', { zone: device })}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Locations card's inline rename list: one row per branch, each a name box and
 * a Save that is live only while the name differs from the stored one.
 *
 * Deliberately outside the settings `useZodForm` — a branch name is a
 * `PATCH /admin/locations/:id`, not part of `PATCH /gyms/settings`, so renaming
 * here must not arm the settings save bar (and its Save button is a `type="button"`,
 * since the whole page already sits inside one form). Everything else about a
 * branch — address, hours, photo, status — stays in the full locations manager.
 */
function LocationNames({ locations }: { locations: AdminLocationRow[] }) {
  const t = useTranslations('admin.settings');
  const router = useRouter();
  const { toast } = useToast();
  // Saved names start from the server payload and advance only on a confirmed
  // rename, so each row can tell "edited" from "already stored".
  const [saved, setSaved] = useState<Record<string, string>>(() =>
    Object.fromEntries(locations.map((location) => [location.id, location.name])),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(locations.map((location) => [location.id, location.name])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  if (locations.length === 0) {
    return <p {...stylex.props(styles.cardDesc)}>{t('locations.empty')}</p>;
  }

  async function rename(id: string): Promise<void> {
    const next = (drafts[id] ?? '').trim();
    if (!next || next === saved[id]) return;
    setPendingId(id);
    setErrorId(null);
    try {
      const result = await renameLocationAction(id, next);
      if (result.ok) {
        setSaved((current) => ({ ...current, [id]: result.data.name }));
        setDrafts((current) => ({ ...current, [id]: result.data.name }));
        toast(t('locations.renamed', { name: result.data.name }), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        setErrorId(id);
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div {...stylex.props(styles.stack2)}>
      {locations.map((location) => {
        const draft = drafts[location.id] ?? '';
        const dirty = draft.trim() !== saved[location.id] && draft.trim().length > 0;
        const pending = pendingId === location.id;
        return (
          <div key={location.id} {...stylex.props(styles.locationRow)}>
            <input
              type="text"
              value={draft}
              maxLength={120}
              aria-label={t('locations.nameAria', { name: saved[location.id] ?? location.name })}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [location.id]: event.target.value }))
              }
              // Enter saves the row instead of submitting the settings form around it.
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (dirty && !pending) void rename(location.id);
              }}
              disabled={pending}
              {...stylex.props(styles.locationInput)}
            />
            {location.status === 'INACTIVE' ? (
              <span {...stylex.props(styles.locationInactive)}>{t('locations.inactive')}</span>
            ) : null}
            <Button
              variant="secondary"
              size="inline"
              type="button"
              onClick={() => void rename(location.id)}
              disabled={!dirty || pending}
              icon={<Icon name="check" {...stylex.props(styles.kitGlyph)} />}
              label={pending ? t('locations.renaming') : t('locations.rename')}
            />
            {location.address ? (
              <p {...stylex.props(styles.locationMeta)}>{location.address}</p>
            ) : null}
            {errorId === location.id ? (
              <p role="alert" {...stylex.props(styles.locationError)}>
                {t('locations.renameFailed')}
              </p>
            ) : null}
          </div>
        );
      })}
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
            <span {...stylex.props(styles.timeDash)}>-</span>
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

/**
 * The payments section's own rule: a till that accepts nothing cannot ring up a
 * sale, so the last method standing may not be switched off.
 *
 * Watched live rather than read off the submit-time zod error, because the rule
 * constrains the group and not any one switch: it must appear the moment the last
 * one goes off, and clear the moment one comes back — neither of which a
 * field-keyed error would do. The schema refuses the save regardless.
 */
function PaymentsWarning() {
  const t = useTranslations('admin.settings');
  const { control } = useFormContext<SettingsFormValues>();
  const payments = useWatch({ control, name: 'payments' });
  if (!payments || enabledPaymentMethods(payments).length > 0) {
    return null;
  }
  return <p {...stylex.props(styles.dayError)}>{t('payments.noneEnabled')}</p>;
}

/**
 * A live sample invoice number, reflecting the chosen prefix + format.
 *
 * Built with the API's own {@link formatInvoiceNumber} rather than a copy of the rule,
 * so the sample shown here is the reference the next invoice is actually stamped with.
 */
function InvoiceHint() {
  const t = useTranslations('admin.settings');
  const { control } = useFormContext<SettingsFormValues>();
  const prefix = useWatch({ control, name: 'invoice.prefix' });
  const start = useWatch({ control, name: 'invoice.startNumber' });
  const format = useWatch({ control, name: 'invoice.format' });
  const seq = Number.isFinite(start) ? Math.trunc(start) : 0;
  const sample = formatInvoiceNumber(new Date().getFullYear(), seq, {
    prefix: prefix ?? '',
    format,
  });
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
        <Button
          variant="primary"
          size="inline"
          type="submit"
          disabled={isSubmitting}
          icon={<Icon name="check" {...stylex.props(styles.kitGlyph)} />}
          label={isSubmitting ? t('saveBar.saving') : t('saveBar.save')}
        />
      </div>
    </div>
  );
}
