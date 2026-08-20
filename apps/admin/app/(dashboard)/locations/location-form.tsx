'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {
  isValidDayWindow,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type DayHours,
  type LocationHours,
  type LocationStatus,
  type Weekday,
} from '@fit/types';
import { Button, Switch } from '@fit/ui-kit';
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

const styles = stylex.create({
  form: {
    display: 'flex',
    maxWidth: '42rem',
    flexDirection: 'column',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
  },
  photoGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  optional: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  photoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  photoImg: {
    height: '4rem',
    width: '6rem',
    borderRadius: 'var(--radius-container)',
    objectFit: 'cover',
  },
  photoFallback: {
    display: 'flex',
    height: '4rem',
    width: '6rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  photoControls: {
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
      borderWidth: 0,
      borderRadius: 'var(--radius-element)',
      backgroundColor: 'var(--color-accent-muted)',
      paddingInline: '0.75rem',
      paddingBlock: '0.375rem',
      fontSize: '0.875rem',
      fontWeight: 500,
      color: 'var(--color-text-accent)',
      cursor: 'pointer',
    },
  },
  photoMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  removeBtn: {
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-error)',
    },
  },
  uploadBanner: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-warning-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-warning)',
  },
  input: {
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    paddingInline: '0.875rem',
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-secondary)',
    },
    outline: 'none',
  },
  fieldset: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    minInlineSize: 0,
  },
  legend: {
    padding: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  daysWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  // Mirrors Settings → Business hours: same card row, same Open switch, so a
  // branch's hours are edited exactly the way the gym-wide default ones are.
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
  dayName: {
    width: '6rem',
    flexShrink: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  dayNameOpen: {
    color: 'var(--color-text-primary)',
  },
  dayNameClosed: {
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
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-error)',
  },
  timeWrap: {
    display: 'flex',
    flex: 1,
    alignItems: 'center',
    gap: '0.5rem',
  },
  timeInput: {
    height: '2.25rem',
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
  dash: {
    color: 'var(--color-text-secondary)',
  },
  closedAll: {
    flex: 1,
    fontSize: '0.875rem',
    color: 'var(--color-text-disabled)',
  },
  errorBanner: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  cancelLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
});

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

  /**
   * Per-day "closing must be after opening" messages, mirroring the same rule the
   * API enforces (`dayHoursSchema`). Surfaced next to the offending row rather than
   * as a `400` banner after the round-trip — a branch open 22:00–06:00 is a typo to
   * catch here, not a request to reject there.
   */
  const hourErrors = useMemo(() => {
    const out: Partial<Record<Weekday, string>> = {};
    for (const day of WEEKDAYS) {
      const value = hours[day];
      if (!value.closed && !isValidDayWindow(value.open, value.close)) {
        out[day] = 'Closing time must be after opening time.';
      }
    }
    return out;
  }, [hours]);

  const hasHourErrors = Object.keys(hourErrors).length > 0;

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
    // The offending rows already say why; a save that the API would reject anyway
    // is not worth the round-trip.
    if (hasHourErrors) return;
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
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {/* Photo. */}
      <div {...stylex.props(styles.photoGroup)}>
        <span {...stylex.props(styles.label)}>Photo</span>
        <div {...stylex.props(styles.photoRow)}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`${name || 'Location'} photo`}
              {...stylex.props(styles.photoImg)}
            />
          ) : (
            <span {...stylex.props(styles.photoFallback)}>No photo</span>
          )}
          <div {...stylex.props(styles.photoControls)}>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              onChange={(event) => void onPhotoChange(event)}
              disabled={uploading || pending}
              {...stylex.props(styles.fileInput)}
            />
            <div {...stylex.props(styles.photoMeta)}>
              <span>{uploading ? 'Uploading…' : 'JPEG, PNG, WebP or GIF, up to 5 MB.'}</span>
              {photoUrl && !uploading ? (
                <button type="button" onClick={removePhoto} {...stylex.props(styles.removeBtn)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {uploadError ? (
          <p role="alert" {...stylex.props(styles.uploadBanner)}>
            {uploadError}
          </p>
        ) : null}
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="location-name" {...stylex.props(styles.label)}>
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
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="location-address" {...stylex.props(styles.label)}>
          Address <span {...stylex.props(styles.optional)}>(optional)</span>
        </label>
        <input
          id="location-address"
          name="address"
          type="text"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="e.g. 12 Rustaveli Ave, Tbilisi"
          autoComplete="off"
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="location-phone" {...stylex.props(styles.label)}>
          Phone <span {...stylex.props(styles.optional)}>(optional)</span>
        </label>
        <input
          id="location-phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+995 32 200 0000"
          autoComplete="off"
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="location-amenities" {...stylex.props(styles.label)}>
          Amenities <span {...stylex.props(styles.optional)}>(comma separated)</span>
        </label>
        <input
          id="location-amenities"
          name="amenities"
          type="text"
          value={amenities}
          onChange={(event) => setAmenities(event.target.value)}
          placeholder="Sauna, Pool, Parking, Lockers"
          autoComplete="off"
          {...stylex.props(styles.input)}
        />
      </div>

      {/* Weekly opening hours. */}
      <fieldset {...stylex.props(styles.fieldset)}>
        <legend {...stylex.props(styles.legend)}>Opening hours</legend>
        <div {...stylex.props(styles.daysWrap)}>
          {WEEKDAYS.map((day) => {
            const value = hours[day];
            const label = WEEKDAY_LABELS[day];
            return (
              <div key={day} {...stylex.props(styles.dayRow)}>
                <div {...stylex.props(styles.dayInner)}>
                  <span
                    {...stylex.props(
                      styles.dayName,
                      value.closed ? styles.dayNameClosed : styles.dayNameOpen,
                    )}
                  >
                    {label}
                  </span>
                  {value.closed ? (
                    <span {...stylex.props(styles.closedAll)}>Closed all day</span>
                  ) : (
                    <div {...stylex.props(styles.timeWrap)}>
                      <input
                        type="time"
                        aria-label={`${label} opening time`}
                        value={value.open}
                        onChange={(event) => setDay(day, { open: event.target.value })}
                        {...stylex.props(styles.timeInput)}
                      />
                      <span {...stylex.props(styles.dash)}>–</span>
                      <input
                        type="time"
                        aria-label={`${label} closing time`}
                        value={value.close}
                        onChange={(event) => setDay(day, { close: event.target.value })}
                        {...stylex.props(styles.timeInput)}
                      />
                    </div>
                  )}
                  <div {...stylex.props(styles.toggleWrap)}>
                    <span {...stylex.props(styles.toggleLabel)}>Open</span>
                    <Switch
                      checked={!value.closed}
                      onChange={(open) => setDay(day, { closed: !open })}
                      label={`${label} open`}
                      // The "Open" caption already sits beside the track.
                      hideLabel
                    />
                  </div>
                </div>
                {hourErrors[day] ? (
                  <p role="alert" {...stylex.props(styles.dayError)}>
                    {hourErrors[day]}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>

      {!isEdit ? (
        <div {...stylex.props(styles.fieldGroup)}>
          <label htmlFor="location-status" {...stylex.props(styles.label)}>
            Status
          </label>
          <select
            id="location-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as LocationStatus)}
            {...stylex.props(styles.input)}
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
        <p role="alert" {...stylex.props(styles.errorBanner)}>
          {error}
        </p>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          variant="primary"
          size="card"
          type="submit"
          disabled={pending || uploading || hasHourErrors}
          label={pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create location'}
        />
        <Link href={cancelHref} {...stylex.props(styles.cancelLink)}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
