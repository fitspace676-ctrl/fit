'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import {
  type AudienceCriteria,
  type AudienceSegmentRow,
  type CampaignScheduleType,
  type MarketingCatalogResponse,
  type MarketingChannel,
  type MemberStatus,
  type MessageTemplateRow,
} from '@fit/types';
import { Badge, Btn, Field, Icon, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import {
  previewCriteriaAction,
  previewSegmentAction,
  saveCampaignAction,
  saveCampaignAsTemplateAction,
  type CampaignDispatch,
} from './actions';
import {
  CHANNEL_BODY_LIMITS,
  CHANNEL_ICONS,
  CHANNEL_ORDER,
  CHANNEL_SUBJECT_LIMITS,
} from './marketing-meta';

/** The audience selection mode: whole roster, a saved segment, or ad-hoc filters. */
type AudienceType = 'all' | 'segment' | 'custom';

/** The member statuses the inline audience builder can filter on. */
const STATUS_OPTIONS: readonly MemberStatus[] = ['ACTIVE', 'INVITED', 'SUSPENDED'];

/** Seed the wizard from a campaign (edit), a template (use), or fresh (create). */
export interface CampaignWizardInitial {
  /** Set when editing an existing draft; drives PATCH instead of POST. */
  id?: string;
  name?: string;
  channel?: MarketingChannel;
  subject?: string | null;
  body?: string;
  audienceSegmentId?: string | null;
  inlineCriteria?: AudienceCriteria | null;
  scheduleType?: CampaignScheduleType;
  scheduledAt?: string | null;
}

/** The inline-criteria fields as the browser hands them over (strings). */
interface CriteriaState {
  status: MemberStatus[];
  notVisitedForDays: string;
  visitedWithinDays: string;
  minClassAttendance: string;
  minSpent: string;
  joinedAfter: string;
  joinedBefore: string;
}

interface WizardState {
  name: string;
  channel: MarketingChannel;
  audienceType: AudienceType;
  segmentId: string;
  criteria: CriteriaState;
  subject: string;
  body: string;
  scheduleType: CampaignScheduleType;
  scheduleDate: string;
  scheduleTime: string;
}

const styles = stylex.create({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    display: 'grid',
    height: '1.75rem',
    width: '1.75rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  stepDotActive: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-text-on-accent, #ffffff)',
  },
  stepLine: {
    height: '2px',
    flex: 1,
    marginInline: '0.375rem',
    backgroundColor: 'var(--color-border)',
  },
  stepLineDone: {
    backgroundColor: 'var(--color-accent)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  cardGrid: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  optionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    alignItems: 'flex-start',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.875rem',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--color-text-primary)',
  },
  optionCardActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  optionIcon: {
    width: '1.5rem',
    height: '1.5rem',
    color: 'var(--color-text-accent)',
  },
  optionTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  optionHint: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  audienceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    width: '100%',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.875rem',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--color-text-primary)',
  },
  audienceRowActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  audienceMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  audienceIcon: {
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-text-accent)',
  },
  segmentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    marginInlineStart: '1.75rem',
  },
  segmentBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    textAlign: 'left',
  },
  segmentBtnActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  criteriaBox: {
    display: 'grid',
    gap: '0.75rem',
    marginInlineStart: '1.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(2, minmax(0, 1fr))',
    },
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.875rem',
  },
  statusChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  statusChip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    color: 'var(--color-text-primary)',
  },
  statusChipActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  fullSpan: {
    gridColumn: '1 / -1',
  },
  previewRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.875rem',
    paddingBlock: '0.625rem',
  },
  previewLabel: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  counterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  counter: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  mergeWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  mergeHint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  mergeChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  mergeChip: {
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
  scheduleGrid: {
    display: 'grid',
    gap: '0.75rem',
    marginInlineStart: '1.75rem',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  summary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.875rem',
  },
  summaryTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  summaryGrid: {
    display: 'grid',
    gap: '0.25rem 0.75rem',
    gridTemplateColumns: 'auto 1fr',
    fontSize: '0.8125rem',
  },
  summaryKey: {
    color: 'var(--color-text-secondary)',
  },
  summaryVal: {
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  footerNav: {
    display: 'flex',
    gap: '0.5rem',
  },
});

const STEP_COUNT = 4;

