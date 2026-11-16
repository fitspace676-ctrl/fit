'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button, TextareaField } from '@fit/ui-kit';
import { MARKETING_MERGE_FIELD_DEFS, type MarketingChannel } from '@fit/types';
import { assistMessageAction, previewMessageAction } from './actions';
import { CHANNEL_BODY_LIMITS, CHANNEL_SUBJECT_LIMITS } from './marketing-meta';

const styles = stylex.create({
  panel: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  copy: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', margin: 0 },
});

type Copy = { subject: string; body: string };

/** Shared template/campaign assistance. Neither generating nor previewing saves or sends. */
export function MessageTools({
  subject,
  body,
  channel,
  onApply,
}: Copy & {
  channel: MarketingChannel;
  onApply: (copy: Copy) => void;
}) {
  const t = useTranslations('admin.marketing.messageTools');
  const [instruction, setInstruction] = useState('');
  const [pending, startTransition] = useTransition();
  const [candidate, setCandidate] = useState<Copy | null>(null);
  const [previous, setPrevious] = useState<Copy | null>(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<(Copy & { recipient: string; source: string }) | null>(
    null,
  );
  const source = JSON.stringify({ subject, body });

  function generate(improve: boolean) {
    setStatus('');
    setCandidate(null);
    startTransition(async () => {
      try {
        const result = await assistMessageAction({
          purpose: 'marketing',
          locale: 'ka',
          history: [],
          message: `${improve ? 'Improve the existing copy without changing its meaning.' : 'Write new copy.'} Channel: ${channel}. Subject limit: ${CHANNEL_SUBJECT_LIMITS[channel]}; body limit: ${CHANNEL_BODY_LIMITS[channel] ?? 2000}. ${instruction}`,
          marketingCopy: { subject, body },
        });
        if (!result.ok) {
          setStatus(result.error);
          return;
        }
        if (result.data.kind === 'question') {
          setStatus(result.data.question);
          return;
        }
        const copy = result.data.draft.actionConfig;
        const next = { subject: copy?.subject ?? subject, body: copy?.body ?? '' };
        const limit = CHANNEL_BODY_LIMITS[channel];
        const allowed = new Set(MARKETING_MERGE_FIELD_DEFS.map((field) => field.token));
        const tokens = `${next.subject} ${next.body}`.match(/\{\{[^{}]*\}\}/g) ?? [];
        if (
          !next.body ||
          next.subject.length > CHANNEL_SUBJECT_LIMITS[channel] ||
          (limit !== null && next.body.length > limit) ||
          tokens.some((token) => !allowed.has(token))
        ) {
          setStatus(t('invalid'));
          return;
        }
        setCandidate(next);
      } catch {
        setStatus(t('failed'));
      }
    });
  }

  return (
    <section aria-label={t('title')} {...stylex.props(styles.panel)}>
      <TextareaField
        label={t('instruction')}
        value={instruction}
        maxLength={1500}
        rows={2}
        onChange={(event) => setInstruction(event.target.value)}
      />
      <Button
        label={t('write')}
        disabled={pending || !instruction.trim()}
        onClick={() => generate(false)}
      />
      <Button
        label={t('improve')}
        disabled={pending || !body.trim()}
        onClick={() => generate(true)}
      />
      {candidate && (
        <div>
          <p>{candidate.subject}</p>
          <pre {...stylex.props(styles.copy)}>{candidate.body}</pre>
          <Button
            label={t('apply')}
            disabled={pending}
            onClick={() => {
              setPrevious({ subject, body });
              onApply(candidate);
              setCandidate(null);
            }}
          />
          <Button label={t('discard')} onClick={() => setCandidate(null)} />
        </div>
      )}
      {previous && (
        <Button
          label={t('undo')}
          disabled={pending}
          onClick={() => {
            onApply(previous);
            setPrevious(null);
          }}
        />
      )}
      <Button
        label={t('preview')}
        disabled={pending || !body.trim()}
        onClick={() => {
          setStatus('');
          setPreview(null);
          startTransition(async () => {
            try {
              const result = await previewMessageAction({ subject, body });
              if (result.ok) setPreview({ ...result.data, source });
              else setStatus(result.error);
            } catch {
              setStatus(t('failed'));
            }
          });
        }}
      />
      {preview?.source === source && (
        <div role="status">
          <p>{t('sample', { recipient: preview.recipient })}</p>
          <p>{preview.subject}</p>
          <pre {...stylex.props(styles.copy)}>{preview.body}</pre>
        </div>
      )}
      {pending && <p role="status">{t('working')}</p>}
      {status && <p role="alert">{status}</p>}
    </section>
  );
}
