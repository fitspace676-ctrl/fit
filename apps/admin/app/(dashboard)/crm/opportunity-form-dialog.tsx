'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  OpportunityRow,
  OpportunityStatus,
  OpportunityType,
  UpdateOpportunityInput,
} from '@fit/types';
import { Btn, Field, Icon, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { createOpportunityAction, updateOpportunityAction } from './actions';
import { fromDateInputValue, toDateInputValue } from './lead-meta';
import { OPEN_OPPORTUNITY_STATUSES, isOpenOpportunity, memberInitials } from './opportunity-meta';
import type { SelectOption } from './leads-view';

/** The type options, in sales-frequency order. */
const TYPE_OPTIONS: readonly OpportunityType[] = [
  'MEMBERSHIP_UPGRADE',
  'PT_SESSIONS',
  'SERVICE_PACKAGE',
  'OTHER',
];

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
  // Member picker.
  memberChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  memberAvatar: {
    display: 'grid',
    height: '1.75rem',
    width: '1.75rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.6875rem',
    fontWeight: 700,
    color: 'var(--color-text-accent)',
  },
  memberName: {
    flexGrow: 1,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    marginTop: '0.375rem',
    maxHeight: '11rem',
    overflowY: 'auto',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    borderWidth: 0,
    background: 'none',
    cursor: 'pointer',
    textAlign: 'start',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  resultRowHover: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  resultEmpty: {
    margin: 0,
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
});

/** The controlled form state — inputs as the browser hands them over. */
interface FormState {
  memberId: string;
  memberName: string;
  type: OpportunityType;
  description: string;
  value: string;
  probability: string;
  assignedToId: string;
  status: OpportunityStatus;
  expectedCloseDate: string;
  notes: string;
}

/** Seed the form from an existing opportunity (edit) or new-deal defaults (create). */
function seedForm(opportunity?: OpportunityRow): FormState {
  return {
    memberId: opportunity?.member.id ?? '',
    memberName: opportunity?.member.name ?? '',
    type: opportunity?.type ?? 'MEMBERSHIP_UPGRADE',
    description: opportunity?.description ?? '',
    value: opportunity ? String(opportunity.value / 100) : '',
    probability: opportunity ? String(opportunity.probability) : '50',
    assignedToId: opportunity?.assignedTo?.id ?? '',
    status: opportunity?.status ?? 'INTERESTED',
    expectedCloseDate: toDateInputValue(opportunity?.expectedCloseDate ?? null),
    notes: opportunity?.notes ?? '',
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
      memberOptions: SelectOption[];
      staffOptions: SelectOption[];
      onClose: () => void;
    }
  | {
      mode: 'edit';
      opportunity: OpportunityRow;
      staffOptions: SelectOption[];
      onClose: () => void;
    };

/**
 * The Add / Edit Opportunity dialog. On create, the member is chosen from a
 * searchable picker (an opportunity is always opened on an existing member); on
 * edit the member is fixed and the open stage can be moved (INTERESTED /
 * PROPOSAL_SENT / DECISION_PENDING), while closing goes through the won/lost
 * dialogs so the reason is captured. Money is entered in major units and stored
 * in minor units, matching the API contract.
 */
export function OpportunityFormDialog(props: Props) {
  const { mode, staffOptions, onClose } = props;
  const opportunity = mode === 'edit' ? props.opportunity : undefined;
  const memberOptions = mode === 'create' ? props.memberOptions : [];
  const t = useTranslations('admin.crm');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => seedForm(opportunity));
  const [memberSearch, setMemberSearch] = useState('');

  const canSubmit =
    form.description.trim().length > 0 && (mode === 'edit' || form.memberId.length > 0);
  // Stage moves are only meaningful while the opportunity is open.
  const showStatus =
    mode === 'edit' && opportunity !== undefined && isOpenOpportunity(opportunity.status);

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    const pool = query
      ? memberOptions.filter((m) => m.name.toLowerCase().includes(query))
      : memberOptions;
    return pool.slice(0, 8);
  }, [memberOptions, memberSearch]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(): void {
    if (!canSubmit || pending) return;
    setError(null);
    const base = {
      type: form.type,
      description: form.description.trim(),
      value: toMinorUnits(form.value),
      probability: toPercent(
        form.probability,
        mode === 'create' ? 50 : (opportunity?.probability ?? 0),
      ),
      assignedToId: form.assignedToId || null,
      expectedCloseDate: fromDateInputValue(form.expectedCloseDate),
      notes: form.notes.trim(),
    };
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createOpportunityAction({ ...base, memberId: form.memberId })
          : await updateOpportunityAction(props.opportunity.id, {
              ...base,
              ...(showStatus &&
              (OPEN_OPPORTUNITY_STATUSES as readonly string[]).includes(form.status)
                ? { status: form.status as UpdateOpportunityInput['status'] }
                : {}),
            });
      if (result.ok) {
        toast(mode === 'create' ? t('opportunityForm.created') : t('opportunityForm.updated'), {
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
      title={mode === 'create' ? t('opportunityForm.addTitle') : t('opportunityForm.editTitle')}
      description={
        mode === 'create'
          ? t('opportunityForm.addDescription')
          : t('opportunityForm.editDescription')
      }
      size="lg"
      footer={
        <>
          <Btn v="outline" size="md" onClick={onClose} disabled={pending}>
            {t('form.cancel')}
          </Btn>
          <Btn v="primary" size="md" onClick={submit} disabled={pending || !canSubmit}>
            {pending
              ? t('form.saving')
              : mode === 'create'
                ? t('opportunityForm.addSubmit')
                : t('opportunityForm.editSubmit')}
          </Btn>
        </>
      }
    >
      <div {...stylex.props(styles.form)}>
        {error ? (
          <div {...stylex.props(styles.errorCard)}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        {mode === 'create' ? (
          <Field label={t('opportunityForm.member')} hint={t('opportunityForm.memberHint')}>
            {form.memberId ? (
              <div {...stylex.props(styles.memberChip)}>
                <span {...stylex.props(styles.memberAvatar)}>
                  {memberInitials(form.memberName)}
                </span>
                <span {...stylex.props(styles.memberName)}>{form.memberName}</span>
                <Btn
                  v="ghost"
                  size="sm"
                  onClick={() => {
                    patch('memberId', '');
                    patch('memberName', '');
                    setMemberSearch('');
                  }}
                >
                  {t('opportunityForm.changeMember')}
                </Btn>
              </div>
            ) : (
              <>
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={t('opportunityForm.memberSearchPlaceholder')}
                  aria-label={t('opportunityForm.member')}
                  autoFocus
                />
                <div {...stylex.props(styles.results)}>
                  {filteredMembers.length === 0 ? (
                    <p {...stylex.props(styles.resultEmpty)}>
                      {memberOptions.length === 0
                        ? t('opportunityForm.noMembers')
                        : t('opportunityForm.noMemberMatch')}
                    </p>
                  ) : (
                    filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          patch('memberId', member.id);
                          patch('memberName', member.name);
                        }}
                        {...stylex.props(styles.resultRow, styles.resultRowHover)}
                      >
                        <span {...stylex.props(styles.memberAvatar)}>
                          {memberInitials(member.name)}
                        </span>
                        {member.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </Field>
        ) : null}

        <div {...stylex.props(styles.grid2)}>
          <Field label={t('opportunityForm.type')}>
            <Select
              value={form.type}
              onChange={(e) => patch('type', e.target.value as OpportunityType)}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`opportunityType.${option}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('opportunityForm.assignedTo')}>
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
        </div>

        <Field label={t('opportunityForm.description')} hint={t('opportunityForm.descriptionHint')}>
          <Input
            value={form.description}
            onChange={(e) => patch('description', e.target.value)}
            placeholder={t('opportunityForm.descriptionPlaceholder')}
          />
        </Field>

        {showStatus ? (
          <Field label={t('opportunityForm.stage')} hint={t('opportunityForm.stageHint')}>
            <Select
              value={form.status}
              onChange={(e) => patch('status', e.target.value as OpportunityStatus)}
            >
              {OPEN_OPPORTUNITY_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {t(`opportunityStatus.${option}`)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div {...stylex.props(styles.grid2)}>
          <Field label={t('opportunityForm.value')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.value}
              onChange={(e) => patch('value', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label={t('opportunityForm.probability')}>
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

        <Field label={t('opportunityForm.expectedCloseDate')}>
          <Input
            type="date"
            value={form.expectedCloseDate}
            onChange={(e) => patch('expectedCloseDate', e.target.value)}
          />
        </Field>

        <Field label={t('form.notes')}>
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => patch('notes', e.target.value)}
            placeholder={t('form.notesPlaceholder')}
          />
        </Field>
      </div>
    </Modal>
  );
}
