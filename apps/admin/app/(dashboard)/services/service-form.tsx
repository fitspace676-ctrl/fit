'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AdminServiceRow, ServiceCategory, ServiceStaffOption, ServiceType } from '@fit/types';
import { Button } from '@fit/ui-kit';
import {
  createServiceAction,
  requestServiceCoverUploadAction,
  updateServiceAction,
} from './actions';

/** The image types the cover accepts — mirrors the class cover's rules. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const styles = stylex.create({
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  label: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' },
  hint: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  input: {
    height: '2.75rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.9375rem',
  },
  textarea: { minHeight: '5rem', paddingBlock: '0.625rem' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  error: { fontSize: '0.8125rem', color: 'var(--color-error)' },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    paddingTop: '1.25rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  sectionTitle: { fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)' },
  labelOptional: { fontWeight: 400, color: 'var(--color-text-secondary)' },
  coverPreviewWrap: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  coverPreview: {
    width: '100%',
    maxWidth: '20rem',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: 'var(--radius-element)',
    borderColor: 'var(--color-border)',
    borderStyle: 'solid',
    borderWidth: '1px',
  },
  coverActions: { display: 'flex', gap: '0.5rem' },
  /* Kept in the DOM (for the ref) but never shown — the buttons drive it. */
  coverInput: { display: 'none' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' },
});

