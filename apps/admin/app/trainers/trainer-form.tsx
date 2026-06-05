'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TrainerStatus } from '@fit/types';
import {
  createTrainerAction,
  requestTrainerPhotoUploadAction,
  updateTrainerAction,
} from './actions';

/** Selectable initial statuses when creating (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: TrainerStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:bg-slate-50 disabled:text-slate-500';

/** Accepted image MIME types for the headshot, matching the storage service map. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type Initial = {
  name: string;
  headline: string;
  bio: string;
  photoUrl: string | null;
  specialties: string[];
};

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      trainerId: string;
      initial: Initial;
    };

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The create / edit trainer form (T4.4). One component serves both flows. Beyond
 * the profile fields (name, headline, bio, specialties) it owns the photo upload:
 * the chosen image is uploaded straight to R2 via a presigned `PUT` (minted by
 * {@link requestTrainerPhotoUploadAction}), and only the resulting public URL is
 * persisted with the trainer. Upload failure (e.g. storage not configured) is
 * non-fatal — the trainer can still be saved without a photo. On success it
 * navigates to the trainer's detail page; the discriminated `ActionResult`
 * surfaces any API error inline without throwing across the Server Action boundary.
 */
export function TrainerForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const initial: Initial = isEdit
    ? props.initial
    : { name: '', headline: '', bio: '', photoUrl: null, specialties: [] };

  const [name, setName] = useState(initial.name);
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [specialties, setSpecialties] = useState(initial.specialties.join(', '));
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.photoUrl);
  const [status, setStatus] = useState<TrainerStatus>('ACTIVE');

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Parse the comma-separated specialties box into a clean tag list. */
  function parseSpecialties(): string[] {
    return specialties
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
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
      const signed = await requestTrainerPhotoUploadAction({
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
    const profile = { name, headline, bio, photoUrl, specialties: parseSpecialties() };
    startTransition(async () => {
      const result = isEdit
        ? await updateTrainerAction(props.trainerId, profile)
        : await createTrainerAction({ ...profile, status });
      if (result.ok) {
        router.push(`/trainers/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/trainers/${props.trainerId}` : '/trainers';

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      {/* Photo. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Photo</span>
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`${name || 'Trainer'} photo`}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700">
              {initialsOf(name)}
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
        <label htmlFor="trainer-name" className="text-sm font-medium text-slate-700">
          Name
        </label>
        <input
          id="trainer-name"
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
        <label htmlFor="trainer-headline" className="text-sm font-medium text-slate-700">
          Headline <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="trainer-headline"
          name="headline"
          type="text"
          value={headline}
          onChange={(event) => setHeadline(event.target.value)}
          placeholder="e.g. Strength &amp; conditioning coach"
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="trainer-bio" className="text-sm font-medium text-slate-700">
          Bio <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="trainer-bio"
          name="bio"
          rows={4}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="trainer-specialties" className="text-sm font-medium text-slate-700">
          Specialties <span className="font-normal text-slate-400">(comma separated)</span>
        </label>
        <input
          id="trainer-specialties"
          name="specialties"
          type="text"
          value={specialties}
          onChange={(event) => setSpecialties(event.target.value)}
          placeholder="Strength, Mobility, Nutrition"
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="trainer-status" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="trainer-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TrainerStatus)}
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
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create trainer'}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
