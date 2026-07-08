'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Btn, Icon, Modal, Textarea, useToast } from '@/components/ui';
import { loseOpportunityAction, winOpportunityAction } from './actions';

/** Which close transition the dialog performs. */
export type CloseKind = 'won' | 'lost';

/**
 * The selectable close reasons per transition (from the reference board): a win
 * explains what worked, a loss what didn't — with a free-text "other". Labels
 * come from `dialogs.reasons.<key>` (shared with the lead close dialog).
 */
const REASONS: Record<CloseKind, readonly string[]> = {
  won: ['price', 'location', 'reputation', 'referral', 'other'],
  lost: ['price', 'location', 'competitor', 'noResponse', 'other'],
};

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  optionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: '0.625rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  optionActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  radio: {
    accentColor: 'var(--color-accent)',
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
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/**
 * The Mark-Won / Mark-Lost dialog — the only way an opportunity closes, so the
 * reason is always captured with the close (required on a loss, and the picker
 * makes it effectively required on a win too). "Other" opens a free-text line;
 * the stored reason is the label the staff member picked (or typed).
 */
export function CloseOpportunityDialog({
  kind,
  opportunityId,
  memberName,
  onClose,
}: {
  kind: CloseKind;
  opportunityId: string;
  memberName: string;
  onClose: () => void;
}) {
  const t = useTranslations('admin.crm');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reasonKey, setReasonKey] = useState('');
  const [otherText, setOtherText] = useState('');

  const canSubmit = reasonKey !== '' && (reasonKey !== 'other' || otherText.trim().length > 0);

  function submit(): void {
    if (!canSubmit || pending) return;
    setError(null);
    const reason = reasonKey === 'other' ? otherText.trim() : t(`dialogs.reasons.${reasonKey}`);
    startTransition(async () => {
      const result =
        kind === 'won'
          ? await winOpportunityAction(opportunityId, reason)
          : await loseOpportunityAction(opportunityId, reason);
      if (result.ok) {
        toast(kind === 'won' ? t('opportunityDialogs.wonDone') : t('opportunityDialogs.lostDone'), {
          tone: 'success',
          icon: 'check',
        });
        onClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'won' ? t('opportunityDialogs.wonTitle') : t('opportunityDialogs.lostTitle')}
      description={
        kind === 'won'
          ? t('opportunityDialogs.wonDescription', { name: memberName })
          : t('opportunityDialogs.lostDescription', { name: memberName })
      }
      size="md"
      footer={
        <>
          <Btn v="outline" size="md" onClick={onClose} disabled={pending}>
            {t('form.cancel')}
          </Btn>
          <Btn
            v={kind === 'won' ? 'primary' : 'danger'}
            size="md"
            onClick={submit}
            disabled={pending || !canSubmit}
          >
            {pending
              ? t('form.saving')
              : kind === 'won'
                ? t('opportunityDialogs.wonSubmit')
                : t('opportunityDialogs.lostSubmit')}
          </Btn>
        </>
      }
    >
      <div {...stylex.props(styles.stack)}>
        {error ? (
          <div {...stylex.props(styles.errorCard)}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        <div
          role="radiogroup"
          aria-label={t('dialogs.reasonLabel')}
          {...stylex.props(styles.optionList)}
        >
          {REASONS[kind].map((key) => (
            <label
              key={key}
              {...stylex.props(styles.option, reasonKey === key && styles.optionActive)}
            >
              <input
                type="radio"
                name="close-opportunity-reason"
                value={key}
                checked={reasonKey === key}
                onChange={() => setReasonKey(key)}
                {...stylex.props(styles.radio)}
              />
              {t(`dialogs.reasons.${key}`)}
            </label>
          ))}
        </div>

        {reasonKey === 'other' ? (
          <Textarea
            rows={3}
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder={t('dialogs.otherPlaceholder')}
            aria-label={t('dialogs.reasons.other')}
          />
        ) : null}
      </div>
    </Modal>
  );
}
