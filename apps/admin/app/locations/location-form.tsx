'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  type DayHours,
  type LocationHours,
  type LocationStatus,
  type Weekday,
} from '@fit/types';
import {
  createLocationAction,
  requestLocationPhotoUploadAction,
  updateLocationAction,
} from './actions';

/** Selectable initial statuses when creating (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: LocationStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:bg-slate-50 disabled:text-slate-500';

/** Accepted image MIME types for the photo, matching the storage service map. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** A single open 09:00–17:00 day, the create default for every weekday. */
const DEFAULT_DAY: DayHours = { closed: false, open: '09:00', close: '17:00' };

/** Build a full open-week default for the create flow. */
function defaultHours(): LocationHours {
  return WEEKDAYS.reduce((acc, day) => {
    acc[day] = { ...DEFAULT_DAY };
    return acc;
  }, {} as LocationHours);
}

type Initial = {
  name: string;
  address: string;
  phone: string | null;
  photoUrl: string | null;
  amenities: string[];
  hours: LocationHours;
};

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      locationId: string;
      initial: Initial;
    };

/**
 * The create / edit location form (T4.5). One component serves both flows. Beyond
 * the profile fields (name, address, phone, amenities) it owns the weekly opening
 * hours editor and the photo upload: the chosen image is uploaded straight to R2
 * via a presigned `PUT` (minted by {@link requestLocationPhotoUploadAction}), and
 * only the resulting public URL is persisted. Upload failure (e.g. storage not
 * configured) is non-fatal — the location can still be saved without a photo. On
 * success it navigates to the location's detail page; the discriminated
 * `ActionResult` surfaces any API error inline without throwing across the Server
 * Action boundary.
 */
export function LocationForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const initial: Initial = isEdit
    ? props.initial
    : { name: '', address: '', phone: null, photoUrl: null, amenities: [], hours: defaultHours() };

  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [amenities, setAmenities] = useState(initial.amenities.join(', '));
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.photoUrl);
  const [status, setStatus] = useState<LocationStatus>('ACTIVE');
  const [hours, setHours] = useState<LocationHours>(initial.hours);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Parse the comma-separated amenities box into a clean tag list. */
  function parseAmenities(): string[] {
    return amenities
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  /** Patch one weekday's hours in place. */
  function setDay(day: Weekday, patch: Partial<DayHours>): void {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  /** Upload a chosen image to R2 via a presigned PUT, then store its public URL. */
  async function onPhotoChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError('Choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setUploadError('That image is larger than 5 MB. Choose a smaller file.');
      return;
    }

    setUploading(true);
    try {
      const signed = await requestLocationPhotoUploadAction({
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
      if (!signed.data.publicUrl) {
        setUploadError(
          'The photo uploaded but has no public URL configured. Saved without a photo.',
        );
        return;
      }
      setPhotoUrl(signed.data.publicUrl);
    } catch {
      setUploadError('Could not upload the photo. Check your connection and try again.');
    } finally {
      setUploading(false);
      // Allow re-selecting the same file after an error.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removePhoto(): void {
    setPhotoUrl(null);
    setUploadError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    const profile = {
      name,
      address,
      phone: phone.trim() ? phone.trim() : null,
      photoUrl,
      amenities: parseAmenities(),
      hours,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateLocationAction(props.locationId, profile)
        : await createLocationAction({ ...profile, status });
      if (result.ok) {
        router.push(`/locations/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/locations/${props.locationId}` : '/locations';

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      {/* Photo. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Photo</span>
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`${name || 'Location'} photo`}
              className="h-16 w-24 rounded-card object-cover"
            />
          ) : (
            <span className="flex h-16 w-24 items-center justify-center rounded-card bg-brand-50 text-xs font-semibold text-brand-700">
              No photo
            </span>
          )}
          <div className="flex flex-col gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              onChange={(event) => void onPhotoChange(event)}
              disabled={uploading || pending}
              className="text-sm text-slate-600 file:mr-3 file:rounded-card file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 disabled:opacity-50"
            />
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{uploading ? 'Uploading…' : 'JPEG, PNG, WebP or GIF, up to 5 MB.'}</span>
              {photoUrl && !uploading ? (
                <button
                  type="button"
                  onClick={removePhoto}
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
        <label htmlFor="location-name" className="text-sm font-medium text-slate-700">
          Name
        </label>
        <input
          id="location-name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="location-address" className="text-sm font-medium text-slate-700">
          Address <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="location-address"
          name="address"
          type="text"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="e.g. 12 Rustaveli Ave, Tbilisi"
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="location-phone" className="text-sm font-medium text-slate-700">
          Phone <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="location-phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+995 32 200 0000"
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="location-amenities" className="text-sm font-medium text-slate-700">
          Amenities <span className="font-normal text-slate-400">(comma separated)</span>
        </label>
        <input
          id="location-amenities"
          name="amenities"
          type="text"
          value={amenities}
          onChange={(event) => setAmenities(event.target.value)}
          placeholder="Sauna, Pool, Parking, Lockers"
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      {/* Weekly opening hours. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">Opening hours</legend>
        <div className="flex flex-col gap-1.5">
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

      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="location-status" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="location-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as LocationStatus)}
            className={FIELD_CLASS}
          >
            {CREATE_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || uploading}
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create location'}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
