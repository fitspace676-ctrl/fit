'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import {
  AUTOMATION_TIMING_CATALOG,
  AUTOMATION_TRIGGER_CATALOG,
  type AutomationActionType,
  type AutomationRuleRow,
  type AutomationTimingOffset,
  type AutomationTriggerType,
  AUTOMATION_MERGE_FIELDS,
  AUTOMATION_MERGE_GROUPS,
} from '@fit/types';
import { Btn, Drawer, Field, Icon, Input, Select, Textarea, useToast } from '@/components/ui';
import { createAutomationRuleAction, updateAutomationRuleAction } from './actions';
import {
  ACTION_ICONS,
  ACTION_ORDER,
  CATEGORY_KEY,
  TRIGGER_CATEGORY_ORDER,
  TRIGGER_META,
  triggerNeedsDays,
} from './automation-meta';

/** Seed a builder either fresh, from a rule (edit), or from a template (create-from). */
export type RuleFormSeed = AutomationRuleRow | undefined;

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  grid2: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  actionRow: {
    display: 'grid',
    gap: '0.5rem',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    color: 'var(--color-text-primary)',
    textAlign: 'left',
  },
  actionBtnActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  actionIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
  },
  vars: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '11rem',
    overflowY: 'auto',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    padding: '0.625rem',
    backgroundColor: 'var(--color-background-muted)',
  },
  varHint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  varGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  varGroupLabel: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    color: 'var(--color-text-secondary)',
  },
  varChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  varChip: {
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
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.875rem',
    paddingBlock: '0.625rem',
  },
  toggleLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  toggleTitle: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  toggleHint: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
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
  switch: {
    position: 'relative',
    height: '1.5rem',
    width: '2.75rem',
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    backgroundColor: 'var(--color-border)',
    transition: 'background-color 150ms ease',
  },
  switchOn: {
    backgroundColor: 'var(--color-accent)',
  },
  knob: {
    position: 'absolute',
    top: '0.1875rem',
    left: '0.1875rem',
    height: '1.125rem',
    width: '1.125rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-on-accent)',
    transition: 'transform 150ms ease',
    transform: 'translateX(0)',
  },
  knobOn: {
    transform: 'translateX(1.25rem)',
  },
});

/** The controlled form state — inputs as the browser hands them over. */
interface FormState {
  name: string;
  triggerType: AutomationTriggerType | '';
  days: string;
  timingOffset: AutomationTimingOffset;
  actionType: AutomationActionType;
  subject: string;
  body: string;
  active: boolean;
}

/** Seed the form from an existing rule / template (edit or create-from), else capture defaults. */
function seedForm(seed: RuleFormSeed): FormState {
  return {
    name: seed?.name ?? '',
    triggerType: seed?.triggerType ?? '',
    days: seed?.triggerConfig?.days !== undefined ? String(seed.triggerConfig.days) : '',
    timingOffset: seed?.timingOffset ?? 'day_of',
    actionType: seed?.actionType ?? 'push_notification',
    subject: seed?.actionConfig?.subject ?? '',
    body: seed?.actionConfig?.body ?? '',
    active: seed?.active ?? true,
  };
}

type Props = {
  mode: 'create' | 'edit';
  /** In edit mode, the rule being edited; in create mode, an optional template to clone. */
  seed?: RuleFormSeed;
  onClose: () => void;
};

/**
 * The Create / Edit Automation builder (T12.6) — one Modal form: name, a
 * category-grouped trigger picker with a conditional day/count input, the
 * timing-offset selector, the action picker, and the message editor with an
 * insertable merge-variable palette. Wired to the T12.5 rules API through the
 * `AutomationManage` Server Actions. Money-free, so state is plain strings the
 * submit coerces and the shared Zod schema re-validates.
 */
