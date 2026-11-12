'use client';

// @fit/admin — the agent's tool-call chrome.
//
// Reads collapse into one quiet activity line ("2 actions done · 0.9s") that
// opens into rows; every write is its own approval card. The card is the only
// place in the panel the blue shows up — the label and the primary button —
// and a destructive write swaps it for red.

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui';
import type { AgentApproval, AgentToolCall } from './types';

type Decide = (decisions: Record<string, AgentApproval['decision']>) => void;

const spin = stylex.keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

const styles = stylex.create({
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', minWidth: 0 },
  // Read group — a recessed tile.
  group: {
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-tile)',
  },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    textAlign: 'start',
    cursor: 'pointer',
    fontFamily: 'var(--font-family-body)',
  },
  groupLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  groupRows: {
    listStyle: 'none',
    margin: 0,
    paddingInline: '0.25rem',
    paddingBlockEnd: '0.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    width: '100%',
    minHeight: '2.5rem',
    paddingInline: '0.625rem',
    paddingBlock: '0.5rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--fc-tile-hover)',
    },
    color: 'var(--color-text-primary)',
    textAlign: 'start',
    fontFamily: 'var(--font-family-body)',
  },
  rowStatic: { cursor: 'default' },
  rowExpandable: { cursor: 'pointer' },
  rowIcon: {
    display: 'grid',
    placeItems: 'center',
    width: '1.5rem',
    height: '1.5rem',
    flexShrink: 0,
    borderRadius: '0.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-icon-secondary)',
  },
  rowText: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
  rowTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.8125rem',
    fontWeight: 600,
  },
  rowSub: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  rowDetail: {
    marginBlockEnd: '0.25rem',
    marginInlineStart: '2.75rem',
    marginInlineEnd: '0.5rem',
    padding: '0.625rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  meta: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  icon12: { width: '0.875rem', height: '0.875rem', flexShrink: 0 },
  icon16: { width: '1rem', height: '1rem', flexShrink: 0 },
  chevron: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-icon-secondary)',
    transition: 'transform var(--duration-fast) ease',
  },
  chevronOpen: { transform: 'rotate(180deg)' },
  accentIcon: { color: 'var(--color-icon-accent)' },
  mutedIcon: { color: 'var(--color-icon-secondary)' },
  primaryIcon: { color: 'var(--color-icon-primary)' },
  redIcon: { color: 'var(--color-icon-red)' },
  spinner: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent-muted)',
    borderTopColor: 'var(--color-accent)',
    animationName: spin,
    animationDuration: '0.8s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
    '@media (prefers-reduced-motion: reduce)': { animationName: 'none' },
  },
  dot: {
    width: '0.375rem',
    height: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-border-emphasized)',
  },
  // Approval card.
  card: {
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    outline: 'none',
  },
  cardPending: { boxShadow: 'var(--shadow-low)' },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.875rem',
    paddingBlockEnd: '0.75rem',
  },
  cardIcon: {
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    height: '2rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--fc-ghost)',
    color: 'var(--color-icon-primary)',
  },
  cardIconDanger: {
    backgroundColor: 'var(--color-background-red)',
    color: 'var(--color-icon-red)',
  },
  cardText: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
  label: {
    fontSize: '0.71875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  labelAccent: { color: 'var(--color-text-accent)' },
  labelDanger: { color: 'var(--color-text-red)' },
  cardTitle: {
    marginBlockStart: '0.125rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    overflowWrap: 'anywhere',
  },
  cardTarget: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    overflowWrap: 'anywhere',
  },
  cardState: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  cardStateAccent: { color: 'var(--color-text-accent)' },
  cardStateRed: { color: 'var(--color-text-red)' },
  fieldsBox: {
    marginInline: '0.875rem',
    marginBlockEnd: '0.75rem',
    padding: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--fc-tile)',
  },
  detailsToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    marginInline: '0.875rem',
    marginBlockEnd: '0.75rem',
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    cursor: 'pointer',
  },
  note: {
    marginInline: '0.875rem',
    marginBlockStart: 0,
    marginBlockEnd: '0.75rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-red)',
    overflowWrap: 'anywhere',
  },
  warning: {
    display: 'flex',
    gap: '0.5rem',
    marginInline: '0.875rem',
    marginBlockStart: 0,
    marginBlockEnd: '0.75rem',
    padding: '0.625rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-background-red)',
    color: 'var(--color-text-red)',
    fontSize: '0.8125rem',
    lineHeight: 1.4,
  },
  warningIcon: { width: '1rem', height: '1rem', flexShrink: 0, marginBlockStart: '0.125rem' },
  actions: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.625rem',
    borderBlockStartWidth: '1px',
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: 'var(--color-border)',
    backgroundColor: 'var(--fc-tile)',
  },
  // Pill buttons, matching the composer's send button.
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    height: '2.25rem',
    paddingInline: '1rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition:
      'background-color var(--duration-fast) ease, border-color var(--duration-fast) ease',
    ':focus-visible': { outline: 'none', boxShadow: 'var(--fc-focus-ring)' },
    ':disabled': { cursor: 'not-allowed', opacity: 0.55 },
  },
  approve: {
    flex: 1,
    borderColor: 'transparent',
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover': 'var(--fc-accent-hover)',
    },
    color: 'var(--color-on-accent)',
  },
  approveDanger: {
    backgroundColor: {
      default: 'var(--color-error)',
      ':hover': 'var(--color-icon-red)',
    },
    color: 'var(--color-on-error)',
  },
  reject: {
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--fc-tile)',
    },
    color: 'var(--color-text-primary)',
  },
  pressed: {
    borderColor: 'var(--color-text-primary)',
  },
  approveAll: {
    alignSelf: 'flex-start',
    borderColor: 'var(--color-text-primary)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-text-primary)',
    },
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-background-surface)',
    },
  },
  // Approval inputs: a label / value grid, nested objects indented.
  fields: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 5.5rem) minmax(0, 1fr)',
    columnGap: '0.75rem',
    rowGap: '0.25rem',
    margin: 0,
    fontSize: '0.75rem',
    lineHeight: 1.6,
  },
  fieldPair: { display: 'contents' },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  fieldKey: { margin: 0, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' },
  fieldValue: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: '0.78125rem',
    color: 'var(--color-text-primary)',
  },
});

