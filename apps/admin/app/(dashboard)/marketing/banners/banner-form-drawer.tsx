'use client';

// @fit/admin — the Create / Edit banner drawer (T1.16).
//
// One drawer for both modes, like the promo-code form beside it: headline,
// artwork, destination, the on/off switch and an optional run window.
//
// THE ARTWORK IS STAGED, NOT UPLOADED ON PICK. `POST /marketing/banners/:id/image`
// finalises an upload against a banner that already exists, so in create mode
// there is nothing to attach to until Save has run. Rather than have the two modes
// upload at different moments — immediately when editing, at submit when creating —
// both stage the chosen file and apply it after the row is written. That also makes
// Cancel mean what it says: nothing was uploaded, so nothing has to be undone.
//
// If the row saves and the upload then fails, the banner survives as a DRAFT (empty
// `imageUrl`), which the member listing skips — so the failure costs an unfinished
// row on this screen rather than a blank slide on someone's phone. The toast says
// which of the two happened.

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { createBannerSchema, updateBannerSchema, type Banner } from '@fit/types';
import { Button, Drawer, Field, Switch } from '@fit/ui-kit';
import { Icon, useToast } from '@/components/ui';
import {
  createBannerAction,
  finalizeBannerImageAction,
  requestBannerImageUploadAction,
  updateBannerAction,
} from './actions';

