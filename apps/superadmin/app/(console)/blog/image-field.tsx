'use client';

import { useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@fit/ui-kit';
import { IMAGE_ACCEPT, uploadBlogImage } from './upload';

const styles = stylex.create({
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  hint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  frame: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    aspectRatio: '16 / 9',
    maxWidth: '20rem',
  },
  square: {
    aspectRatio: '1',
    maxWidth: '6rem',
  },
  image: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  empty: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  actions: {
    display: 'flex',
    gap: '0.375rem',
  },
  hidden: {
    display: 'none',
  },
});

/**
 * One uploaded image — a cover, an OG card, an author photo. Picks a file,
 * relays it through `/api/blog-upload`, and hands the stored URL up. Errors go
 * up too, to the form's banner.
 */
export function ImageField({
  label,
  hint,
  value,
  onChange,
  onError,
  square = false,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  onError: (message: string | null) => void;
  square?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPick(file: File | undefined) {
    if (!file) return;
    onError(null);
    setUploading(true);
    try {
      onChange(await uploadBlogImage(file));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div {...stylex.props(styles.field)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <div {...stylex.props(styles.frame, square && styles.square)}>
        {value ? (
          // A remote R2 object, shown as-is; next/image would need its host configured.
          <img src={value} alt="" {...stylex.props(styles.image)} />
        ) : (
          <span {...stylex.props(styles.empty)}>No image</span>
        )}
      </div>
      {hint ? <p {...stylex.props(styles.hint)}>{hint}</p> : null}
      <div {...stylex.props(styles.actions)}>
        <Button
          type="button"
          variant="secondary"
          size="inline"
          label={value ? 'Replace' : 'Upload'}
          loading={uploading}
          disabled={disabled}
          onClick={() => input.current?.click()}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="inline"
            label="Remove"
            disabled={disabled || uploading}
            onClick={() => onChange(null)}
          />
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        aria-label={`${label} file`}
        onChange={(event) => void onPick(event.target.files?.[0])}
        {...stylex.props(styles.hidden)}
      />
    </div>
  );
}