/** A tool's title, falling back to its name made readable. */
function titleOf(call: AgentToolCall): string {
  return call.title || call.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.-]/g, ' ');
}

function InputValues({ value }: { value: unknown }) {
  const t = useTranslations('admin.agent');
  if (value === null || value === undefined) return <span>{t('noValue')}</span>;
  if (typeof value === 'boolean') return <span>{t(value ? 'values.TRUE' : 'values.FALSE')}</span>;
  if (typeof value === 'string')
    return <span>{t.has(`values.${value}`) ? t(`values.${value}`) : value}</span>;
  if (typeof value === 'number') return <span>{value}</span>;
  if (typeof value !== 'object') return null;
  return (
    <dl {...stylex.props(styles.fields)}>
      {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
        <div key={key} {...stylex.props(styles.fieldPair)}>
          <dt {...stylex.props(styles.fieldKey)}>
            {t.has(`fields.${key}`)
              ? t(`fields.${key}`)
              : key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')}
          </dt>
          <dd {...stylex.props(styles.fieldValue)}>
            <InputValues value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatusGlyph({ status }: { status: AgentToolCall['status'] }) {
  if (status === 'running') return <span {...stylex.props(styles.spinner)} aria-hidden />;
  if (status === 'complete')
    return <Icon name="check" {...stylex.props(styles.icon12, styles.primaryIcon)} />;
  if (status === 'error')
    return <Icon name="alert" {...stylex.props(styles.icon12, styles.redIcon)} />;
  if (status === 'rejected' || status === 'cancelled')
    return <Icon name="x" {...stylex.props(styles.icon12, styles.mutedIcon)} />;
  return <span {...stylex.props(styles.dot)} aria-hidden />;
}

function Duration({ ms }: { ms?: number }) {
  const t = useTranslations('admin.agent');
  if (ms === undefined) return null;
  return <span>{t('duration', { seconds: (ms / 1000).toFixed(1) })}</span>;
}

/** One read in the activity log; opens on its inputs or error. */
function ToolRow({ call }: { call: AgentToolCall }) {
  const t = useTranslations('admin.agent');
  const [open, setOpen] = useState(false);
  const expandable = Boolean(call.input || call.errorMessage);
  const sub = call.status === 'error' ? call.errorMessage : (call.resultSummary ?? call.target);
  return (
    <li>
      <button
        type="button"
        aria-expanded={expandable ? open : undefined}
        onClick={() => expandable && setOpen((v) => !v)}
        {...stylex.props(styles.row, expandable ? styles.rowExpandable : styles.rowStatic)}
      >
        <span {...stylex.props(styles.rowIcon)} aria-hidden>
          <Icon name={call.kind === 'write' ? 'pencil' : 'eye'} {...stylex.props(styles.icon12)} />
        </span>
        <span {...stylex.props(styles.rowText)}>
          <span {...stylex.props(styles.rowTitle)}>{titleOf(call)}</span>
          {sub ? <span {...stylex.props(styles.rowSub)}>{sub}</span> : null}
        </span>
        <span {...stylex.props(styles.meta)}>
          <Duration ms={call.durationMs} />
          <StatusGlyph status={call.status} />
          <span {...stylex.props(styles.visuallyHidden)}>{t(`status.${call.status}`)}</span>
        </span>
      </button>
      {open && expandable ? (
        <div {...stylex.props(styles.rowDetail)}>
          {call.input ? <InputValues value={call.input} /> : null}
          {call.errorMessage ? (
            <p {...stylex.props(styles.errorText)}>{call.errorMessage}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** The reads of one step as a single collapsible line. */
function ToolGroup({ calls }: { calls: AgentToolCall[] }) {
  const t = useTranslations('admin.agent');
  const failed = calls.some((c) => c.status === 'error');
  const [open, setOpen] = useState(failed);
  const running = calls.some((c) => c.status === 'running' || c.status === 'pending');
  const total = calls.reduce((sum, c) => sum + (c.durationMs ?? 0), 0);
  return (
    <div {...stylex.props(styles.group)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        {...stylex.props(styles.groupHead)}
      >
        {running ? (
          <span {...stylex.props(styles.spinner)} aria-hidden />
        ) : (
          <Icon
            name={failed ? 'alert' : 'spark'}
            {...stylex.props(styles.icon12, failed ? styles.redIcon : styles.mutedIcon)}
          />
        )}
        <span role="status" {...stylex.props(styles.groupLabel)}>
          {running ? t('toolsRunning') : t('toolsDone', { count: calls.length })}
        </span>
        {!running ? (
          <span {...stylex.props(styles.meta)}>
            <Duration ms={total} />
          </span>
        ) : null}
        <Icon name="chevronDown" {...stylex.props(styles.chevron, open && styles.chevronOpen)} />
      </button>
      {open ? (
        <ul {...stylex.props(styles.groupRows)}>
          {calls.map((call) => (
            <ToolRow key={call.id} call={call} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One write: what it changes, and the operator's decision on it. */
function ApprovalCard({
  call,
  busy,
  decide,
  collapsed,
}: {
  call: AgentToolCall;
  busy: boolean;
  decide: Decide;
  /** A repeat of the card above it — details start folded so the list stays short. */
  collapsed: boolean;
}) {
  const t = useTranslations('admin.agent');
  const ref = useRef<HTMLDivElement>(null);
  const pending = call.status === 'awaiting_approval';
  const danger = Boolean(call.destructive);
  const [showFields, setShowFields] = useState(!collapsed);
  useEffect(() => {
    if (pending && !collapsed) ref.current?.focus();
  }, [pending, collapsed]);
  const title = titleOf(call);
  const label = pending ? (danger ? t('irreversible') : t('needsApproval')) : t('write');
  return (
    <div
      ref={ref}
      tabIndex={pending ? -1 : undefined}
      aria-label={title}
      {...stylex.props(styles.card, pending && styles.cardPending)}
    >
      <div {...stylex.props(styles.cardHead)}>
        <span
          {...stylex.props(styles.cardIcon, danger && pending && styles.cardIconDanger)}
          aria-hidden
        >
          <Icon name={danger ? 'trash' : 'pencil'} {...stylex.props(styles.icon16)} />
        </span>
        <span {...stylex.props(styles.cardText)}>
          <span
            {...stylex.props(
              styles.label,
              pending && (danger ? styles.labelDanger : styles.labelAccent),
            )}
          >
            {label}
          </span>
          <span {...stylex.props(styles.cardTitle)}>{title}</span>
          {call.target ? <span {...stylex.props(styles.cardTarget)}>{call.target}</span> : null}
        </span>
        {!pending ? (
          <span
            role="status"
            {...stylex.props(
              styles.cardState,
              call.status === 'running' && styles.cardStateAccent,
              call.status === 'error' && styles.cardStateRed,
            )}
          >
            <StatusGlyph status={call.status} />
            {t(`status.${call.status}`)}
            {call.durationMs !== undefined ? <> · {(call.durationMs / 1000).toFixed(1)}</> : null}
          </span>
        ) : null}
      </div>
      {call.input && pending && showFields ? (
        <div {...stylex.props(styles.fieldsBox)}>
          <InputValues value={call.input} />
        </div>
      ) : null}
      {call.input && pending && !showFields ? (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setShowFields(true)}
          {...stylex.props(styles.detailsToggle)}
        >
          {t('details')}
          <Icon name="chevronDown" {...stylex.props(styles.icon12)} />
        </button>
      ) : null}
      {pending && danger ? (
        <p {...stylex.props(styles.warning)}>
          <Icon name="alert" {...stylex.props(styles.warningIcon)} />
          {t('destructiveWarning')}
        </p>
      ) : null}
      {!pending && call.resultSummary ? (
        <p {...stylex.props(styles.note)}>{call.resultSummary}</p>
      ) : null}
      {!pending && call.errorMessage ? (
        <p {...stylex.props(styles.note, styles.errorText)}>{call.errorMessage}</p>
      ) : null}
      {call.decision && pending ? (
        <p {...stylex.props(styles.note)}>
          {t(call.decision === 'approve' ? 'approvedDecision' : 'rejectedDecision')}
        </p>
      ) : null}
      {pending ? (
        <div {...stylex.props(styles.actions)}>
          <button
            type="button"
            disabled={busy}
            aria-pressed={call.decision === 'approve'}
            onClick={() => decide({ [call.id]: 'approve' })}
            {...stylex.props(styles.pill, styles.approve, danger && styles.approveDanger)}
          >
            <Icon name="check" {...stylex.props(styles.icon16)} />
            {danger ? t('approveAndDelete') : t('approve')}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={call.decision === 'reject'}
            onClick={() => decide({ [call.id]: 'reject' })}
            {...stylex.props(
              styles.pill,
              styles.reject,
              call.decision === 'reject' && styles.pressed,
            )}
          >
            {t('reject')}
          </button>
        </div>
      ) : null}
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
  decide: Decide;
}) {
  const t = useTranslations('admin.agent');
  // A write the agent asked for is a card in every state; everything else
  // (reads, the toolbox, a refused unknown tool) is activity.
  const isCard = (c: AgentToolCall) => c.kind === 'write' || c.status === 'awaiting_approval';
  const reads = calls.filter((c) => !isCard(c));
  const writes = calls.filter(isCard);
  const pending = writes.filter((c) => c.status === 'awaiting_approval');
  return (
    <div {...stylex.props(styles.list)}>
      {reads.length > 0 ? <ToolGroup calls={reads} /> : null}
      {writes.map((call, i) => (
        <ApprovalCard
          key={call.id}
          call={call}
          busy={busy}
          decide={decide}
          collapsed={i > 0 && writes[i - 1]!.name === call.name}
        />
      ))}
      {pending.length > 1 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(Object.fromEntries(pending.map((c) => [c.id, 'approve'])))}
          {...stylex.props(styles.pill, styles.approveAll)}
        >
          {t('approveAllCount', { count: pending.length })}
        </button>
      ) : null}
    </div>
  );
}