export function RuleFormDialog({ mode, seed, onClose }: Props) {
  const t = useTranslations('admin.automation');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => seedForm(seed));
  const editId = mode === 'edit' ? seed?.id : undefined;
  // Exit animation: flip `closing` to play the drawer's slide-out, then drop the
  // dialog once it has finished (~0.26s) so it animates away instead of vanishing.
  const [closing, setClosing] = useState(false);

  function handleClose(): void {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 260);
  }

  const needsDays = form.triggerType !== '' && triggerNeedsDays(form.triggerType);
  const daysMeta = form.triggerType !== '' ? TRIGGER_META.get(form.triggerType) : undefined;
  const isEmail = form.actionType === 'email';

  const canSubmit =
    form.name.trim().length > 0 &&
    form.triggerType !== '' &&
    form.body.trim().length > 0 &&
    (!needsDays || Number.parseInt(form.days, 10) >= 1);

  /**
   * The merge-field chips, grouped for the picker. The whole catalogue: it is
   * curated to fields the executor can actually fill, and the per-gym switch list
   * that once trimmed it is gone along with its settings screen.
   */
  const mergeGroups = useMemo(
    () =>
      AUTOMATION_MERGE_GROUPS.map((group) => ({
        group,
        fields: AUTOMATION_MERGE_FIELDS.filter((field) => field.group === group),
      })).filter((entry) => entry.fields.length > 0),
    [],
  );

  /** Trigger `<optgroup>`s, grouped by category in the catalog's declared order. */
  const triggerGroups = useMemo(
    () =>
      TRIGGER_CATEGORY_ORDER.map((category) => ({
        category,
        triggers: AUTOMATION_TRIGGER_CATALOG.filter((tg) => tg.category === category),
      })),
    [],
  );

  function patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Append a merge token to the message body (the executor fills it in at send). */
  function insertToken(token: string): void {
    setForm((prev) => ({
      ...prev,
      body:
        prev.body.length > 0 && !prev.body.endsWith(' ')
          ? `${prev.body} ${token}`
          : prev.body + token,
    }));
  }

  /** Reset the day/count when the trigger changes so a stale value can't leak across triggers. */
  function selectTrigger(value: string): void {
    const trigger = value as AutomationTriggerType;
    setForm((prev) => ({ ...prev, triggerType: trigger, days: '' }));
  }

  function submit(): void {
    if (!canSubmit || pending || form.triggerType === '') return;
    setError(null);
    const trimmedSubject = form.subject.trim();
    const payload = {
      name: form.name.trim(),
      triggerType: form.triggerType,
      triggerConfig: needsDays ? { days: Number.parseInt(form.days, 10) } : {},
      timingOffset: form.timingOffset,
      actionType: form.actionType,
      actionConfig: {
        body: form.body.trim(),
        ...(isEmail && trimmedSubject ? { subject: trimmedSubject } : {}),
      },
      active: form.active,
    };
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createAutomationRuleAction(payload)
          : await updateAutomationRuleAction(editId as string, payload);
      if (result.ok) {
        toast(mode === 'create' ? t('form.created') : t('form.updated'), {
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
      size="lg"
      title={mode === 'create' ? t('form.addTitle') : t('form.editTitle')}
      footer={
        <div {...stylex.props(styles.footerRow)}>
          <Btn v="outline" size="md" onClick={handleClose} disabled={pending}>
            {t('form.cancel')}
          </Btn>
          <Btn
            v="primary"
            size="md"
            onClick={submit}
            disabled={pending || !canSubmit}
            className="btn-brand"
          >
            {pending
              ? t('form.saving')
              : mode === 'create'
                ? t('form.addSubmit')
                : t('form.editSubmit')}
          </Btn>
        </div>
      }
    >
      <div {...stylex.props(styles.form)}>
        <p {...stylex.props(styles.description)}>
          {mode === 'create' ? t('form.addDescription') : t('form.editDescription')}
        </p>

        {error ? (
          <div {...stylex.props(styles.errorCard)}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        <Field label={t('form.name')}>
          <Input
            value={form.name}
            onChange={(e) => patch('name', e.target.value)}
            placeholder={t('form.namePlaceholder')}
            autoFocus
          />
        </Field>

        {/* Trigger picker — grouped by category. */}
        <Field label={t('form.trigger')} hint={t('form.triggerHint')}>
          <Select value={form.triggerType} onChange={(e) => selectTrigger(e.target.value)}>
            <option value="" disabled>
              {t('form.triggerPlaceholder')}
            </option>
            {triggerGroups.map((group) => (
              <optgroup
                key={group.category}
                label={t(`categories.${CATEGORY_KEY[group.category]}`)}
              >
                {group.triggers.map((tg) => (
                  <option key={tg.value} value={tg.value}>
                    {t(`triggers.${tg.value}`)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <div {...stylex.props(styles.grid2)}>
          {/* Day/count input — only for the needsDays triggers. */}
          {needsDays ? (
            <Field
              label={
                daysMeta?.daysLabel === 'check-ins' ? t('form.milestoneLabel') : t('form.daysLabel')
              }
            >
              <Input
                type="number"
                min={1}
                value={form.days}
                onChange={(e) => patch('days', e.target.value)}
                placeholder={t('form.daysPlaceholder')}
              />
            </Field>
          ) : null}

          {/* Timing offset — when the action fires relative to the trigger. */}
          <Field label={t('form.timing')} hint={t('form.timingHint')}>
            <Select
              value={form.timingOffset}
              onChange={(e) => patch('timingOffset', e.target.value as AutomationTimingOffset)}
            >
              {AUTOMATION_TIMING_CATALOG.map((timing) => (
                <option key={timing.value} value={timing.value}>
                  {t(`timings.${timing.value}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Action picker — exactly one action per rule. */}
        <Field label={t('form.action')}>
          <div {...stylex.props(styles.actionRow)}>
            {ACTION_ORDER.map((action) => {
              const active = form.actionType === action;
              return (
                <button
                  key={action}
                  type="button"
                  aria-pressed={active}
                  onClick={() => patch('actionType', action)}
                  {...stylex.props(styles.actionBtn, active && styles.actionBtnActive)}
                >
                  <Icon name={ACTION_ICONS[action]} {...stylex.props(styles.actionIcon)} />
                  {t(`actions.${action}`)}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Email subject — only for the email action. */}
        {isEmail ? (
          <Field label={t('form.subject')}>
            <Input
              value={form.subject}
              onChange={(e) => patch('subject', e.target.value)}
              placeholder={t('form.subjectPlaceholder')}
            />
          </Field>
        ) : null}

        {/* Message body + merge-variable palette. */}
        <Field
          label={form.actionType === 'create_task' ? t('form.taskTitle') : t('form.message')}
          hint={t('form.messageHint')}
        >
          <Textarea
            rows={4}
            value={form.body}
            onChange={(e) => patch('body', e.target.value)}
            placeholder={t('form.messagePlaceholder')}
          />
        </Field>

        <div {...stylex.props(styles.vars)}>
          <p {...stylex.props(styles.varHint)}>{t('form.mergeHint')}</p>
          {mergeGroups.map((group) => (
            <div key={group.group} {...stylex.props(styles.varGroup)}>
              <span {...stylex.props(styles.varGroupLabel)}>{t(`mergeGroups.${group.group}`)}</span>
              <div {...stylex.props(styles.varChips)}>
                {group.fields.map((field) => (
                  <button
                    key={field.token}
                    type="button"
                    title={field.token}
                    onClick={() => insertToken(field.token)}
                    {...stylex.props(styles.varChip)}
                  >
                    {t(`mergeVars.${field.key}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Active toggle. */}
        <div {...stylex.props(styles.toggleRow)}>
          <span {...stylex.props(styles.toggleLabel)}>
            <span {...stylex.props(styles.toggleTitle)}>{t('form.active')}</span>
            <span {...stylex.props(styles.toggleHint)}>{t('form.activeHint')}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={form.active}
            aria-label={t('form.active')}
            onClick={() => patch('active', !form.active)}
            {...stylex.props(styles.switch, form.active && styles.switchOn)}
          >
            <span {...stylex.props(styles.knob, form.active && styles.knobOn)} />
          </button>
        </div>
      </div>
    </Drawer>
  );
}
