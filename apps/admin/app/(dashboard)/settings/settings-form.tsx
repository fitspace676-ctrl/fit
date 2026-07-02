'use client';

import { useMemo, useRef, useState, useTransition, type ReactNode, type SVGProps } from 'react';
import { useRouter } from 'next/navigation';
import {
  GYM_LOGO_MAX_WIDTH,
  LANGUAGE_LABELS,
  MAX_CANCELLATION_CUTOFF_HOURS,
  SUPPORTED_LANGUAGES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type DayHours,
  type GymLanguage,
  type GymSettings,
  type UpdateGymSettingsInput,
  type Weekday,
  type WeeklyHours,
} from '@fit/types';
import { Btn, Card, Icon, Switch, useToast, type IconName } from '@/components/ui';
import { finalizeGymLogoAction, requestLogoUploadAction, updateGymSettingsAction } from './actions';

/* -------------------------------------------------------------------------- */
/*  Design tokens (from the settings artboard)                                 */
/* -------------------------------------------------------------------------- */

/** The design's field label: an uppercase micro label above each input. */
const LABEL_CLASS =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400';

/** The design's soft input: ink-50 fill + inset ring, brand ring on focus. */
const FIELD_CLASS =
  'h-11 w-full rounded-field bg-ink-50 px-3.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 outline-none transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500 disabled:opacity-50 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500';

/** Selects share the field look with tighter padding + native colour scheme. */
const SELECT_CLASS =
  'h-11 w-full rounded-field bg-ink-50 px-3 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 outline-none transition focus:ring-2 focus:ring-brand-500 [color-scheme:light] dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:[color-scheme:dark]';

/** Compact time input for the business-hours rows. */
const TIME_CLASS =
  'h-9 rounded-field bg-ink-50 px-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 outline-none transition focus:ring-2 focus:ring-brand-500 [color-scheme:light] dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:[color-scheme:dark]';

/** The design's "soft" inner row (business-hours rows, switch rows). */
const SOFT_ROW_CLASS =
  'rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10';

/** Small helper copy under a field. */
const HINT_CLASS = 'mt-1.5 block text-[11px] text-ink-400 dark:text-ink-500';

/** Icons this screen needs that the shared set lacks (paths from the design). */
const LOCAL_ICONS = {
  store: 'M3 9l1.2-5h15.6L21 9M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M3 9h18M9 20v-6h6v6',
  upload: 'M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
} as const;

