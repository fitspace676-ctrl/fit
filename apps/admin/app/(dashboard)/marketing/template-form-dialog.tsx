'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { MarketingCatalogResponse, MarketingChannel, MessageTemplateRow } from '@fit/types';
import { Btn, Drawer, Field, Icon, Input, Select, Textarea, useToast } from '@/components/ui';
import { createTemplateAction, updateTemplateAction } from './actions';
import { CHANNEL_BODY_LIMITS, CHANNEL_ORDER, CHANNEL_SUBJECT_LIMITS } from './marketing-meta';

const styles = stylex.create({
  form: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  counterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  label: { fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' },
  counter: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  mergeWrap: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  mergeHint: { margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  mergeChips: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem' },
  mergeChip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.5rem',
    paddingBlock: '0.1875rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    color: 'var(--color-text-primary)',
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
  description: {
    margin: 0,
    marginTop: '-0.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  footerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.625rem',
  },
});

interface FormState {
  name: string;
  channel: MarketingChannel;
  subject: string;
  body: string;
  category: string;
}

/**
 * The Create / Edit Message Template dialog (T12.8) — one Modal form: name,
 * channel, optional subject, body with a per-channel limit + insertable
 * merge-field palette, and an optional category. Wired to the T12.7 templates
 * API through the `MarketingManage` Server Actions.
 */
export function TemplateFormDialog({
  mode,
  seed,
  catalog,
  onClose,
}: {
  mode: 'create' | 'edit';
  seed?: MessageTemplateRow;
  catalog: MarketingCatalogResponse;
  onClose: () => void;
}) {
  const t = useTranslations('admin.marketing');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    name: seed?.name ?? '',
    channel: seed?.channel ?? 'email',
    subject: seed?.subject ?? '',
    body: seed?.body ?? '',
    category: seed?.category ?? '',
  }));

  const editId = mode === 'edit' ? seed?.id : undefined;
  const [closing, setClosing] = useState(false);

  function handleClose(): void {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 260);
  }

  const bodyLimit = CHANNEL_BODY_LIMITS[form.channel];
  const subjectLimit = CHANNEL_SUBJECT_LIMITS[form.channel];
  const canSubmit = form.name.trim().length > 0 && form.body.trim().length > 0;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function insertToken(token: string): void {
    setForm((prev) => ({
      ...prev,
      body:
        prev.body.length > 0 && !prev.body.endsWith(' ')
          ? `${prev.body} ${token}`
          : prev.body + token,
    }));
  }

  function submit(): void {
    if (!canSubmit || pending) return;
    setError(null);
    const subject = form.subject.trim();
    const base = {
      name: form.name.trim(),
      channel: form.channel,
      subject: subject.length > 0 ? subject : undefined,
      body: form.body.trim(),
      category: form.category.trim(),
    };
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createTemplateAction(base)
          : await updateTemplateAction(editId as string, {
              ...base,
              // In edit mode an empty subject clears it (nullable), not "unchanged".
              subject: subject.length > 0 ? subject : null,
            });
      if (result.ok) {
        toast(mode === 'create' ? t('templates.created') : t('templates.updated'), {
          tone: 'success',
          icon: 'check',
        });
        handleClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Drawer
      open
      onClose={handleClose}
      closing={closing}
      side="right"
      title={mode === 'create' ? t('templates.addTitle') : t('templates.editTitle')}
      className="max-w-xl"
      footer={
        <div {...stylex.props(styles.footerRow)}>
          <Btn v="outline" size="md" onClick={handleClose} disabled={pending}>
            {t('wizard.cancel')}
          </Btn>
          <Btn
            v="primary"
            size="md"
            onClick={submit}
            disabled={pending || !canSubmit}
            className="btn-brand"
          >
            {pending
              ? t('wizard.saving')
              : mode === 'create'
                ? t('templates.addSubmit')
                : t('templates.editSubmit')}
          </Btn>
        </div>
      }
    >
      <div {...stylex.props(styles.form)}>
        <p {...stylex.props(styles.description)}>
          {mode === 'create' ? t('templates.addDescription') : t('templates.editDescription')}
        </p>

        {error ? (
          <div {...stylex.props(styles.errorCard)}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        <Field label={t('templates.nameLabel')}>
          <Input
            value={form.name}
            onChange={(e) => patch('name', e.target.value)}
            placeholder={t('templates.namePlaceholder')}
            autoFocus
          />
        </Field>

        <Field label={t('templates.channelLabel')}>
          <Select
            value={form.channel}
            onChange={(e) => patch('channel', e.target.value as MarketingChannel)}
          >
            {CHANNEL_ORDER.map((channel) => (
              <option key={channel} value={channel}>
                {t(`channels.${channel}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('templates.categoryLabel')} hint={t('templates.categoryHint')}>
          <Input
            value={form.category}
            onChange={(e) => patch('category', e.target.value)}
            placeholder={t('templates.categoryPlaceholder')}
          />
        </Field>

        <Field label={t('content.subjectLabel')}>
          <Input
            value={form.subject}
            maxLength={subjectLimit}
            onChange={(e) => patch('subject', e.target.value)}
            placeholder={t('content.subjectPlaceholder')}
          />
        </Field>

        <div>
          <div {...stylex.props(styles.counterRow)}>
            <span {...stylex.props(styles.label)}>{t('content.bodyLabel')}</span>
            {bodyLimit !== null ? (
              <span {...stylex.props(styles.counter)}>
                {form.body.length}/{bodyLimit}
              </span>
            ) : null}
          </div>
          <Textarea
            rows={6}
            value={form.body}
            maxLength={bodyLimit ?? undefined}
            onChange={(e) => patch('body', e.target.value)}
            placeholder={t('content.bodyPlaceholder')}
          />
        </div>

        <div {...stylex.props(styles.mergeWrap)}>
          <p {...stylex.props(styles.mergeHint)}>{t('content.mergeHint')}</p>
          <div {...stylex.props(styles.mergeChips)}>
            {catalog.mergeFields.map((field) => (
              <button
                key={field.token}
                type="button"
                title={field.token}
                onClick={() => insertToken(field.token)}
                {...stylex.props(styles.mergeChip)}
              >
                + {field.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
