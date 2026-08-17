'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { TrainerStatus } from '@fit/types';
import { Button } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
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

/** Accepted image MIME types for the headshot, matching the storage service map. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const styles = stylex.create({
  form: {
    display: 'flex',
    maxWidth: '32rem',
    flexDirection: 'column',
    gap: '1rem',
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
    width: '4rem',
    borderRadius: 'var(--radius-full)',
    objectFit: 'cover',
  },
  photoFallback: {
    display: 'flex',
    height: '4rem',
    width: '4rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '1.125rem',
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
  textarea: {
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
    paddingBlock: '0.625rem',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-secondary)',
    },
    outline: 'none',
  },
  banner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    padding: '1rem',
  },
  bannerWarning: {
    borderColor: 'var(--color-warning)',
    backgroundColor: 'var(--color-warning-muted)',
  },
  bannerError: {
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  bannerIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
  },
  iconWarning: {
    color: 'var(--color-warning)',
  },
  iconError: {
    color: 'var(--color-error)',
  },
  bannerText: {
    margin: 0,
    fontSize: '0.875rem',
  },
  textWarning: {
    color: 'var(--color-warning)',
  },
  textError: {
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
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {/* Photo. */}
      <div {...stylex.props(styles.photoGroup)}>
        <span {...stylex.props(styles.label)}>{t('form.photo')}</span>
        <div {...stylex.props(styles.photoRow)}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={t('form.photoAlt', { name: name || t('form.trainerFallback') })}
              {...stylex.props(styles.photoImg)}
            />
          ) : (
            <span {...stylex.props(styles.photoFallback)}>{initialsOf(name)}</span>
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
              <span>{uploading ? t('form.uploading') : t('form.photoHint')}</span>
              {photoUrl && !uploading ? (
                <button type="button" onClick={removePhoto} {...stylex.props(styles.removeBtn)}>
                  {t('form.remove')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {uploadError ? (
          <div {...stylex.props(styles.banner, styles.bannerWarning)}>
            <Icon name="info" {...stylex.props(styles.bannerIcon, styles.iconWarning)} />
            <p role="alert" {...stylex.props(styles.bannerText, styles.textWarning)}>
              {uploadError}
            </p>
          </div>
        ) : null}
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="trainer-name" {...stylex.props(styles.label)}>
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
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="trainer-headline" {...stylex.props(styles.label)}>
          {t('form.headline')} <span {...stylex.props(styles.optional)}>{t('form.optional')}</span>
        </label>
        <input
          id="trainer-headline"
          name="headline"
          type="text"
          value={headline}
          onChange={(event) => setHeadline(event.target.value)}
          placeholder={t('form.headlinePlaceholder')}
          autoComplete="off"
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="trainer-bio" {...stylex.props(styles.label)}>
          {t('form.bio')} <span {...stylex.props(styles.optional)}>{t('form.optional')}</span>
        </label>
        <textarea
          id="trainer-bio"
          name="bio"
          rows={4}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          {...stylex.props(styles.textarea)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="trainer-specialties" {...stylex.props(styles.label)}>
          {t('form.specialties')}{' '}
          <span {...stylex.props(styles.optional)}>{t('form.commaSeparated')}</span>
        </label>
        <input
          id="trainer-specialties"
          name="specialties"
          type="text"
          value={specialties}
          onChange={(event) => setSpecialties(event.target.value)}
          placeholder={t('form.specialtiesPlaceholder')}
          autoComplete="off"
          {...stylex.props(styles.input)}
        />
      </div>

      {!isEdit ? (
        <div {...stylex.props(styles.fieldGroup)}>
          <label htmlFor="trainer-status" {...stylex.props(styles.label)}>
            {t('form.status')}
          </label>
          <select
            id="trainer-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TrainerStatus)}
            {...stylex.props(styles.input)}
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
        <div {...stylex.props(styles.banner, styles.bannerError)}>
          <Icon name="info" {...stylex.props(styles.bannerIcon, styles.iconError)} />
          <p role="alert" {...stylex.props(styles.bannerText, styles.textError)}>
            {error}
          </p>
        </div>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          variant="primary"
          size="card"
          type="submit"
          disabled={pending || uploading}
          label={
            pending ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.createTrainer')
          }
        />
        <Link href={cancelHref} {...stylex.props(styles.cancelLink)}>
          {t('form.cancel')}
        </Link>
      </div>
    </form>
  );
}
