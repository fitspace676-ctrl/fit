'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { LeadRow, LeadSource, LeadStatus, UpdateLeadInput } from '@fit/types';
import { Btn, Drawer, Field, Icon, Input, Select, Textarea, useToast } from '@/components/ui';
import { createLeadAction, updateLeadAction } from './actions';
import { OPEN_LEAD_STATUSES, fromDateInputValue, isOpenLead, toDateInputValue } from './lead-meta';
import type { SelectOption } from './leads-view';

/** The source options, in capture-frequency order (walk-ins first). */
const SOURCE_OPTIONS: readonly LeadSource[] = ['WALK_IN', 'INSTAGRAM', 'REFERRAL', 'WEBSITE'];

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
});

/** The controlled form state — inputs as the browser hands them over. */
interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: LeadSource;
  interest: string;
  assignedToId: string;
  locationId: string;
  status: LeadStatus;
  followUpDate: string;
  expectedValue: string;
  probability: string;
  expectedCloseDate: string;
  notes: string;
}

/** Seed the form from an existing lead (edit) or capture defaults (create). */
function seedForm(lead?: LeadRow): FormState {
  return {
    firstName: lead?.firstName ?? '',
    lastName: lead?.lastName ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    source: lead?.source ?? 'WALK_IN',
    interest: lead?.interest ?? '',
    assignedToId: lead?.assignedTo?.id ?? '',
    locationId: lead?.location?.id ?? '',
    status: lead?.status ?? 'NEW',
    followUpDate: toDateInputValue(lead?.followUpDate ?? null),
    expectedValue: lead ? String(lead.expectedValue / 100) : '',
    probability: lead ? String(lead.probability) : '50',
    expectedCloseDate: toDateInputValue(lead?.expectedCloseDate ?? null),
    notes: lead?.notes ?? '',
  };
}

/** Whole minor units (tetri) from a major-unit text input; empty/invalid → 0. */
function toMinorUnits(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

/** A clamped whole percent from a text input; empty/invalid → fallback. */
function toPercent(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

type Props =
  | {
      mode: 'create';
      staffOptions: SelectOption[];
      locationOptions: SelectOption[];
      onClose: () => void;
    }
  | {
      mode: 'edit';
      lead: LeadRow;
      staffOptions: SelectOption[];
      locationOptions: SelectOption[];
      onClose: () => void;
    };

/**
 * The Add / Edit Lead dialog — every `Lead` field including qualification
 * (`expectedValue` in the gym currency, `probability`, follow-up / expected
 * close dates). Editing an open lead can also move it between the open stages
 * (NEW / CONTACTED / TRIAL); closing goes through the won/lost dialogs so the
 * reason is always captured. Money is entered in major units and stored in
 * minor units, matching the API contract.
 */
export function LeadFormDialog(props: Props) {
  const { mode, staffOptions, locationOptions, onClose } = props;
  const lead = mode === 'edit' ? props.lead : undefined;
  const t = useTranslations('admin.crm');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => seedForm(lead));
  // Exit animation: flip `closing` to play the drawer's slide-out, then drop the
  // dialog once it has finished (~0.26s) so it animates away instead of vanishing.
  const [closing, setClosing] = useState(false);

  function handleClose(): void {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 260);
  }

  const canSubmit = form.firstName.trim().length > 0 && form.lastName.trim().length > 0;
  // Stage moves are only meaningful while the lead is open; a closed lead's
  // profile stays editable but its stage is owned by the close transitions.
  const showStatus = mode === 'edit' && lead !== undefined && isOpenLead(lead.status);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(): void {
    if (!canSubmit || pending) return;
    setError(null);
    const base = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      source: form.source,
      interest: form.interest.trim(),
      assignedToId: form.assignedToId || null,
      locationId: form.locationId || null,
      followUpDate: fromDateInputValue(form.followUpDate),
      notes: form.notes.trim(),
      expectedValue: toMinorUnits(form.expectedValue),
      expectedCloseDate: fromDateInputValue(form.expectedCloseDate),
      probability: toPercent(form.probability, mode === 'create' ? 50 : (lead?.probability ?? 0)),
    };
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createLeadAction(base)
          : await updateLeadAction(props.lead.id, {
              ...base,
              ...(showStatus && (OPEN_LEAD_STATUSES as readonly string[]).includes(form.status)
                ? { status: form.status as UpdateLeadInput['status'] }
                : {}),
            });
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
      title={mode === 'create' ? t('form.addTitle') : t('form.editTitle')}
      className="max-w-xl"
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

        <div {...stylex.props(styles.grid2)}>
          <Field label={t('form.firstName')}>
            <Input
              value={form.firstName}
              onChange={(e) => patch('firstName', e.target.value)}
              placeholder={t('form.firstNamePlaceholder')}
              autoFocus
            />
          </Field>
          <Field label={t('form.lastName')}>
            <Input
              value={form.lastName}
              onChange={(e) => patch('lastName', e.target.value)}
              placeholder={t('form.lastNamePlaceholder')}
            />
          </Field>
        </div>

        <div {...stylex.props(styles.grid2)}>
          <Field label={t('form.phone')}>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => patch('phone', e.target.value)}
              placeholder="+995 5XX XX XX XX"
            />
          </Field>
          <Field label={t('form.email')}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => patch('email', e.target.value)}
              placeholder="email@example.com"
            />
          </Field>
        </div>

        <div {...stylex.props(styles.grid2)}>
          <Field label={t('form.source')}>
            <Select
              value={form.source}
              onChange={(e) => patch('source', e.target.value as LeadSource)}
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`source.${option}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('form.interest')} hint={t('form.interestHint')}>
            <Input
              value={form.interest}
              onChange={(e) => patch('interest', e.target.value)}
              placeholder={t('form.interestPlaceholder')}
            />
          </Field>
        </div>

        <div {...stylex.props(styles.grid2)}>
          <Field label={t('form.assignedTo')}>
            <Select
              value={form.assignedToId}
              onChange={(e) => patch('assignedToId', e.target.value)}
              disabled={staffOptions.length === 0}
            >
              <option value="">{t('form.unassigned')}</option>
              {staffOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('form.location')}>
            <Select
              value={form.locationId}
              onChange={(e) => patch('locationId', e.target.value)}
              disabled={locationOptions.length === 0}
            >
              <option value="">{t('form.noLocation')}</option>
              {locationOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {showStatus ? (
          <Field label={t('form.stage')} hint={t('form.stageHint')}>
            <Select
              value={form.status}
              onChange={(e) => patch('status', e.target.value as LeadStatus)}
            >
              {OPEN_LEAD_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {t(`status.${option}`)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div {...stylex.props(styles.grid2)}>
          <Field label={t('form.followUpDate')}>
            <Input
              type="date"
              value={form.followUpDate}
              onChange={(e) => patch('followUpDate', e.target.value)}
            />
          </Field>
          <Field label={t('form.expectedCloseDate')}>
            <Input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => patch('expectedCloseDate', e.target.value)}
            />
          </Field>
        </div>

        <div {...stylex.props(styles.grid2)}>
          <Field label={t('form.expectedValue')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.expectedValue}
              onChange={(e) => patch('expectedValue', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label={t('form.probability')}>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => patch('probability', e.target.value)}
              placeholder="50"
            />
          </Field>
        </div>

        <Field label={t('form.notes')}>
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => patch('notes', e.target.value)}
            placeholder={t('form.notesPlaceholder')}
          />
        </Field>
      </div>
    </Drawer>
  );
}