/** `"12.50"` → 1250 minor units; blank / malformed → null. */
function inputToMinor(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

const minorToInput = (minor: number): string => (minor / 100).toFixed(2);

type Props = {
  staff: ServiceStaffOption[];
  /** The gym's categories, for the picker; made in the drawer's category step. */
  categories: ServiceCategory[];
  onSuccess: () => void;
  onCancel: () => void;
} & ({ mode: 'create'; type: ServiceType } | { mode: 'edit'; service: AdminServiceRow });

/**
 * The service form body. Its shape follows the type: a personal-training service
 * has no name (generated from the trainer) and can only be assigned to a
 * trainer; a custom service is named by staff and can go to any staff member.
 * Neither carries a schedule: slots are opened on the PT calendar.
 */
export function ServiceForm(props: Props) {
  const t = useTranslations('admin.services');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const type: ServiceType = props.mode === 'create' ? props.type : props.service.type;
  const existing = props.mode === 'edit' ? props.service : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [staffId, setStaffId] = useState(existing?.staff.id ?? '');
  const [price, setPrice] = useState(existing ? minorToInput(existing.priceMinor) : '');
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 60));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [categoryId, setCategoryId] = useState(existing?.category?.id ?? '');
  const [coverUrl, setCoverUrl] = useState<string | null>(existing?.coverUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const staffOptions =
    type === 'PERSONAL_TRAINING' ? props.staff.filter((s) => s.isTrainer) : props.staff;

  /**
   * Upload the chosen cover to R2 via a presigned PUT (same flow as the class
   * cover): only the resulting public URL is ever sent to the API.
   */
  async function onCoverChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError(t('form.coverBadType'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(t('form.coverTooLarge'));
      return;
    }
    setUploading(true);
    try {
      const signed = await requestServiceCoverUploadAction({
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
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) {
        setUploadError(t('form.coverUploadFailed', { status: put.status }));
        return;
      }
      if (!signed.data.publicUrl) {
        setUploadError(t('form.coverNoPublicUrl'));
        return;
      }
      setCoverUrl(signed.data.publicUrl);
    } catch {
      setUploadError(t('form.coverNetwork'));
    } finally {
      setUploading(false);
      // Allow re-selecting the same file after an error.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    const priceMinor = inputToMinor(price);
    if (priceMinor === null) {
      setError(t('form.priceRequired'));
      return;
    }
    const profile = {
      staffId,
      priceMinor,
      durationMinutes: Number(duration),
      description,
      coverUrl,
      categoryId: categoryId || null,
    };
    startTransition(async () => {
      const result =
        props.mode === 'edit'
          ? await updateServiceAction(props.service.id, {
              ...profile,
              ...(type === 'CUSTOM' ? { name } : {}),
            })
          : await createServiceAction(
              type === 'CUSTOM' ? { type, name, ...profile } : { type, ...profile },
            );
      if (result.ok) {
        props.onSuccess();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {type === 'CUSTOM' ? (
        <div {...stylex.props(styles.field)}>
          <label htmlFor="service-name" {...stylex.props(styles.label)}>
            {t('form.name')}
          </label>
          <input
            id="service-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            {...stylex.props(styles.input)}
          />
        </div>
      ) : (
        <p {...stylex.props(styles.hint)}>{t('form.ptNameHint')}</p>
      )}

      <div {...stylex.props(styles.field)}>
        <label htmlFor="service-staff" {...stylex.props(styles.label)}>
          {t('form.staff')}
        </label>
        <select
          id="service-staff"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          required
          {...stylex.props(styles.input)}
        >
          <option value="">{t('form.choose')}</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {type === 'PERSONAL_TRAINING' && staffOptions.length === 0 ? (
          <p {...stylex.props(styles.hint)}>{t('form.noTrainers')}</p>
        ) : null}
      </div>

      <div {...stylex.props(styles.field)}>
        <label htmlFor="service-category" {...stylex.props(styles.label)}>
          {t('form.category')}{' '}
          <span {...stylex.props(styles.labelOptional)}>{t('form.optional')}</span>
        </label>
        <select
          id="service-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          {...stylex.props(styles.input)}
        >
          <option value="">{t('form.noCategory')}</option>
          {props.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {props.categories.length === 0 ? (
          <p {...stylex.props(styles.hint)}>{t('form.noCategoriesHint')}</p>
        ) : null}
      </div>

      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="service-price" {...stylex.props(styles.label)}>
            {t('form.price')}
          </label>
          <input
            id="service-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            {...stylex.props(styles.input)}
          />
        </div>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="service-duration" {...stylex.props(styles.label)}>
            {t('form.duration')}
          </label>
          <input
            id="service-duration"
            type="number"
            min={15}
            max={480}
            step={5}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            {...stylex.props(styles.input)}
          />
        </div>
      </div>

      <div {...stylex.props(styles.field)}>
        <label htmlFor="service-description" {...stylex.props(styles.label)}>
          {t('form.description')}
        </label>
        <textarea
          id="service-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          {...stylex.props(styles.input, styles.textarea)}
        />
      </div>

      <div {...stylex.props(styles.field)}>
        <span {...stylex.props(styles.label)}>
          {t('form.cover')}{' '}
          <span {...stylex.props(styles.labelOptional)}>{t('form.optional')}</span>
        </span>
        {coverUrl ? (
          <div {...stylex.props(styles.coverPreviewWrap)}>
            <img src={coverUrl} alt={t('form.coverAlt')} {...stylex.props(styles.coverPreview)} />
            <div {...stylex.props(styles.coverActions)}>
              <Button
                type="button"
                variant="secondary"
                size="inline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                label={uploading ? t('form.coverUploading') : t('form.coverReplace')}
              />
              <Button
                type="button"
                variant="secondary"
                size="inline"
                onClick={() => {
                  setCoverUrl(null);
                  setUploadError(null);
                }}
                disabled={uploading}
                label={t('form.coverRemove')}
              />
            </div>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              size="inline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              label={uploading ? t('form.coverUploading') : t('form.coverUpload')}
            />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          onChange={(event) => void onCoverChange(event)}
          {...stylex.props(styles.coverInput)}
        />
        <p {...stylex.props(styles.hint)}>{t('form.coverHint')}</p>
        {uploadError ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {uploadError}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          variant="secondary"
          size="page"
          label={t('form.cancel')}
          onClick={props.onCancel}
          type="button"
        />
        <Button
          variant="primary"
          size="page"
          label={props.mode === 'edit' ? t('form.saveChanges') : t('form.create')}
          type="submit"
          disabled={isPending}
        />
      </div>
    </form>
  );
}
