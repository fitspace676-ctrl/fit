'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import type { MobileAppSettings } from '@fit/types';
import { Icon } from '@/components/ui';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  PHOTO_UPLOAD_TYPES,
  useImageUpload,
} from '@/components/use-image-upload';
import {
  clearAppLoginImageAction,
  finalizeAppLoginImageAction,
  requestAppLoginImageUploadAction,
} from './actions';

type LoginImage = Pick<MobileAppSettings, 'loginImageUrl' | 'loginImageSource'>;

// The member portal's photo card (`member-portal-form.tsx`), framed as the phone
// draws it: a wide band across the top of the sign-in screen.
const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' },
  title: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  desc: { margin: '0.125rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  row: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  rowDragging: {
    borderRadius: 'var(--radius-container)',
    outlineWidth: '2px',
    outlineStyle: 'dashed',
    outlineColor: 'var(--color-accent)',
    outlineOffset: '0.25rem',
  },
  frame: {
    position: 'relative',
    width: '100%',
    maxWidth: '28rem',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  frameDragging: { borderColor: 'var(--color-accent)' },
  thumb: { height: '100%', width: '100%', objectFit: 'cover', display: 'block' },
  // The same soft dark fade the app lays under its hero, so the preview reads
  // the way the phone shows it.
  fade: {
    position: 'absolute',
    insetInline: 0,
    insetBlockEnd: 0,
    height: '55%',
    backgroundImage: 'linear-gradient(to bottom, rgba(15, 23, 42, 0), rgba(15, 23, 42, 0.6))',
    pointerEvents: 'none',
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    paddingInline: '1rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  dropOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#FFFFFF',
  },
  tag: {
    position: 'absolute',
    insetBlockEnd: '0.375rem',
    insetInlineStart: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingInline: '0.5rem',
    paddingBlock: '0.1875rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    color: '#FFFFFF',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.5rem',
  },
  upload: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':hover': 'var(--color-border-strong)' },
    backgroundColor: { default: 'var(--color-background)', ':hover': 'var(--fc-ghost)' },
    paddingInline: '0.75rem',
    paddingBlock: '0.4375rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    outlineWidth: { default: '0', ':focus-within': '2px' },
    outlineStyle: 'solid',
    outlineColor: 'var(--color-accent)',
    outlineOffset: '2px',
  },
  busy: { opacity: 0.55, cursor: 'progress' },
  srOnly: {
    position: 'absolute',
    height: '1px',
    width: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  linkBtn: {
    borderStyle: 'none',
    background: 'none',
    padding: 0,
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
    textDecorationLine: { default: 'none', ':hover': 'underline' },
    color: 'var(--color-text-accent)',
  },
  hint: { margin: 0, fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--color-text-secondary)' },
  error: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-warning-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-warning)',
  },
});

/**
 * The mobile app's sign-in photo. Saved the moment it is uploaded or removed —
 * it is a file, not a toggle, so it does not wait for the features' Save button.
 *
 * Three states: the app's own photo; the member portal's, badged "From portal",
 * which the app borrows while it has none of its own; or no photo at all.
 */
export function LoginImageField({ initial }: { initial: LoginImage }) {
  const t = useTranslations('admin.appSettings.loginImage');
  const [image, setImage] = useState<LoginImage>(initial);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const { uploading, uploadError, dragging, disabled, inputRef, onInputChange, dropHandlers } =
    useImageUpload<MobileAppSettings>({
      accept: PHOTO_UPLOAD_TYPES,
      maxBytes: MAX_PHOTO_UPLOAD_BYTES,
      messages: {
        errorType: t('errorType'),
        errorSize: t('errorSize'),
        errorUpload: (code) => t('errorUpload', { status: code }),
        errorNetwork: t('errorNetwork'),
      },
      presign: requestAppLoginImageUploadAction,
      finalize: finalizeAppLoginImageAction,
      onUploaded: (settings) => {
        setImage(settings);
        setRemoveError(null);
        setStatus(t('saved'));
      },
      busy: removing,
    });

  const own = image.loginImageSource === 'app';
  const error = uploadError ?? removeError;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div>
        <h2 {...stylex.props(styles.title)}>{t('title')}</h2>
        <p {...stylex.props(styles.desc)}>{t('subtitle')}</p>
      </div>
      <div {...dropHandlers} {...stylex.props(styles.row, dragging && styles.rowDragging)}>
        <div {...stylex.props(styles.frame, dragging && styles.frameDragging)}>
          {image.loginImageUrl ? (
            <>
              <img src={image.loginImageUrl} alt={t('alt')} {...stylex.props(styles.thumb)} />
              <span aria-hidden {...stylex.props(styles.fade)} />
            </>
          ) : (
            <span {...stylex.props(styles.empty)}>{t('none')}</span>
          )}
          {image.loginImageSource === 'portal' && !dragging ? (
            <span {...stylex.props(styles.tag)}>{t('fromPortal')}</span>
          ) : null}
          {dragging ? (
            <span aria-hidden {...stylex.props(styles.dropOverlay)}>
              {t('drop')}
            </span>
          ) : null}
        </div>
        <div {...stylex.props(styles.actions)}>
          <label {...stylex.props(styles.upload, disabled && styles.busy)}>
            <Icon name="camera" sw={2.2} width={14} height={14} />
            {uploading ? t('uploading') : own ? t('replace') : t('choose')}
            <input
              ref={inputRef}
              type="file"
              accept={PHOTO_UPLOAD_TYPES.join(',')}
              aria-label={t('label')}
              onChange={(event) => {
                setStatus('');
                onInputChange(event);
              }}
              disabled={disabled}
              {...stylex.props(styles.srOnly)}
            />
          </label>
          {own && !uploading ? (
            <button
              type="button"
              disabled={removing}
              onClick={() => {
                void (async () => {
                  setRemoving(true);
                  setRemoveError(null);
                  setStatus('');
                  try {
                    const result = await clearAppLoginImageAction();
                    if (result.ok) {
                      setImage(result.data);
                      setStatus(t('removed'));
                    } else setRemoveError(result.error);
                  } catch {
                    setRemoveError(t('saveError'));
                  } finally {
                    setRemoving(false);
                  }
                })();
              }}
              {...stylex.props(styles.linkBtn)}
            >
              {removing ? t('removing') : t('remove')}
            </button>
          ) : null}
          <p {...stylex.props(styles.hint)}>{t('hint')}</p>
        </div>
      </div>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : status ? (
        <p role="status" {...stylex.props(styles.hint)}>
          {status}
        </p>
      ) : null}
    </Card>
  );
}
