'use client';

import { useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { Button } from '@/src/components/ui/kit';
import { createProfilePhotoUpload, setProfilePhoto } from '@/app/actions/profile-photo';

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
  avatar: {
    width: '6rem',
    height: '6rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    display: 'grid',
    placeItems: 'center',
    fontSize: '2rem',
    objectFit: 'cover',
  },
  actions: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' },
  hidden: { display: 'none' },
  error: { color: 'var(--color-text-danger)', fontSize: '0.875rem' },
});

export function ProfilePhoto({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const t = useTranslations('member.profile.photo');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  async function change(file: File | null) {
    if (busy) return;
    setError(null);
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(t('invalidType'));
      return;
    }
    setBusy(true);
    try {
      let url: string | null = null;
      if (file) {
        const signed = await createProfilePhotoUpload({
          contentType: file.type,
          contentLength: file.size,
        });
        if (!signed.ok) throw new Error('sign');
        // The browser supplies Content-Length from the File; it must match the
        // exact size bound by the API signature. Bytes go directly to R2.
        const upload = await fetch(signed.data.url, {
          method: 'PUT',
          headers: { 'Content-Type': signed.data.contentType },
          body: file,
        });
        if (!upload.ok) throw new Error('upload');
        url = signed.data.publicUrl;
      }
      const saved = await setProfilePhoto(url);
      if (!saved.ok) throw new Error('save');
      setFailedUrl(null);
      router.refresh();
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div {...stylex.props(styles.root)} aria-busy={busy}>
      {photoUrl && failedUrl !== photoUrl ? (
        <img
          src={photoUrl}
          alt={t('alt', { name })}
          {...stylex.props(styles.avatar)}
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        <span {...stylex.props(styles.avatar)} aria-label={name}>
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase()}
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={t('upload')}
        {...stylex.props(styles.hidden)}
        disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void change(file);
        }}
      />
      <div {...stylex.props(styles.actions)}>
        <Button
          label={busy ? t('saving') : photoUrl ? t('change') : t('upload')}
          disabled={busy}
          onClick={() => input.current?.click()}
        />
        {photoUrl ? (
          <Button label={t('remove')} disabled={busy} onClick={() => void change(null)} />
        ) : null}
      </div>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
