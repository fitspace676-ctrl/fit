'use client';

import { useState, useTransition, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AutomationAssistTurn, AutomationDraft } from '@fit/types';
import { Button, TextareaField } from '@fit/ui-kit';
import { assistAutomationRuleAction } from './actions';

/** The request schema accepts at most this many earlier turns. */
const MAX_HISTORY = 20;
/** How many recent turns the panel shows. */
const VISIBLE_TURNS = 6;

const styles = stylex.create({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.75rem',
  },
  transcript: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    maxHeight: '10rem',
    overflowY: 'auto',
  },
  turn: {
    margin: 0,
    fontSize: '0.75rem',
    lineHeight: 1.45,
    color: 'var(--color-text-secondary)',
  },
  turnRole: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginInlineEnd: '0.375rem',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  status: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-primary)',
  },
  error: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-error)',
  },
});

type Status = { tone: 'info' | 'error'; text: string } | null;

/**
 * The builder's "Build with AI" panel: the operator describes a rule in plain
 * words, the assistant answers with a draft (applied to the form through
 * `onApply`) or a clarifying question. Nothing is saved here; the operator
 * reviews the filled form and saves it through the ordinary submit.
 */
export function AssistPanel({
  draft,
  onApply,
  assist = assistAutomationRuleAction,
}: {
  draft: AutomationDraft;
  onApply: (draft: AutomationDraft) => void;
  assist?: typeof assistAutomationRuleAction;
}) {
  const t = useTranslations('admin.automation');
  const rawLocale = useLocale();
  const locale: 'ka' | 'en' = rawLocale === 'en' ? 'en' : 'ka';
  const [text, setText] = useState('');
  const [history, setHistory] = useState<AutomationAssistTurn[]>([]);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(null);

  const canSend = text.trim().length > 0 && !pending;

  function send(): void {
    if (!canSend) return;
    const message = text.trim();
    startTransition(async () => {
      const result = await assist({
        message,
        locale,
        draft,
        history: history.slice(-MAX_HISTORY),
      });
      if (!result.ok) {
        setStatus({ tone: 'error', text: result.error });
        return;
      }
      const response = result.data;
      if (response.kind === 'draft') {
        onApply(response.draft);
        setHistory((prev) => [
          ...prev,
          { role: 'user', content: message },
          { role: 'assistant', content: response.explanation },
        ]);
        setStatus({ tone: 'info', text: `${response.explanation} ${t('assist.applied')}` });
      } else {
        if (response.draft) onApply(response.draft);
        setHistory((prev) => [
          ...prev,
          { role: 'user', content: message },
          { role: 'assistant', content: response.question },
        ]);
        setStatus({
          tone: 'info',
          text: response.draft
            ? `${t('assist.appliedPartial')} ${response.question}`
            : response.question,
        });
      }
      setText('');
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      send();
    }
  }

  const visible = history.slice(-VISIBLE_TURNS);

  return (
    <div {...stylex.props(styles.panel)}>
      {visible.length > 0 ? (
        <ul {...stylex.props(styles.transcript)}>
          {visible.map((turn, index) => (
            <li key={`${history.length - visible.length + index}`} {...stylex.props(styles.turn)}>
              <span {...stylex.props(styles.turnRole)}>
                {turn.role === 'user' ? t('assist.you') : t('assist.assistant')}
              </span>
              {turn.content}
            </li>
          ))}
        </ul>
      ) : null}

      <TextareaField
        label={t('assist.title')}
        hint={t('assist.hint')}
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('assist.placeholder')}
      />

      {status?.tone === 'error' ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {status.text}
        </p>
      ) : status ? (
        <p role="status" {...stylex.props(styles.status)}>
          {status.text}
        </p>
      ) : null}

      <div {...stylex.props(styles.footer)}>
        <Button
          variant="primary"
          size="card"
          onClick={send}
          disabled={!canSend}
          label={pending ? t('assist.sending') : t('assist.send')}
        />
      </div>
    </div>
  );
}