/** Render one of the screen-local stroke icons on the shared 24×24 grid. */
function LocalIcon({
  d,
  className = 'h-5 w-5',
  sw = 2,
  ...rest
}: { d: string; sw?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sections                                                                   */
/* -------------------------------------------------------------------------- */

type SectionKey = 'general' | 'hours' | 'booking' | 'notifications';

/**
 * The section rail. Only design sections with real backend fields are listed —
 * the artboard's Payments and Integrations sections have no data source yet.
 */
const SECTIONS: ReadonlyArray<{
  key: SectionKey;
  label: string;
  icon: IconName | null;
  /** Local path when the shared icon set has no match. */
  localIcon?: string;
}> = [
  { key: 'general', label: 'General', icon: null, localIcon: LOCAL_ICONS.store },
  { key: 'hours', label: 'Business hours', icon: 'clock' },
  { key: 'booking', label: 'Booking rules', icon: 'calendar' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
];

/** Accepted logo MIME types, matching the storage service's extension map. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Common currencies for the picker; the gym's current code is always included. */
const COMMON_CURRENCIES = ['GEL', 'USD', 'EUR', 'GBP', 'RUB', 'TRY', 'AMD', 'AZN', 'UAH'];

/** Preset cancellation-cutoff choices (hours); the stored value is always added. */
const CUTOFF_PRESETS = [0, 1, 2, 4, 6, 12, 24, 48, 72, MAX_CANCELLATION_CUTOFF_HOURS];

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

/** Human label for a cutoff option, in the design's "N hours before" voice. */
function cutoffLabel(hours: number): string {
  if (hours === 0) return 'No cutoff';
  if (hours === 1) return '1 hour before';
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} days before`;
  return `${hours} hours before`;
}

/**
 * The gym settings form (T4.8). One client component owns the section rail and
 * all four data-backed sections — General (name, logo, colours, locale), Business
 * hours (per-weekday range), Booking rules (cancellation cutoff), and
 * Notifications (email sender) — and submits the lot as a single
 * `PATCH /gyms/settings` from the floating "Unsaved changes" save bar.
 *
 * The logo is uploaded straight to R2 via a presigned `PUT` (minted by {@link
 * requestLogoUploadAction}); before the PUT the chosen image's dimensions are
 * checked with `createImageBitmap()` and anything wider than {@link
 * GYM_LOGO_MAX_WIDTH}px is rejected client-side, so an oversized logo never even
 * reaches storage. On a successful upload the API persists the logo immediately
 * (`finalizeGymLogoAction`) and the URL is folded into the form state so the next
 * Save keeps it. The discriminated `ActionResult` surfaces any API error inline
 * without throwing across the Server Action boundary.
 */
export function SettingsForm({ initial }: { initial: GymSettings }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>('general');

  // The last server-confirmed settings — Discard resets to this snapshot.
  const [baseline, setBaseline] = useState(initial);
  const [dirty, setDirty] = useState(false);

  // Brand.
  const [name, setName] = useState(initial.brand.name);
  const [primaryColor, setPrimaryColor] = useState(initial.brand.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initial.brand.secondaryColor);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.brand.logoUrl);

  // Locale.
  const [language, setLanguage] = useState<GymLanguage>(initial.locale.language);
  const [currency, setCurrency] = useState(initial.locale.currency);
  const [timezone, setTimezone] = useState(initial.locale.timezone);

  // Business hours.
  const [hours, setHours] = useState<WeeklyHours>(initial.hours);

  // Notifications.
  const [fromEmail, setFromEmail] = useState(initial.notifications.fromEmail ?? '');
  const [fromName, setFromName] = useState(initial.notifications.fromName ?? '');
  const [replyTo, setReplyTo] = useState(initial.notifications.replyTo ?? '');

  // Booking policy.
  const [cancellationCutoffHours, setCancellationCutoffHours] = useState(
    initial.booking.cancellationCutoffHours,
  );

  // Logo upload state.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timezoneOptions = useMemo(() => withCurrent(timeZones(), timezone), [timezone]);
  const currencyOptions = useMemo(() => withCurrent(COMMON_CURRENCIES, currency), [currency]);
  const cutoffOptions = useMemo(
    () => [...new Set([...CUTOFF_PRESETS, cancellationCutoffHours])].sort((a, b) => a - b),
    [cancellationCutoffHours],
  );

  /** Mark the form dirty so the floating save bar appears. */
  function touch(): void {
    setDirty(true);
  }

  /** Patch one weekday's hours in place. */
  function setDay(day: Weekday, patch: Partial<DayHours>): void {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
    touch();
  }

  /** Reset every field to the last server-confirmed snapshot. */
  function discard(): void {
    setName(baseline.brand.name);
    setPrimaryColor(baseline.brand.primaryColor);
    setSecondaryColor(baseline.brand.secondaryColor);
    setLogoUrl(baseline.brand.logoUrl);
    setLanguage(baseline.locale.language);
    setCurrency(baseline.locale.currency);
    setTimezone(baseline.locale.timezone);
    setHours(baseline.hours);
    setFromEmail(baseline.notifications.fromEmail ?? '');
    setFromName(baseline.notifications.fromName ?? '');
    setReplyTo(baseline.notifications.replyTo ?? '');
    setCancellationCutoffHours(baseline.booking.cancellationCutoffHours);
    setError(null);
    setDirty(false);
  }

  /** Upload a chosen logo to R2 via a presigned PUT, after a client-side dimension check. */
  async function onLogoChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError('Choose a JPEG, PNG, WebP, or SVG image.');
      resetFileInput();
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadError('That image is larger than 2 MB. Choose a smaller file.');
      resetFileInput();
      return;
    }

    // Reject an over-wide logo *before* fetching a signed URL or uploading bytes.
    // SVGs have no intrinsic raster width, so the dimension check only applies to
    // bitmap formats.
    if (file.type !== 'image/svg+xml' && typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        const { width } = bitmap;
        bitmap.close();
        if (width > GYM_LOGO_MAX_WIDTH) {
          setUploadError(
            `That image is ${width}px wide. Use a logo no wider than ${GYM_LOGO_MAX_WIDTH}px.`,
          );
          resetFileInput();
          return;
        }
      } catch {
        setUploadError('Could not read that image. Try a different file.');
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
        setUploadError(`Upload failed (${put.status}). Please try again.`);
        return;
      }
      const finalized = await finalizeGymLogoAction(signed.data.key);
      if (!finalized.ok) {
        setUploadError(finalized.error);
        return;
      }
      // The API persisted the logo already, so fold it into the baseline too —
      // the new logo is saved state, not an unsaved change.
      setLogoUrl(finalized.data.logoUrl);
      setBaseline((prev) => ({
        ...prev,
        brand: { ...prev.brand, logoUrl: finalized.data.logoUrl },
      }));
      toast('Logo updated');
    } catch {
      setUploadError('Could not upload the logo. Check your connection and try again.');
    } finally {
      setUploading(false);
      resetFileInput();
    }
  }

  function resetFileInput(): void {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeLogo(): void {
    setLogoUrl(null);
    setUploadError(null);
    touch();
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    const input: UpdateGymSettingsInput = {
      brand: { name: name.trim(), logoUrl, primaryColor, secondaryColor },
      locale: { language, currency, timezone },
      hours,
      notifications: {
        fromEmail: fromEmail.trim() || null,
        fromName: fromName.trim() || null,
        replyTo: replyTo.trim() || null,
      },
      booking: { cancellationCutoffHours },
    };
    startTransition(async () => {
      const result = await updateGymSettingsAction(input);
      if (result.ok) {
        // Resync to the server's normalised truth (e.g. canonical name).
        setName(result.data.brand.name);
        setLogoUrl(result.data.brand.logoUrl);
        setBaseline(result.data);
        setDirty(false);
        toast('Settings saved');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[230px_1fr]">
      {/* ── Section rail ──────────────────────────────────────────────────── */}
      <div className="h-fit lg:sticky lg:top-[88px]">
        <Card glow className="p-1.5">
          {SECTIONS.map((s) => {
            const active = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setSection(s.key)}
                className={`flex h-11 w-full items-center gap-3 rounded-btn px-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_6px_20px_-8px_rgba(124,58,237,0.8)]'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
                }`}
              >
                {s.icon ? (
                  <Icon name={s.icon} className="h-[18px] w-[18px]" sw={2} />
                ) : (
                  <LocalIcon d={s.localIcon ?? ''} className="h-[18px] w-[18px]" sw={2} />
                )}
                <span className="flex-1 text-left">{s.label}</span>
              </button>
            );
          })}
        </Card>
      </div>

      {/* ── Section content ───────────────────────────────────────────────── */}
      <form onSubmit={onSubmit} className="min-w-0 space-y-5">
        {section === 'general' && (
          <SectionCard title="Gym profile" desc="Public details shown to members.">
            {/* Logo */}
            <div className="mb-5 flex items-center gap-4">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${name || 'Gym'} logo`}
                  className="h-16 w-16 shrink-0 rounded-card bg-white object-contain ring-1 ring-ink-200 dark:bg-white/[0.04] dark:ring-white/10"
                />
              ) : (
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-card bg-[linear-gradient(135deg,#7C3AED,#EC4899)] shadow-[0_8px_30px_-6px_rgba(124,58,237,0.8)]">
                  <Icon name="bolt" className="h-8 w-8 text-white" sw={2.1} />
                </span>
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  onChange={(event) => void onLogoChange(event)}
                  disabled={uploading || pending}
                  className="sr-only"
                />
                <Btn
                  v="outline"
                  size="sm"
                  disabled={uploading || pending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <LocalIcon d={LOCAL_ICONS.upload} className="h-4 w-4" sw={2.1} />
                  {uploading ? 'Uploading…' : 'Upload logo'}
                </Btn>
                <p className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-400 dark:text-ink-500">
                  <span>{`PNG, SVG, JPEG or WebP · up to 2MB · max ${GYM_LOGO_MAX_WIDTH}px wide`}</span>
                  {logoUrl && !uploading ? (
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="font-semibold text-ink-500 transition hover:text-danger-600 dark:text-ink-400 dark:hover:text-danger-300"
                    >
                      Remove
                    </button>
                  ) : null}
                </p>
              </div>
            </div>
            {uploadError ? (
              <p
                role="alert"
                className="mb-5 rounded-card bg-warning-50 px-3 py-2 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-300"
              >
                {uploadError}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="brand-name" className={LABEL_CLASS}>
                  Gym name
                </label>
                <input
                  id="brand-name"
                  type="text"
                  required
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    touch();
                  }}
                  autoComplete="off"
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label htmlFor="locale-language" className={LABEL_CLASS}>
                  Default language
                </label>
                <select
                  id="locale-language"
                  value={language}
                  onChange={(event) => {
                    setLanguage(event.target.value as GymLanguage);
                    touch();
                  }}
                  className={SELECT_CLASS}
                >
                  {SUPPORTED_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="locale-timezone" className={LABEL_CLASS}>
                  Timezone
                </label>
                <select
                  id="locale-timezone"
                  value={timezone}
                  onChange={(event) => {
                    setTimezone(event.target.value);
                    touch();
                  }}
                  className={SELECT_CLASS}
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <span className={HINT_CLASS}>
                  All displayed times use this zone. Past records keep their original time.
                </span>
              </div>

              <div>
                <label htmlFor="locale-currency" className={LABEL_CLASS}>
                  Default currency
                </label>
                <select
                  id="locale-currency"
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    touch();
                  }}
                  className={SELECT_CLASS}
                >
                  {currencyOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>

              <ColorField
                id="brand-primary"
                label="Primary color"
                value={primaryColor}
                onChange={(value) => {
                  setPrimaryColor(value);
                  touch();
                }}
              />
              <ColorField
                id="brand-secondary"
                label="Secondary color"
                value={secondaryColor}
                onChange={(value) => {
                  setSecondaryColor(value);
                  touch();
                }}
              />
            </div>
          </SectionCard>
        )}

        {section === 'hours' && (
          <SectionCard title="Business hours" desc="When members can check in and book classes.">
            <div className="space-y-2">
              {WEEKDAYS.map((day) => {
                const value = hours[day];
                return (
                  <div key={day} className={`flex items-center gap-3 p-3 ${SOFT_ROW_CLASS}`}>
                    <span
                      className={`w-24 shrink-0 text-sm font-semibold ${
                        value.closed
                          ? 'text-ink-400 dark:text-ink-500'
                          : 'text-ink-900 dark:text-white'
                      }`}
                    >
                      {WEEKDAY_LABELS[day]}
                    </span>
                    {value.closed ? (
                      <span className="flex-1 text-sm text-ink-400 dark:text-ink-500">Closed</span>
                    ) : (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="time"
                          aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                          value={value.open}
                          onChange={(event) => setDay(day, { open: event.target.value })}
                          className={TIME_CLASS}
                        />
                        <span className="text-ink-400 dark:text-ink-500">—</span>
                        <input
                          type="time"
                          aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                          value={value.close}
                          onChange={(event) => setDay(day, { close: event.target.value })}
                          className={TIME_CLASS}
                        />
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-ink-500 dark:text-ink-400">Open</span>
                      <Switch
                        checked={!value.closed}
                        onChange={(next) => setDay(day, { closed: !next })}
                        label={`${WEEKDAY_LABELS[day]} open`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {section === 'booking' && (
          <SectionCard title="Booking rules" desc="How members reserve and cancel classes.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="booking-cutoff" className={LABEL_CLASS}>
                  Cancellation window
                </label>
                <select
                  id="booking-cutoff"
                  value={cancellationCutoffHours}
                  onChange={(event) => {
                    setCancellationCutoffHours(Number(event.target.value));
                    touch();
                  }}
                  className={SELECT_CLASS}
                >
                  {cutoffOptions.map((h) => (
                    <option key={h} value={h}>
                      {cutoffLabel(h)}
                    </option>
                  ))}
                </select>
                <span className={HINT_CLASS}>
                  {cancellationCutoffHours > 0
                    ? `Members can't cancel a booked spot within ${cancellationCutoffHours} hour${cancellationCutoffHours === 1 ? '' : 's'} of the class. Leaving a waitlist is always allowed.`
                    : 'No cutoff — members can cancel right up to the class start.'}
                </span>
              </div>
            </div>
          </SectionCard>
        )}

        {section === 'notifications' && (
          <SectionCard
            title="Notifications"
            desc="The sender shown on member emails. Leave blank to use the platform default."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="notif-from-name" className={LABEL_CLASS}>
                  From name
                </label>
                <input
                  id="notif-from-name"
                  type="text"
                  value={fromName}
                  onChange={(event) => {
                    setFromName(event.target.value);
                    touch();
                  }}
                  placeholder="e.g. Iron Gym"
                  autoComplete="off"
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label htmlFor="notif-from-email" className={LABEL_CLASS}>
                  From email
                </label>
                <input
                  id="notif-from-email"
                  type="email"
                  value={fromEmail}
                  onChange={(event) => {
                    setFromEmail(event.target.value);
                    touch();
                  }}
                  placeholder="hello@yourgym.com"
                  autoComplete="off"
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label htmlFor="notif-reply-to" className={LABEL_CLASS}>
                  Reply-to
                </label>
                <input
                  id="notif-reply-to"
                  type="email"
                  value={replyTo}
                  onChange={(event) => {
                    setReplyTo(event.target.value);
                    touch();
                  }}
                  placeholder="support@yourgym.com"
                  autoComplete="off"
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          </SectionCard>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-card bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-300"
          >
            {error}
          </p>
        ) : null}

        {/* ── Floating save bar (appears on any change) ─────────────────────── */}
        <div
          className={`fixed bottom-5 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${
            dirty || pending
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-4 opacity-0'
          }`}
        >
          <div className="flex items-center gap-3 rounded-card bg-ink-900 py-2.5 pl-4 pr-2.5 text-white shadow-[0_24px_60px_-16px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
            <span className="relative grid h-2.5 w-2.5 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-warning-400 opacity-60" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-warning-400" />
            </span>
            <span className="text-sm font-medium text-ink-200">Unsaved changes</span>
            <div className="mx-0.5 h-5 w-px bg-white/15" />
            <button
              type="button"
              onClick={discard}
              disabled={pending}
              className="h-9 rounded-btn px-3 text-sm font-semibold text-ink-300 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
            >
              Discard
            </button>
            <Btn type="submit" v="primary" size="sm" icon="check" disabled={pending || uploading}>
              {pending ? 'Saving…' : 'Save changes'}
            </Btn>
          </div>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                            */
/* -------------------------------------------------------------------------- */

/** One settings section card: design title + subtitle over the section body. */
function SectionCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <Card glow className="p-5 sm:p-6">
      <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
        {title}
      </h3>
      <p className="mb-5 mt-0.5 text-sm text-ink-500 dark:text-ink-400">{desc}</p>
      {children}
    </Card>
  );
}

/** A paired colour-picker + hex readout for a single brand colour. */
function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-14 cursor-pointer rounded-field bg-ink-50 p-1 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.04] dark:ring-white/10"
        />
        <span className="font-mono text-sm uppercase text-ink-500 dark:text-ink-400">{value}</span>
      </div>
    </div>
  );
}
