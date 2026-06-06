'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  GYM_LOGO_MAX_WIDTH,
  LANGUAGE_LABELS,
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
import { finalizeGymLogoAction, requestLogoUploadAction, updateGymSettingsAction } from './actions';

/** Shared field styling, matching the other admin forms. */
const FIELD_CLASS =
  'w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:bg-slate-50 disabled:text-slate-500';

/** Accepted logo MIME types, matching the storage service's extension map. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

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

/**
 * The gym settings form (T4.8). One client component owns all four sections —
 * Brand (name, logo, colours), Locale (language, currency, time zone), Business
 * hours (per-weekday range), and Notifications (sender) — and submits the lot as a
 * single `PATCH /gyms/settings`.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  // Logo upload state.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timezoneOptions = useMemo(() => withCurrent(timeZones(), timezone), [timezone]);
  const currencyOptions = useMemo(() => withCurrent(COMMON_CURRENCIES, currency), [currency]);

  /** Patch one weekday's hours in place. */
  function setDay(day: Weekday, patch: Partial<DayHours>): void {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
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
      setLogoUrl(finalized.data.logoUrl);
      setSaved(false);
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
    setSaved(false);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const input: UpdateGymSettingsInput = {
      brand: { name: name.trim(), logoUrl, primaryColor, secondaryColor },
      locale: { language, currency, timezone },
      hours,
      notifications: {
        fromEmail: fromEmail.trim() || null,
        fromName: fromName.trim() || null,
        replyTo: replyTo.trim() || null,
      },
    };
    startTransition(async () => {
      const result = await updateGymSettingsAction(input);
      if (result.ok) {
        // Resync to the server's normalised truth (e.g. canonical name).
        setName(result.data.brand.name);
        setLogoUrl(result.data.brand.logoUrl);
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-8">
      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Brand
        </legend>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Logo</span>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${name || 'Gym'} logo`}
                className="h-16 w-16 rounded-card border border-slate-200 object-contain"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-card bg-brand-50 text-xs font-semibold text-brand-700">
                No logo
              </span>
            )}
            <div className="flex flex-col gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                onChange={(event) => void onLogoChange(event)}
                disabled={uploading || pending}
                className="text-sm text-slate-600 file:mr-3 file:rounded-card file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 disabled:opacity-50"
              />
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>
                  {uploading
                    ? 'Uploading…'
                    : `JPEG, PNG, WebP or SVG, up to ${GYM_LOGO_MAX_WIDTH}px wide.`}
                </span>
                {logoUrl && !uploading ? (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="font-medium text-slate-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {uploadError ? (
            <p role="alert" className="rounded-card bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {uploadError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="brand-name" className="text-sm font-medium text-slate-700">
            Gym name
          </label>
          <input
            id="brand-name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-wrap gap-6">
          <ColorField
            id="brand-primary"
            label="Primary color"
            value={primaryColor}
            onChange={setPrimaryColor}
          />
          <ColorField
            id="brand-secondary"
            label="Secondary color"
            value={secondaryColor}
            onChange={setSecondaryColor}
          />
        </div>
      </fieldset>

      {/* ── Locale ────────────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Locale
        </legend>

        <div className="flex flex-col gap-1">
          <label htmlFor="locale-language" className="text-sm font-medium text-slate-700">
            Default language
          </label>
          <select
            id="locale-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as GymLanguage)}
            className={FIELD_CLASS}
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="locale-currency" className="text-sm font-medium text-slate-700">
            Currency
          </label>
          <select
            id="locale-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className={FIELD_CLASS}
          >
            {currencyOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="locale-timezone" className="text-sm font-medium text-slate-700">
            Time zone
          </label>
          <select
            id="locale-timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={FIELD_CLASS}
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">
            All displayed times use this zone. Past records keep their original time.
          </span>
        </div>
      </fieldset>

      {/* ── Business hours ────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Business hours
        </legend>
        <p className="text-xs text-slate-400">
          The gym’s default opening hours. New locations start from these.
        </p>
        <div className="mt-1 flex flex-col gap-1.5">
          {WEEKDAYS.map((day) => {
            const value = hours[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm text-slate-600">{WEEKDAY_LABELS[day]}</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={value.closed}
                    onChange={(event) => setDay(day, { closed: event.target.checked })}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                  />
                  Closed
                </label>
                {!value.closed ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                      value={value.open}
                      onChange={(event) => setDay(day, { open: event.target.value })}
                      className="rounded-card border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="time"
                      aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                      value={value.close}
                      onChange={(event) => setDay(day, { close: event.target.value })}
                      className="rounded-card border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Closed all day</span>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* ── Notifications ─────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Notifications
        </legend>
        <p className="text-xs text-slate-400">
          The sender shown on member emails. Leave blank to use the platform default.
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor="notif-from-name" className="text-sm font-medium text-slate-700">
            From name <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="notif-from-name"
            type="text"
            value={fromName}
            onChange={(event) => setFromName(event.target.value)}
            placeholder="e.g. Iron Gym"
            autoComplete="off"
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notif-from-email" className="text-sm font-medium text-slate-700">
            From email <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="notif-from-email"
            type="email"
            value={fromEmail}
            onChange={(event) => setFromEmail(event.target.value)}
            placeholder="hello@yourgym.com"
            autoComplete="off"
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notif-reply-to" className="text-sm font-medium text-slate-700">
            Reply-to <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="notif-reply-to"
            type="email"
            value={replyTo}
            onChange={(event) => setReplyTo(event.target.value)}
            placeholder="support@yourgym.com"
            autoComplete="off"
            className={FIELD_CLASS}
          />
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p role="status" className="rounded-card bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Settings saved.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || uploading}
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-card border border-slate-200 bg-white p-0.5"
        />
        <span className="font-mono text-sm uppercase text-slate-500">{value}</span>
      </div>
    </div>
  );
}