/** Seed the wizard state from an optional initial payload (edit / use-template). */
function seedState(initial: CampaignWizardInitial | undefined): WizardState {
  const c = initial?.inlineCriteria ?? null;
  return {
    name: initial?.name ?? '',
    channel: initial?.channel ?? 'email',
    audienceType: initial?.audienceSegmentId ? 'segment' : c ? 'custom' : 'all',
    segmentId: initial?.audienceSegmentId ?? '',
    criteria: {
      status: c?.status ? [...c.status] : [],
      notVisitedForDays: c?.notVisitedForDays !== undefined ? String(c.notVisitedForDays) : '',
      visitedWithinDays: c?.visitedWithinDays !== undefined ? String(c.visitedWithinDays) : '',
      minClassAttendance: c?.minClassAttendance !== undefined ? String(c.minClassAttendance) : '',
      minSpent: c?.minSpent !== undefined ? String(Math.round(c.minSpent / 100)) : '',
      joinedAfter: c?.joinedAfter ? c.joinedAfter.slice(0, 10) : '',
      joinedBefore: c?.joinedBefore ? c.joinedBefore.slice(0, 10) : '',
    },
    subject: initial?.subject ?? '',
    body: initial?.body ?? '',
    scheduleType: initial?.scheduleType ?? 'now',
    scheduleDate: initial?.scheduledAt ? initial.scheduledAt.slice(0, 10) : '',
    scheduleTime: initial?.scheduledAt ? initial.scheduledAt.slice(11, 16) : '09:00',
  };
}

/** Build the API `AudienceCriteria` from the string-based inline form. */
function buildCriteria(c: CriteriaState): AudienceCriteria {
  const criteria: AudienceCriteria = {};
  if (c.status.length > 0) {
    criteria.status = c.status;
  }
  const num = (v: string): number | undefined => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const notVisited = num(c.notVisitedForDays);
  if (notVisited !== undefined) criteria.notVisitedForDays = notVisited;
  const visited = num(c.visitedWithinDays);
  if (visited !== undefined) criteria.visitedWithinDays = visited;
  const attendance = num(c.minClassAttendance);
  if (attendance !== undefined) criteria.minClassAttendance = attendance;
  const spent = num(c.minSpent);
  if (spent !== undefined) criteria.minSpent = spent * 100;
  if (c.joinedAfter) criteria.joinedAfter = new Date(`${c.joinedAfter}T00:00:00`).toISOString();
  if (c.joinedBefore) criteria.joinedBefore = new Date(`${c.joinedBefore}T23:59:59`).toISOString();
  return criteria;
}

/**
 * The Create/Edit Campaign wizard (T12.8) — a four-step Modal flow on Astryx +
 * Fit brand: (1) name + channel, (2) audience (whole roster / saved segment /
 * inline criteria with a live preview count), (3) subject + body with per-channel
 * limits and an insertable merge-field palette + insert-from-template, and
 * (4) schedule (send now / schedule for later) with a review summary. Wired to
 * the T12.7 API through the `MarketingManage` Server Actions: it persists a draft
 * then sends or schedules it.
 */
