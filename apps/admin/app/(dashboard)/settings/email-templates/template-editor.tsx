'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { EmailTemplateRow } from '@fit/types';
import { Badge, Button } from '@fit/ui-kit';
import { Icon, useToast } from '@/components/ui';
import { resetEmailTemplateAction, saveEmailTemplateAction } from './actions';

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    width: '100%',
    paddingInline: '1rem',
    paddingBlock: '0.875rem',
    borderWidth: 0,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    cursor: 'pointer',
    textAlign: 'start',
    fontFamily: 'var(--font-family-body)',
  },
  names: { display: 'flex', flexDirection: 'column', gap: '0.125rem', flex: 1, minWidth: 0 },
  name: { fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text-primary)' },
  desc: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  chevron: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
    transition: 'transform var(--duration-fast) cubic-bezier(0.32, 0.72, 0, 1)',
  },
  chevronOpen: { transform: 'rotate(180deg)' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
    paddingInline: '1rem',
    paddingBlockEnd: '1.25rem',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  label: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  input: {
    height: '2.5rem',
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.875rem',
  },
  textarea: {
    minHeight: '11rem',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.75rem',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  tokens: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' },
  tokenHint: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  token: {
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  actions: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  spacer: { flex: 1 },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  error: { fontSize: '0.8125rem', color: 'var(--color-error)' },
});

/**
 * One system email's editor.
 *
 * Collapsed by default — twenty open textareas is a wall, and staff arrive
 * looking for one of them. The body is plain text on purpose: the branded shell
 * turns blank-line-separated paragraphs into HTML at send time, so changing a
 * sentence never means writing markup.
 */
export function TemplateEditor({ template }: { template: EmailTemplateRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const dirty =
    subject !== template.subject || body !== template.body || enabled !== template.enabled;

  function save(): void {
    setError(null);
    startSave(async () => {
      const result = await saveEmailTemplateAction(template.key, { subject, body, enabled });
      if (result.ok) {
        toast(`${template.name} saved`, { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function reset(): void {
    setError(null);
    startSave(async () => {
      const result = await resetEmailTemplateAction(template.key);
      if (result.ok) {
        setSubject(result.data.subject);
        setBody(result.data.body);
        setEnabled(result.data.enabled);
        toast(`${template.name} restored to the default wording`, {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  /** Append a token to the body — quicker and less error-prone than typing braces. */
  function insertToken(token: string): void {
    setBody((current) => `${current}{{${token}}}`);
  }

  return (
    <div {...stylex.props(styles.row)}>
      <button type="button" onClick={() => setOpen((v) => !v)} {...stylex.props(styles.summary)}>
        <div {...stylex.props(styles.names)}>
          <span {...stylex.props(styles.name)}>{template.name}</span>
          <span {...stylex.props(styles.desc)}>{template.description}</span>
        </div>
        {!template.enabled ? <Badge tone="neutral" label="Off" /> : null}
        {template.customised ? <Badge tone="accent" label="Edited" /> : null}
        <Icon name="chevronDown" {...stylex.props(styles.chevron, open && styles.chevronOpen)} />
      </button>

      {open ? (
        <div {...stylex.props(styles.body)}>
          <div {...stylex.props(styles.field)}>
            <label htmlFor={`subject-${template.key}`} {...stylex.props(styles.label)}>
              Subject
            </label>
            <input
              id={`subject-${template.key}`}
              type="text"
              value={subject}
              disabled={saving}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
              {...stylex.props(styles.input)}
            />
          </div>

          <div {...stylex.props(styles.field)}>
            <label htmlFor={`body-${template.key}`} {...stylex.props(styles.label)}>
              Message
            </label>
            <textarea
              id={`body-${template.key}`}
              value={body}
              disabled={saving}
              maxLength={10000}
              onChange={(e) => setBody(e.target.value)}
              {...stylex.props(styles.textarea)}
            />
          </div>

          <div {...stylex.props(styles.tokens)}>
            <span {...stylex.props(styles.tokenHint)}>Insert:</span>
            {template.tokens.map((token) => (
              <button
                key={token}
                type="button"
                disabled={saving}
                onClick={() => insertToken(token)}
                {...stylex.props(styles.token)}
              >
                {`{{${token}}}`}
              </button>
            ))}
          </div>

          <div {...stylex.props(styles.actions)}>
            <label {...stylex.props(styles.toggle)}>
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Send this email
            </label>
            <span {...stylex.props(styles.spacer)} />
            {template.customised ? (
              <Button
                variant="ghost"
                size="inline"
                onClick={reset}
                disabled={saving}
                label="Restore default"
              />
            ) : null}
            <Button
              variant="primary"
              size="inline"
              onClick={save}
              disabled={!dirty || saving}
              icon={<Icon name="check" {...stylex.props(styles.kitGlyph)} />}
              label={saving ? 'Saving…' : 'Save'}
            />
          </div>

          {error !== null ? <p {...stylex.props(styles.error)}>{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
