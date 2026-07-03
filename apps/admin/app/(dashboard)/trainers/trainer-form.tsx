'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { TrainerStatus } from '@fit/types';
import { Btn, buttonClasses, Card, Icon } from '@/components/ui';
import {
  createTrainerAction,
  requestTrainerPhotoUploadAction,
  updateTrainerAction,
} from './actions';

/** Selectable initial statuses when creating (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: TrainerStatus; labelKey: string }> = [
  { value: 'ACTIVE', labelKey: 'status.active' },
  { value: 'INACTIVE', labelKey: 'status.inactive' },
];

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:disabled:bg-white/5';

/** Field styling for multi-line inputs (textareas) — same tokens, no fixed height. */
const TEXTAREA_CLASS =
  'w-full rounded-field border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:disabled:bg-white/5';

/** Shared label styling. */
const LABEL_CLASS = 'text-sm font-medium text-ink-700 dark:text-ink-200';

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
  const t = useTranslations('admin.trainers');
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
      setUploadError(t('form.uploadWrongType'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setUploadError(t('form.uploadTooLarge'));
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
        setUploadError(t('form.uploadFailed', { status: put.status }));
        return;
      }
      if (!signed.data.publicUrl) {
        setUploadError(t('form.uploadNoPublicUrl'));
        return;
      }
      setPhotoUrl(signed.data.publicUrl);
    } catch {
      setUploadError(t('form.uploadError'));
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
        <span className={LABEL_CLASS}>{t('form.photo')}</span>
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={t('form.photoAlt', { name: name || t('form.trainerFallback') })}
              className="h-16 w-16 rounded-full object-cover ring-1 ring-ink-200 dark:ring-white/10"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
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
              className="text-sm text-ink-600 file:mr-3 file:rounded-btn file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 disabled:opacity-50 dark:text-ink-300 dark:file:bg-brand-500/15 dark:file:text-brand-200 dark:hover:file:bg-brand-500/25"
            />
            <div className="flex items-center gap-3 text-xs text-ink-400">
              <span>{uploading ? t('form.uploading') : t('form.photoHint')}</span>
              {photoUrl && !uploading ? (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="font-medium text-ink-500 hover:text-danger-600 dark:text-ink-400 dark:hover:text-danger-300"
                >
                  {t('form.remove')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {uploadError ? (
          <Card className="flex items-start gap-3 border-warning-200 bg-warning-50 p-4 dark:border-warning-500/20 dark:bg-warning-500/10">
            <Icon
              name="info"
              className="mt-0.5 h-5 w-5 shrink-0 text-warning-600 dark:text-warning-300"
            />
            <p role="alert" className="text-sm text-warning-800 dark:text-warning-200">
              {uploadError}
            </p>
          </Card>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="trainer-name" className={LABEL_CLASS}>
          {t('form.name')}
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
        <label htmlFor="trainer-headline" className={LABEL_CLASS}>
          {t('form.headline')}{' '}
          <span className="font-normal text-ink-400">{t('form.optional')}</span>
        </label>
        <input
          id="trainer-headline"
          name="headline"
          type="text"
          value={headline}
          onChange={(event) => setHeadline(event.target.value)}
          placeholder={t('form.headlinePlaceholder')}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="trainer-bio" className={LABEL_CLASS}>
          {t('form.bio')} <span className="font-normal text-ink-400">{t('form.optional')}</span>
        </label>
        <textarea
          id="trainer-bio"
          name="bio"
          rows={4}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          className={TEXTAREA_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="trainer-specialties" className={LABEL_CLASS}>
          {t('form.specialties')}{' '}
          <span className="font-normal text-ink-400">{t('form.commaSeparated')}</span>
        </label>
        <input
          id="trainer-specialties"
          name="specialties"
          type="text"
          value={specialties}
          onChange={(event) => setSpecialties(event.target.value)}
          placeholder={t('form.specialtiesPlaceholder')}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="trainer-status" className={LABEL_CLASS}>
            {t('form.status')}
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
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {error}
          </p>
        </Card>
      ) : null}

      <div className="flex items-center gap-3">
        <Btn type="submit" v="primary" size="md" disabled={pending || uploading}>
          {pending ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.createTrainer')}
        </Btn>
        <Link href={cancelHref} className={buttonClasses('ghost', 'md')}>
          {t('form.cancel')}
        </Link>
      </div>
    </form>
  );
}