export function CampaignWizard({
  mode,
  initial,
  catalog,
  segments,
  templates,
  onClose,
}: {
  mode: 'create' | 'edit';
  initial?: CampaignWizardInitial;
  catalog: MarketingCatalogResponse;
  segments: AudienceSegmentRow[];
  templates: MessageTemplateRow[];
  onClose: () => void;
}) {
  const t = useTranslations('admin.marketing');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardState>(() => seedState(initial));
  const [error, setError] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const editId = mode === 'edit' ? initial?.id : undefined;
  const bodyLimit = CHANNEL_BODY_LIMITS[form.channel];
  const subjectLimit = CHANNEL_SUBJECT_LIMITS[form.channel];

  function patch<K extends keyof WizardState>(key: K, value: WizardState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function patchCriteria<K extends keyof CriteriaState>(key: K, value: CriteriaState[K]): void {
    setForm((prev) => ({ ...prev, criteria: { ...prev.criteria, [key]: value } }));
  }

  function toggleStatus(status: MemberStatus): void {
    setForm((prev) => {
      const has = prev.criteria.status.includes(status);
      return {
        ...prev,
        criteria: {
          ...prev.criteria,
          status: has
            ? prev.criteria.status.filter((s) => s !== status)
            : [...prev.criteria.status, status],
        },
      };
    });
  }

  /** Resolve the current audience selection to a live match count. */
  const runPreview = useCallback(async () => {
    setPreviewing(true);
    const result =
      form.audienceType === 'segment'
        ? form.segmentId
          ? await previewSegmentAction(form.segmentId)
          : null
        : await previewCriteriaAction(
            form.audienceType === 'custom' ? buildCriteria(form.criteria) : {},
          );
    setPreviewing(false);
    if (result?.ok) {
      setPreviewCount(result.data.count);
    } else {
      setPreviewCount(null);
    }
  }, [form.audienceType, form.segmentId, form.criteria]);

  // Refresh the count when the roster / segment selection changes on step 2.
  // (Inline-criteria edits use the explicit "Refresh" button to avoid a request
  // per keystroke.)
  useEffect(() => {
    if (step !== 2) return;
    if (form.audienceType === 'custom') return;
    void runPreview();
  }, [step, form.audienceType, form.segmentId, runPreview]);

  function insertToken(token: string): void {
    setForm((prev) => ({
      ...prev,
      body:
        prev.body.length > 0 && !prev.body.endsWith(' ')
          ? `${prev.body} ${token}`
          : prev.body + token,
    }));
  }

  function useTemplate(id: string): void {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setForm((prev) => ({
      ...prev,
      channel: tpl.channel,
      subject: tpl.subject ?? '',
      body: tpl.body,
    }));
  }

  const stepValid = useMemo(() => {
    switch (step) {
      case 1:
        return form.name.trim().length > 0;
      case 2:
        return form.audienceType !== 'segment' || form.segmentId.length > 0;
      case 3:
        return form.body.trim().length > 0;
      case 4:
        return (
          form.scheduleType === 'now' ||
          (form.scheduleDate.length > 0 && form.scheduleTime.length > 0)
        );
      default:
        return true;
    }
  }, [step, form]);

  /** Assemble the create/update payload from the wizard state. */
  function buildPayload() {
    const subject = form.subject.trim();
    return {
      name: form.name.trim(),
      channel: form.channel,
      audienceSegmentId: form.audienceType === 'segment' ? form.segmentId : null,
      inlineCriteria: form.audienceType === 'custom' ? buildCriteria(form.criteria) : null,
      subject: subject.length > 0 ? subject : null,
      body: form.body.trim(),
      scheduleType: form.scheduleType,
      scheduledAt:
        form.scheduleType === 'scheduled' && form.scheduleDate && form.scheduleTime
          ? new Date(`${form.scheduleDate}T${form.scheduleTime}:00`).toISOString()
          : null,
    };
  }

  function finish(): void {
    if (pending || !stepValid) return;
    setError(null);
    const payload = buildPayload();
    const dispatch: CampaignDispatch =
      form.scheduleType === 'scheduled' && payload.scheduledAt
        ? { mode: 'scheduled', scheduledAt: payload.scheduledAt }
        : { mode: 'now' };
    startTransition(async () => {
      const result = await saveCampaignAction(editId ?? null, payload, dispatch);
      if (result.ok) {
        toast(result.data.dispatched === 'scheduled' ? t('wizard.scheduled') : t('wizard.sent'), {
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

  function saveAsTemplate(): void {
    if (!editId) {
      // Unsaved draft — persist it first, then save the template from it.
      startTransition(async () => {
        const created = await saveCampaignAction(null, buildPayload(), { mode: 'draft' });
        if (!created.ok) {
          setError(created.error);
          return;
        }
        const tpl = await saveCampaignAsTemplateAction(created.data.id, form.name.trim());
        if (tpl.ok) {
          toast(t('templates.saved'), { tone: 'success', icon: 'check' });
          router.refresh();
        } else {
          setError(tpl.error);
        }
      });
      return;
    }
    startTransition(async () => {
      const tpl = await saveCampaignAsTemplateAction(editId, form.name.trim());
      if (tpl.ok) {
        toast(t('templates.saved'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        setError(tpl.error);
      }
    });
  }

  const stepDescription = t(`wizard.stepDescription.${step}`);
  const canSaveTemplate = step === 4 && form.body.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('wizard.title', { step, total: STEP_COUNT })}
      description={stepDescription}
      size="lg"
      footer={
        <>
          <Btn
            v="outline"
            size="md"
            icon="chevronLeft"
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            disabled={pending}
          >
            {step === 1 ? t('wizard.cancel') : t('wizard.back')}
          </Btn>
          <div {...stylex.props(styles.footerNav)}>
            {canSaveTemplate ? (
              <Btn v="outline" size="md" icon="star" onClick={saveAsTemplate} disabled={pending}>
                {t('wizard.saveAsTemplate')}
              </Btn>
            ) : null}
            {step < STEP_COUNT ? (
              <Btn
                v="primary"
                size="md"
                iconRight="chevronRight"
                onClick={() => setStep(step + 1)}
                disabled={!stepValid}
              >
                {t('wizard.next')}
              </Btn>
            ) : (
              <Btn
                v="primary"
                size="md"
                icon={form.scheduleType === 'now' ? 'spark' : 'clock'}
                onClick={finish}
                disabled={pending || !stepValid}
              >
                {pending
                  ? t('wizard.saving')
                  : form.scheduleType === 'now'
                    ? t('wizard.sendNow')
                    : t('wizard.schedule')}
              </Btn>
            )}
          </div>
        </>
      }
    >
      <div {...stylex.props(styles.wrap)}>
        {/* Step indicator. */}
        <div {...stylex.props(styles.steps)}>
          {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((n) => (
            <div key={n} {...stylex.props(styles.stepItem)}>
              <span {...stylex.props(styles.stepDot, step >= n && styles.stepDotActive)}>{n}</span>
              {n < STEP_COUNT ? (
                <span {...stylex.props(styles.stepLine, step > n && styles.stepLineDone)} />
              ) : null}
            </div>
          ))}
        </div>

        {error ? (
          <div {...stylex.props(styles.errorCard)}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        {/* Step 1 — Type. */}
        {step === 1 ? (
          <div {...stylex.props(styles.section)}>
            <Field label={t('wizard.nameLabel')}>
              <Input
                value={form.name}
                onChange={(e) => patch('name', e.target.value)}
                placeholder={t('wizard.namePlaceholder')}
                autoFocus
              />
            </Field>
            <Field label={t('wizard.channelLabel')}>
              <div {...stylex.props(styles.cardGrid)}>
                {CHANNEL_ORDER.map((channel) => {
                  const active = form.channel === channel;
                  return (
                    <button
                      key={channel}
                      type="button"
                      aria-pressed={active}
                      onClick={() => patch('channel', channel)}
                      {...stylex.props(styles.optionCard, active && styles.optionCardActive)}
                    >
                      <Icon name={CHANNEL_ICONS[channel]} {...stylex.props(styles.optionIcon)} />
                      <span {...stylex.props(styles.optionTitle)}>{t(`channels.${channel}`)}</span>
                      <span {...stylex.props(styles.optionHint)}>
                        {t(`channelHint.${channel}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        ) : null}

        {/* Step 2 — Audience. */}
        {step === 2 ? (
          <div {...stylex.props(styles.section)}>
            <button
              type="button"
              onClick={() => patch('audienceType', 'all')}
              {...stylex.props(
                styles.audienceRow,
                form.audienceType === 'all' && styles.audienceRowActive,
              )}
            >
              <span {...stylex.props(styles.audienceMain)}>
                <Icon name="users" {...stylex.props(styles.audienceIcon)} />
                <span>
                  <span {...stylex.props(styles.optionTitle)}>{t('audience.allTitle')}</span>
                  <br />
                  <span {...stylex.props(styles.optionHint)}>{t('audience.allHint')}</span>
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => patch('audienceType', 'segment')}
              {...stylex.props(
                styles.audienceRow,
                form.audienceType === 'segment' && styles.audienceRowActive,
              )}
            >
              <span {...stylex.props(styles.audienceMain)}>
                <Icon name="target" {...stylex.props(styles.audienceIcon)} />
                <span>
                  <span {...stylex.props(styles.optionTitle)}>{t('audience.segmentTitle')}</span>
                  <br />
                  <span {...stylex.props(styles.optionHint)}>{t('audience.segmentHint')}</span>
                </span>
              </span>
            </button>

            {form.audienceType === 'segment' ? (
              <div {...stylex.props(styles.segmentList)}>
                {segments.length === 0 ? (
                  <span {...stylex.props(styles.optionHint)}>{t('audience.noSegments')}</span>
                ) : (
                  segments.map((segment) => (
                    <button
                      key={segment.id}
                      type="button"
                      onClick={() => patch('segmentId', segment.id)}
                      {...stylex.props(
                        styles.segmentBtn,
                        form.segmentId === segment.id && styles.segmentBtnActive,
                      )}
                    >
                      <span>{segment.name}</span>
                      <Icon name="chevronRight" {...stylex.props(styles.audienceIcon)} />
                    </button>
                  ))
                )}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => patch('audienceType', 'custom')}
              {...stylex.props(
                styles.audienceRow,
                form.audienceType === 'custom' && styles.audienceRowActive,
              )}
            >
              <span {...stylex.props(styles.audienceMain)}>
                <Icon name="filter" {...stylex.props(styles.audienceIcon)} />
                <span>
                  <span {...stylex.props(styles.optionTitle)}>{t('audience.customTitle')}</span>
                  <br />
                  <span {...stylex.props(styles.optionHint)}>{t('audience.customHint')}</span>
                </span>
              </span>
            </button>

            {form.audienceType === 'custom' ? (
              <div {...stylex.props(styles.criteriaBox)}>
                <div {...stylex.props(styles.fullSpan)}>
                  <Field label={t('audience.statusLabel')}>
                    <div {...stylex.props(styles.statusChips)}>
                      {STATUS_OPTIONS.map((status) => {
                        const active = form.criteria.status.includes(status);
                        return (
                          <button
                            key={status}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleStatus(status)}
                            {...stylex.props(styles.statusChip, active && styles.statusChipActive)}
                          >
                            {t(`memberStatus.${status}`)}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </div>
                <Field label={t('audience.notVisitedLabel')}>
                  <Input
                    type="number"
                    min={1}
                    value={form.criteria.notVisitedForDays}
                    onChange={(e) => patchCriteria('notVisitedForDays', e.target.value)}
                    placeholder={t('audience.daysPlaceholder')}
                  />
                </Field>
                <Field label={t('audience.visitedWithinLabel')}>
                  <Input
                    type="number"
                    min={1}
                    value={form.criteria.visitedWithinDays}
                    onChange={(e) => patchCriteria('visitedWithinDays', e.target.value)}
                    placeholder={t('audience.daysPlaceholder')}
                  />
                </Field>
                <Field label={t('audience.minClassLabel')}>
                  <Input
                    type="number"
                    min={0}
                    value={form.criteria.minClassAttendance}
                    onChange={(e) => patchCriteria('minClassAttendance', e.target.value)}
                    placeholder={t('audience.countPlaceholder')}
                  />
                </Field>
                <Field label={t('audience.minSpentLabel')}>
                  <Input
                    type="number"
                    min={0}
                    value={form.criteria.minSpent}
                    onChange={(e) => patchCriteria('minSpent', e.target.value)}
                    placeholder={t('audience.amountPlaceholder')}
                  />
                </Field>
                <Field label={t('audience.joinedAfterLabel')}>
                  <Input
                    type="date"
                    value={form.criteria.joinedAfter}
                    onChange={(e) => patchCriteria('joinedAfter', e.target.value)}
                  />
                </Field>
                <Field label={t('audience.joinedBeforeLabel')}>
                  <Input
                    type="date"
                    value={form.criteria.joinedBefore}
                    onChange={(e) => patchCriteria('joinedBefore', e.target.value)}
                  />
                </Field>
              </div>
            ) : null}

            <div {...stylex.props(styles.previewRow)}>
              <span {...stylex.props(styles.previewLabel)}>{t('audience.estimated')}</span>
              <span {...stylex.props(styles.audienceMain)}>
                <Badge tone="accent">
                  {previewing
                    ? t('audience.counting')
                    : previewCount !== null
                      ? t('audience.memberCount', { count: previewCount })
                      : '—'}
                </Badge>
                <Btn
                  v="ghost"
                  size="sm"
                  icon="filter"
                  onClick={() => void runPreview()}
                  disabled={previewing}
                >
                  {t('audience.refresh')}
                </Btn>
              </span>
            </div>
          </div>
        ) : null}

        {/* Step 3 — Content. */}
        {step === 3 ? (
          <div {...stylex.props(styles.section)}>
            {templates.length > 0 ? (
              <Field label={t('content.fromTemplate')}>
                <Select value="" onChange={(e) => e.target.value && useTemplate(e.target.value)}>
                  <option value="">{t('content.fromTemplatePlaceholder')}</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label={t('content.subjectLabel')}>
              <Input
                value={form.subject}
                maxLength={subjectLimit}
                onChange={(e) => patch('subject', e.target.value)}
                placeholder={t('content.subjectPlaceholder')}
              />
            </Field>

            <div>
              <div {...stylex.props(styles.counterRow)}>
                <span {...stylex.props(styles.previewLabel)}>{t('content.bodyLabel')}</span>
                {bodyLimit !== null ? (
                  <span {...stylex.props(styles.counter)}>
                    {form.body.length}/{bodyLimit}
                  </span>
                ) : null}
              </div>
              <Textarea
                rows={6}
                value={form.body}
                maxLength={bodyLimit ?? undefined}
                onChange={(e) => patch('body', e.target.value)}
                placeholder={t('content.bodyPlaceholder')}
              />
            </div>

            <div {...stylex.props(styles.mergeWrap)}>
              <p {...stylex.props(styles.mergeHint)}>{t('content.mergeHint')}</p>
              <div {...stylex.props(styles.mergeChips)}>
                {catalog.mergeFields.map((field) => (
                  <button
                    key={field.token}
                    type="button"
                    title={field.token}
                    onClick={() => insertToken(field.token)}
                    {...stylex.props(styles.mergeChip)}
                  >
                    + {field.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 4 — Schedule + review. */}
        {step === 4 ? (
          <div {...stylex.props(styles.section)}>
            <button
              type="button"
              onClick={() => patch('scheduleType', 'now')}
              {...stylex.props(
                styles.audienceRow,
                form.scheduleType === 'now' && styles.audienceRowActive,
              )}
            >
              <span {...stylex.props(styles.audienceMain)}>
                <Icon name="spark" {...stylex.props(styles.audienceIcon)} />
                <span>
                  <span {...stylex.props(styles.optionTitle)}>{t('schedule.nowTitle')}</span>
                  <br />
                  <span {...stylex.props(styles.optionHint)}>{t('schedule.nowHint')}</span>
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => patch('scheduleType', 'scheduled')}
              {...stylex.props(
                styles.audienceRow,
                form.scheduleType === 'scheduled' && styles.audienceRowActive,
              )}
            >
              <span {...stylex.props(styles.audienceMain)}>
                <Icon name="clock" {...stylex.props(styles.audienceIcon)} />
                <span>
                  <span {...stylex.props(styles.optionTitle)}>{t('schedule.laterTitle')}</span>
                  <br />
                  <span {...stylex.props(styles.optionHint)}>{t('schedule.laterHint')}</span>
                </span>
              </span>
            </button>

            {form.scheduleType === 'scheduled' ? (
              <div {...stylex.props(styles.scheduleGrid)}>
                <Field label={t('schedule.dateLabel')}>
                  <Input
                    type="date"
                    value={form.scheduleDate}
                    onChange={(e) => patch('scheduleDate', e.target.value)}
                  />
                </Field>
                <Field label={t('schedule.timeLabel')}>
                  <Input
                    type="time"
                    value={form.scheduleTime}
                    onChange={(e) => patch('scheduleTime', e.target.value)}
                  />
                </Field>
              </div>
            ) : null}

            <div {...stylex.props(styles.summary)}>
              <p {...stylex.props(styles.summaryTitle)}>{t('schedule.summaryTitle')}</p>
              <div {...stylex.props(styles.summaryGrid)}>
                <span {...stylex.props(styles.summaryKey)}>{t('schedule.summaryName')}</span>
                <span {...stylex.props(styles.summaryVal)}>{form.name}</span>
                <span {...stylex.props(styles.summaryKey)}>{t('schedule.summaryChannel')}</span>
                <span {...stylex.props(styles.summaryVal)}>{t(`channels.${form.channel}`)}</span>
                <span {...stylex.props(styles.summaryKey)}>{t('schedule.summaryAudience')}</span>
                <span {...stylex.props(styles.summaryVal)}>
                  {previewCount !== null
                    ? t('audience.memberCount', { count: previewCount })
                    : t(`audience.${form.audienceType}Title`)}
                </span>
                <span {...stylex.props(styles.summaryKey)}>{t('schedule.summarySubject')}</span>
                <span {...stylex.props(styles.summaryVal)}>{form.subject || '—'}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
