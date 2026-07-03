'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  Card,
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

/** Compact time-input styling for the business-hours editor. */
const TIME_CLASS =
  'h-10 rounded-field border border-ink-200 bg-white px-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white';

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
      className="flex flex-col gap-6 pb-24"
    >
      <nav
        aria-label={t('breadcrumb.label')}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
      >
        <span>Iron Gym</span>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <span className="text-ink-600 dark:text-ink-300">{t('breadcrumb.settings')}</span>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[230px_1fr]">
        <SectionRail section={section} onSelect={setSection} />

        <div className="min-w-0">
          {section === 'general' ? (
            <SectionCard title={t('general.title')} description={t('general.subtitle')}>
              <div className="flex flex-col gap-5">
                <LogoField />
                <TextField
                  name="brand.name"
                  label={t('general.nameLabel')}
                  autoComplete="off"
                  required
                />
                <div className="flex flex-wrap gap-6">
                  <ColorField name="brand.primaryColor" label={t('general.primaryColor')} />
                  <ColorField name="brand.secondaryColor" label={t('general.secondaryColor')} />
                </div>
                <div className="border-t border-ink-100 pt-5 dark:border-white/10">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    {t('general.localeLegend')}
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      fieldClassName="sm:col-span-2"
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
              <div className="flex flex-col gap-2">
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
                fieldClassName="max-w-xs"
              />
            </SectionCard>
          ) : null}

          {section === 'notifications' ? (
            <SectionCard title={t('notifications.title')} description={t('notifications.subtitle')}>
              <div className="flex flex-col gap-4">
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
    <div className="h-fit lg:sticky lg:top-[88px]">
      <Card className="p-1.5">
        <div className="flex flex-col gap-0.5">
          {SECTIONS.map((item) => {
            const active = section === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex h-11 items-center gap-3 rounded-btn px-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_6px_20px_-8px_rgba(124,58,237,0.8)]'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
                }`}
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" sw={2} />
                <span className="flex-1 text-left">{t(`sections.${item.key}`)}</span>
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
    <Card className="p-5 sm:p-6">
      <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
        {title}
      </h3>
      <p className="mb-5 mt-0.5 text-sm text-ink-500 dark:text-ink-400">{description}</p>
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
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{t('logo.label')}</span>
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={t('logo.alt', { name: name || t('logo.fallbackName') })}
            className="h-16 w-16 rounded-card border border-ink-200 object-contain dark:border-white/10"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-card bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            {t('logo.none')}
          </span>
        )}
        <div className="flex flex-col gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={(event) => void onLogoChange(event)}
            disabled={disabled}
            className="text-sm text-ink-600 file:mr-3 file:rounded-btn file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 disabled:opacity-50 dark:text-ink-300 dark:file:bg-brand-500/10 dark:file:text-brand-300 dark:hover:file:bg-brand-500/20"
          />
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span>
              {uploading ? t('logo.uploading') : t('logo.hint', { max: GYM_LOGO_MAX_WIDTH })}
            </span>
            {logoUrl && !uploading ? (
              <button
                type="button"
                onClick={() => setValue('brand.logoUrl', null, { shouldDirty: true })}
                className="font-medium text-ink-500 hover:text-danger-600 dark:text-ink-400"
              >
                {t('logo.remove')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {uploadError ? (
        <p
          role="alert"
          className="rounded-card bg-warning-50 px-3 py-2 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-300"
        >
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-700 dark:text-ink-200">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          {...register(name)}
          className="h-11 w-14 cursor-pointer rounded-field border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
        />
        <span className="font-mono text-sm uppercase text-ink-500 dark:text-ink-400">{value}</span>
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
    <div className="rounded-card bg-ink-50 p-3 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`w-24 shrink-0 text-sm font-semibold ${
            closed ? 'text-ink-400' : 'text-ink-900 dark:text-white'
          }`}
        >
          {label}
        </span>
        {closed ? (
          <span className="flex-1 text-sm text-ink-400">{t('hours.closed')}</span>
        ) : (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="time"
              aria-label={t('hours.openAria', { day: label })}
              {...register(`hours.${day}.open`)}
              className={TIME_CLASS}
            />
            <span className="text-ink-400">—</span>
            <input
              type="time"
              aria-label={t('hours.closeAria', { day: label })}
              {...register(`hours.${day}.close`)}
              className={TIME_CLASS}
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-500 dark:text-ink-400">{t('hours.open')}</span>
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
      {closeError ? (
        <p className="mt-2 text-xs font-medium text-danger-600 dark:text-danger-400">
          {closeError}
        </p>
      ) : null}
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
      className={`fixed bottom-5 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${
        isDirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <div className="flex items-center gap-3 rounded-card bg-ink-900 py-2.5 pl-4 pr-2.5 text-white shadow-[0_24px_60px_-16px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
        <span className="relative grid h-2.5 w-2.5 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-warning-400 opacity-60" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-warning-400" />
        </span>
        <span className="text-sm font-medium text-ink-200">{t('saveBar.unsaved')}</span>
        <div className="mx-0.5 h-5 w-px bg-white/15" />
        <button
          type="button"
          onClick={() => reset()}
          disabled={isSubmitting}
          className="h-9 rounded-btn px-3 text-sm font-semibold text-ink-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
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
