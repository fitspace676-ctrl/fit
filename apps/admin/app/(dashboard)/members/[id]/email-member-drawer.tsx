'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { interpolateMergeFields, type EmailTemplateOption, type MergeValues } from '@fit/types';
import { Btn, Drawer, Field, Icon, Input, Textarea, useToast } from '@/components/ui';
import { listEmailTemplatesAction, sendMemberEmailAction } from '../actions';

/** Slide-out animation duration — keep in sync with the Drawer's exit (~0.28s). */
const CLOSE_MS = 260;

const styles = stylex.create({
  // Recipient — a compact identity card so staff see exactly who they're writing.
  recipient: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    padding: '0.875rem 1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  avatar: {
    display: 'grid',
    placeItems: 'center',
    width: '2.5rem',
    height: '2.5rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
    fontSize: '0.875rem',
    fontWeight: 700,
  },
  recipientCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    minWidth: 0,
  },
  recipientEyebrow: {
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--color-text-secondary)',
  },
  recipientName: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  recipientEmail: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  // Template picker as selectable chips — every option visible, the active one
  // carrying the brand accent. No native <select> dropdown.
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.4375rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
    fontSize: '0.8125rem',
    fontWeight: 550,
    fontFamily: 'var(--font-family-body)',
    cursor: 'pointer',
    transition:
      'background-color var(--duration-fast) cubic-bezier(0.32, 0.72, 0, 1), border-color var(--duration-fast) cubic-bezier(0.32, 0.72, 0, 1), color var(--duration-fast) cubic-bezier(0.32, 0.72, 0, 1)',
  },
  chipActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  chipIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  hintIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
    color: 'var(--color-text-accent)',
  },
  // The message field grows to fill the drawer so composing feels roomy.
  messageField: {
    flex: 1,
    minHeight: '9rem',
  },
  messageInput: {
    height: '100%',
    minHeight: '9rem',
    resize: 'none',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
});

/** Two-letter initials for the recipient avatar (first + last word of the name). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** The "compose from scratch" pseudo-template id. */
const BLANK = '';

/**
 * The member detail's **Email** action: a button that slides open a drawer to send a
 * one-off email to this member. Staff start from one of the gym's email templates —
 * unified from the marketing and automation stores — which pre-fills the subject/body
 * personalized to this member via {@link interpolateMergeFields} (tokens the client
 * can't fill stay raw and are completed by the server on send), or "Blank" to write
 * freely. Both fields stay editable. Send goes through {@link sendMemberEmailAction};
 * a success toast slides the drawer away, an error keeps it open to retry.
 */
export function EmailMemberDrawer({
  memberId,
  memberName,
  memberEmail,
  mergeValues,
}: {
  memberId: string;
  memberName: string;
  memberEmail: string;
  mergeValues: MergeValues;
}) {
  const t = useTranslations('admin.members');
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplateOption[]>([]);
  const [templateId, setTemplateId] = useState<string>(BLANK);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, startSending] = useTransition();

  function open(): void {
    setTemplateId(BLANK);
    setSubject('');
    setBody('');
    setTemplates([]);
    setClosing(false);
    setIsOpen(true);
    // Lazy-load the gym's email templates; a failure (or no access) just leaves the
    // picker empty — composing a custom message always works.
    void listEmailTemplatesAction().then(setTemplates);
  }

  function handleClose(): void {
    if (closing) return;
    setClosing(true);
    // Keep the drawer mounted for the slide-out, then unmount.
    window.setTimeout(() => {
      setIsOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  }

  function pickTemplate(id: string): void {
    setTemplateId(id);
    const template = templates.find((entry) => entry.id === id);
    if (!template) {
      setSubject('');
      setBody('');
      return;
    }
    setSubject(interpolateMergeFields(template.subject, mergeValues, { blankMissing: false }));
    setBody(interpolateMergeFields(template.body, mergeValues, { blankMissing: false }));
  }

  function send(): void {
    startSending(async () => {
      const result = await sendMemberEmailAction(memberId, {
        subject: subject.trim(),
        body: body.trim(),
      });
      if (result.ok) {
        toast(t('email.toastSent', { name: memberName }), { tone: 'success', icon: 'check' });
        handleClose();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <>
      <Btn v="outline" size="sm" icon="mail" onClick={open}>
        {t('email.button')}
      </Btn>

      {isOpen ? (
        <Drawer
          open
          onClose={handleClose}
          closing={closing}
          side="right"
          size="lg"
          title={t('email.title')}
          footer={
            <div {...stylex.props(styles.footer)}>
              <Btn v="ghost" size="md" onClick={handleClose} disabled={sending}>
                {t('email.cancel')}
              </Btn>
              <Btn v="primary" size="md" icon="mail" onClick={send} disabled={!canSend}>
                {sending ? t('email.sending') : t('email.send')}
              </Btn>
            </div>
          }
        >
          <div {...stylex.props(styles.recipient)}>
            <span {...stylex.props(styles.avatar)}>{initialsOf(memberName)}</span>
            <div {...stylex.props(styles.recipientCol)}>
              <span {...stylex.props(styles.recipientEyebrow)}>{t('email.recipient')}</span>
              <span {...stylex.props(styles.recipientName)}>{memberName}</span>
              <span {...stylex.props(styles.recipientEmail)}>{memberEmail}</span>
            </div>
          </div>

          {templates.length > 0 ? (
            <div {...stylex.props(styles.section)}>
              <span {...stylex.props(styles.sectionLabel)}>{t('email.templateLabel')}</span>
              <div {...stylex.props(styles.chips)}>
                <TemplateChip
                  label={t('email.blankTemplate')}
                  active={templateId === BLANK}
                  onClick={() => pickTemplate(BLANK)}
                />
                {templates.map((template) => (
                  <TemplateChip
                    key={template.id}
                    label={template.name}
                    active={templateId === template.id}
                    onClick={() => pickTemplate(template.id)}
                  />
                ))}
              </div>
              <span {...stylex.props(styles.hint)}>
                <Icon name="spark" sw={2} {...stylex.props(styles.hintIcon)} />
                {t('email.mergeHint', { name: memberName })}
              </span>
            </div>
          ) : null}

          <Field label={t('email.subjectLabel')} htmlFor="email-subject">
            <Input
              id="email-subject"
              value={subject}
              maxLength={200}
              placeholder={t('email.subjectPlaceholder')}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Field>

          <Field
            label={t('email.bodyLabel')}
            htmlFor="email-body"
            className={stylex.props(styles.messageField).className}
          >
            <Textarea
              id="email-body"
              value={body}
              maxLength={5000}
              placeholder={t('email.bodyPlaceholder')}
              onChange={(event) => setBody(event.target.value)}
              {...stylex.props(styles.messageInput)}
            />
          </Field>
        </Drawer>
      ) : null}
    </>
  );
}

/** One selectable template chip — accent-filled when active. */
function TemplateChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      {...stylex.props(styles.chip, active && styles.chipActive)}
    >
      {active ? <Icon name="check" sw={2.5} {...stylex.props(styles.chipIcon)} /> : null}
      {label}
    </button>
  );
}
