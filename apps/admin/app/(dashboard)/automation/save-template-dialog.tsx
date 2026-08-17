'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Button, Dialog, Field } from '@fit/ui-kit';
import { useToast } from '@/components/ui';
import { saveAsTemplateAction } from './actions';

const styles = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  hint: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Save an existing rule as a reusable template. The name defaults to the source
 * rule's name; the created copy is inactive and lands in the Templates gallery.
 */
export function SaveTemplateDialog({
  ruleId,
  defaultName,
  onClose,
}: {
  ruleId: string;
  defaultName: string;
  onClose: () => void;
}) {
  const t = useTranslations('admin.automation');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  function submit(): void {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await saveAsTemplateAction(ruleId, name);
      if (result.ok) {
        toast(t('templates.saved'), { tone: 'success', icon: 'check' });
        onClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('templates.saveTitle')}
      description={t('templates.saveDescription')}
      actions={
        <>
          <Button
            variant="secondary"
            size="card"
            onClick={onClose}
            disabled={pending}
            label={t('form.cancel')}
          />
          <Button
            variant="primary"
            size="card"
            onClick={submit}
            disabled={pending || name.trim().length === 0}
            label={pending ? t('form.saving') : t('templates.saveSubmit')}
          />
        </>
      }
    >
      <div {...stylex.props(styles.body)}>
        {error ? (
          <p role="alert" {...stylex.props(styles.hint)}>
            {error}
          </p>
        ) : null}
        <Field
          label={t('templates.nameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
    </Dialog>
  );
}