/** What the picker and the API's key-extension map both accept. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Client-side ceiling, checked before anything is signed. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const styles = stylex.create({
  kitGlyph: { height: '1rem', width: '1rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  grid: {
    display: 'grid',
    gap: '0.875rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  description: {
    margin: 0,
    marginTop: '-0.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
  fieldLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  hint: { margin: 0, fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--color-text-secondary)' },
  imageBlock: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  // 2:1, the aspect the phone's carousel draws — so what is previewed here is
  // framed the way members will see it rather than letter-boxed on arrival.
  imageFrame: {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    aspectRatio: '2 / 1',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-surface-muted)',
  },
  imageThumb: { height: '100%', width: '100%', objectFit: 'cover' },
  imagePlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.375rem',
    color: 'var(--color-text-secondary)',
  },
  placeholderIcon: { width: '1.5rem', height: '1.5rem' },
  placeholderText: { margin: 0, fontSize: '0.8125rem' },
  imageActions: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  fileInput: { display: 'none' },
  footerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.625rem',
  },
});

/** The drawer's form state — dates are `yyyy-mm-dd`, as the inputs hand them over. */
interface FormState {
  title: string;
  linkUrl: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

/**
 * An ISO instant as the local calendar day the operator set it on.
 *
 * NOT `iso.slice(0, 10)`, which is the UTC day: a window opening at midnight in
 * Tbilisi is stored as 20:00 the previous day, and slicing would re-open the
 * drawer showing yesterday — then save it, moving the window a day earlier every
 * time anyone touched an unrelated field.
 */
function toDateInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A `yyyy-mm-dd` input back into an ISO instant, or `null` when blank.
 *
 * The window is inclusive of both days as the operator typed them: a banner
 * starting today runs from local midnight, and one ending today runs to the last
 * second of it — which lands the right side of the API's exclusive `endsAt > now`.
 */
function fromDateInput(value: string, edge: 'start' | 'end'): string | null {
  if (!value) {
    return null;
  }
  const time = edge === 'start' ? 'T00:00:00' : 'T23:59:59';
  const date = new Date(`${value}${time}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Seed the form from a banner (edit) or blank (create). */
function seedState(seed: Banner | undefined): FormState {
  return {
    title: seed?.title ?? '',
    linkUrl: seed?.linkUrl ?? '',
    isActive: seed?.isActive ?? true,
    startsAt: toDateInput(seed?.startsAt ?? null),
    endsAt: toDateInput(seed?.endsAt ?? null),
  };
}

export function BannerFormDrawer({
  mode,
  seed,
  onClose,
}: {
  mode: 'create' | 'edit';
  seed?: Banner;
  onClose: () => void;
}) {
  const t = useTranslations('admin.marketing.banners');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => seedState(seed));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // An object URL is a live handle on the file, not a copy — revoke the previous
  // one whenever it is replaced or the drawer goes away, or picking five images
  // leaks four of them for as long as the tab is open.
  useEffect(() => {
    if (file === null) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleClose(): void {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 260);
  }

  function patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Gate the chosen file before it costs a presign, then stage it for submit. */
  function onPick(event: React.ChangeEvent<HTMLInputElement>): void {
    const picked = event.target.files?.[0];
    // Clearing the input is what lets the same file be picked twice: without it
    // the second pick sets an identical value and `change` never fires.
    if (inputRef.current) inputRef.current.value = '';
    if (!picked) return;

    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(picked.type)) {
      setError(t('image.errorType'));
      return;
    }
    if (picked.size > MAX_IMAGE_BYTES) {
      setError(t('image.errorSize'));
      return;
    }
    setError(null);
    setFile(picked);
  }

  /**
   * Put the staged file on R2 and attach it to `bannerId`: presign, `PUT` the
   * bytes straight from here, finalise the key server-side. Resolves to an error
   * message, or `null` when the artwork landed.
   */
  async function attachImage(bannerId: string, image: File): Promise<string | null> {
    try {
      const signed = await requestBannerImageUploadAction({
        contentType: image.type,
        contentLength: image.size,
        fileName: image.name,
      });
      if (!signed.ok) {
        return signed.error;
      }
      const put = await fetch(signed.data.url, {
        method: 'PUT',
        headers: { 'content-type': signed.data.contentType },
        body: image,
      });
      if (!put.ok) {
        return t('image.errorUpload', { status: put.status });
      }
      const finalized = await finalizeBannerImageAction(bannerId, signed.data.key);
      return finalized.ok ? null : finalized.error;
    } catch {
      return t('image.errorNetwork');
    }
  }

  function submit(): void {
    if (pending) return;
    setError(null);

    // `null` rather than omitted for every nullable field: the API distinguishes
    // "clear this" from "leave it alone", and an edit that dropped the key would
    // make removing a headline or an end date impossible.
    const payload = {
      title: form.title.trim() === '' ? null : form.title.trim(),
      linkUrl: form.linkUrl.trim() === '' ? null : form.linkUrl.trim(),
      isActive: form.isActive,
      startsAt: fromDateInput(form.startsAt, 'start'),
      endsAt: fromDateInput(form.endsAt, 'end'),
    };

    // The one refinement an operator can realistically trip, checked first so it
    // is refused in their own language — the schema's own message is English and
    // written for an API consumer.
    if (
      payload.startsAt !== null &&
      payload.endsAt !== null &&
      new Date(payload.endsAt).getTime() <= new Date(payload.startsAt).getTime()
    ) {
      setError(t('windowInvalid'));
      return;
    }

    // The same schema the API parses this with, run here so anything else it
    // refuses is named now rather than coming back as a round-trip 400.
    const schema = mode === 'create' ? createBannerSchema : updateBannerSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('invalid'));
      return;
    }

    startTransition(async () => {
      const saved =
        mode === 'create'
          ? await createBannerAction(payload)
          : await updateBannerAction(seed?.id as string, payload);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }

      if (file !== null) {
        const uploadError = await attachImage(saved.data.id, file);
        if (uploadError !== null) {
          // The row exists; only the artwork is missing, so say so and leave the
          // drawer open on the banner they can retry against.
          setError(uploadError);
          router.refresh();
          return;
        }
      }

      toast(mode === 'create' ? t('created') : t('updated'), { tone: 'success', icon: 'check' });
      handleClose();
      router.refresh();
    });
  }

  const currentImage = preview ?? (seed?.imageUrl ? seed.imageUrl : null);

  return (
    <Drawer
      open
      onClose={handleClose}
      label={mode === 'create' ? t('addTitle') : t('editTitle')}
      footer={
        <div {...stylex.props(styles.footerRow)}>
          <Button
            variant="secondary"
            size="card"
            onClick={handleClose}
            disabled={pending}
            label={t('cancel')}
          />
          <Button
            variant="primary"
            size="card"
            onClick={submit}
            disabled={pending}
            label={pending ? t('saving') : mode === 'create' ? t('addSubmit') : t('editSubmit')}
          />
        </div>
      }
    >
      <div {...stylex.props(styles.form)}>
        <p {...stylex.props(styles.description)}>
          {mode === 'create' ? t('addDescription') : t('editDescription')}
        </p>

        {error ? (
          <div {...stylex.props(styles.errorCard)}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        <div {...stylex.props(styles.imageBlock)}>
          <span {...stylex.props(styles.fieldLabel)}>{t('image.label')}</span>
          <div {...stylex.props(styles.imageFrame)}>
            {currentImage ? (
              <img src={currentImage} alt={t('image.alt')} {...stylex.props(styles.imageThumb)} />
            ) : (
              <span {...stylex.props(styles.imagePlaceholder)}>
                <Icon name="camera" {...stylex.props(styles.placeholderIcon)} />
                <p {...stylex.props(styles.placeholderText)}>{t('image.none')}</p>
              </span>
            )}
          </div>
          <div {...stylex.props(styles.imageActions)}>
            <Button
              variant="secondary"
              size="card"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
              icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
              label={currentImage ? t('image.replace') : t('image.choose')}
            />
            {file !== null ? (
              <Button
                variant="ghost"
                size="card"
                onClick={() => setFile(null)}
                disabled={pending}
                label={t('image.discard')}
              />
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={onPick}
            {...stylex.props(styles.fileInput)}
          />
          <p {...stylex.props(styles.hint)}>{t('image.hint')}</p>
        </div>

        <Field
          label={t('titleLabel')}
          hint={t('titleHint')}
          value={form.title}
          onChange={(e) => patch('title', e.target.value)}
          placeholder={t('titlePlaceholder')}
          maxLength={120}
          autoFocus
        />

        <Field
          label={t('linkLabel')}
          hint={t('linkHint')}
          value={form.linkUrl}
          onChange={(e) => patch('linkUrl', e.target.value)}
          placeholder={t('linkPlaceholder')}
          maxLength={2048}
        />

        <div {...stylex.props(styles.grid)}>
          <Field
            label={t('startsAtLabel')}
            hint={t('startsAtHint')}
            type="date"
            value={form.startsAt}
            onChange={(e) => patch('startsAt', e.target.value)}
          />
          <Field
            label={t('endsAtLabel')}
            hint={t('endsAtHint')}
            type="date"
            value={form.endsAt}
            onChange={(e) => patch('endsAt', e.target.value)}
          />
        </div>

        <Switch
          label={t('activeLabel')}
          description={t('activeHint')}
          checked={form.isActive}
          onChange={(checked) => patch('isActive', checked)}
          disabled={pending}
        />
      </div>
    </Drawer>
  );
}
