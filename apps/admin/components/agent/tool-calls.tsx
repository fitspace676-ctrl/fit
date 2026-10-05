'use client';

import { useEffect, useRef } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Btn } from '@/components/ui';
import type { AgentApproval, AgentToolCall } from './types';

const styles = stylex.create({
  action: { minHeight: '2rem', paddingInline: '0.625rem', paddingBlock: '0.375rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 },
  card: {
    padding: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.8125rem',
    overflowWrap: 'anywhere',
  },
  warning: { borderColor: 'var(--color-text-red)', backgroundColor: 'var(--color-error-muted)' },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    alignItems: 'center',
    marginBlock: '0.5rem',
  },
  meta: { color: 'var(--color-text-secondary)', fontSize: '0.75rem' },
  error: { color: 'var(--color-text-red)' },
  value: { marginInlineStart: '0.75rem', whiteSpace: 'pre-wrap' },
});

function InputValues({ value }: { value: unknown }) {
  const t = useTranslations('admin.agent');
  if (value === null || value === undefined) return <span>{t('noValue')}</span>;
  if (typeof value === 'boolean') return <span>{t(value ? 'yes' : 'no')}</span>;
  if (typeof value === 'string' || typeof value === 'number') return <span>{value}</span>;
  if (typeof value !== 'object') return null;
  return (
    <dl>
      {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
        <div key={key}>
          <dt>{key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')}:</dt>
          <dd {...stylex.props(styles.value)}>
            <InputValues value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ToolCard({
  call,
  busy,
  decide,
}: {
  call: AgentToolCall;
  busy: boolean;
  decide: (decisions: Record<string, AgentApproval['decision']>) => void;
}) {
  const t = useTranslations('admin.agent');
  const ref = useRef<HTMLDivElement>(null);
  const pending = call.status === 'awaiting_approval';
  useEffect(() => {
    if (pending) ref.current?.focus();
  }, [pending]);
  const title = call.title || call.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.-]/g, ' ');
  return (
    <div
      ref={ref}
      tabIndex={pending ? -1 : undefined}
      aria-label={title}
      {...stylex.props(styles.card, pending && call.destructive && styles.warning)}
    >
      <strong>{title}</strong>
      <div {...stylex.props(styles.row, styles.meta)}>
        {call.kind && <span>{t(call.kind)}</span>}
        <span role="status">{t(`status.${call.status}`)}</span>
        {call.durationMs !== undefined && (
          <span>{t('duration', { seconds: (call.durationMs / 1000).toFixed(1) })}</span>
        )}
      </div>
      {call.target && <p>{call.target}</p>}
      {call.resultSummary && <p>{call.resultSummary}</p>}
      {pending && call.destructive && (
        <p {...stylex.props(styles.error)}>{t('destructiveWarning')}</p>
      )}
      {(call.input || call.errorMessage) && (
        <details open={pending}>
          <summary>{t('details')}</summary>
          {call.input && <InputValues value={call.input} />}
          {call.errorMessage && <p {...stylex.props(styles.error)}>{call.errorMessage}</p>}
        </details>
      )}
      {call.decision && (
        <p>{t(call.decision === 'approve' ? 'approvedDecision' : 'rejectedDecision')}</p>
      )}
      {pending && (
        <div {...stylex.props(styles.row)}>
          <Btn
            size="sm"
            {...stylex.props(styles.action)}
            disabled={busy}
            onClick={() => decide({ [call.id]: 'approve' })}
          >
            {t('approve')}
          </Btn>
          <Btn
            size="sm"
            {...stylex.props(styles.action)}
            v="outline"
            disabled={busy}
            aria-pressed={call.decision === 'reject'}
            onClick={() => decide({ [call.id]: 'reject' })}
          >
            {t('reject')}
          </Btn>
        </div>
      )}
    </div>
  );
}

export function AgentToolCalls({
  calls,
  busy,
  decide,
}: {
  calls: AgentToolCall[];
  busy: boolean;
  decide: (decisions: Record<string, AgentApproval['decision']>) => void;
}) {
  const t = useTranslations('admin.agent');
  const pending = calls.filter((c) => c.status === 'awaiting_approval');
  return (
    <div {...stylex.props(styles.list)}>
      {calls.map((call) => (
        <ToolCard key={call.id} call={call} busy={busy} decide={decide} />
      ))}
      {pending.length > 1 && (
        <Btn
          size="sm"
          {...stylex.props(styles.action)}
          disabled={busy}
          onClick={() => decide(Object.fromEntries(pending.map((c) => [c.id, 'approve'])))}
        >
          {t('approveAll')}
        </Btn>
      )}
    </div>
  );
}
