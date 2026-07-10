'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { StaffMember, TimeOffRequestRow, TimeOffStatus } from '@fit/types';
import {
  Badge,
  Btn,
  FilterChips,
  Icon,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
  type Tone,
} from '@/components/ui';
import { createTimeOffAction, decideTimeOffAction, deleteTimeOffAction } from './depth-actions';
import { depthStyles as s, EmptyCard, formatDate } from './depth-shared';

/** Badge tone per time-off status. */
const STATUS_TONE: Record<TimeOffStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  denied: 'danger',
};

const styles = stylex.create({
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  requestRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.875rem 1rem',
  },
  reqMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    minWidth: 0,
  },
  reqName: {
    margin: 0,
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  reqDates: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  reqReason: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  reqSide: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.5rem',
    flexShrink: 0,
  },
  actions: {
    display: 'flex',
    gap: '0.375rem',
  },
  decidedMeta: {
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  formRow: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  fieldLabel: {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
  },
});

const STATUS_FILTERS: readonly TimeOffStatus[] = ['pending', 'approved', 'denied'];

/**
 * The Time-off tab (T12.15) — the gym-wide approval queue plus a "Request time off"
 * dialog. The queue loads from `GET /staff/time-off` (filterable by status);
 * managers approve / deny pending requests (`PATCH …/decision`) or withdraw one
 * (`DELETE`). Requesting time off posts to `POST /staff/:id/time-off`. All wired
 * through the depth server actions (gated on `StaffManage`).
 */
export function TimeOffPanel({
  staff,
  initialRequests,
}: {
  staff: StaffMember[];
  initialRequests: TimeOffRequestRow[];
}) {
  const t = useTranslations('admin.staff');
  const locale = useLocale();
  const { toast } = useToast();
  // The whole queue is server-rendered once; it is small and bounded, so it is
  // filtered by status client-side (keeping every chip's count accurate) and kept
  // in sync locally after each approve / deny / withdraw / new request.
  const [requests, setRequests] = useState<TimeOffRequestRow[]>(initialRequests);
  const [filter, setFilter] = useState<TimeOffStatus | ''>('');
  const [pending, startTransition] = useTransition();
  const [requestOpen, setRequestOpen] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<TimeOffStatus, number>();
    for (const request of requests) {
      map.set(request.status, (map.get(request.status) ?? 0) + 1);
    }
    return map;
  }, [requests]);

  const chips = useMemo(
    () => [
      { label: t('depth.timeoff.filters.all'), value: '', count: requests.length },
      ...STATUS_FILTERS.map((status) => ({
        label: t(`depth.timeoff.status.${status}` as 'depth.timeoff.status.pending'),
        value: status,
        count: counts.get(status) ?? 0,
      })),
    ],
    [t, requests.length, counts],
  );

  function decide(request: TimeOffRequestRow, decision: 'approve' | 'deny'): void {
    startTransition(async () => {
      const result = await decideTimeOffAction(request.id, { decision });
      if (result.ok) {
        setRequests((prev) => prev.map((row) => (row.id === request.id ? result.data : row)));
        toast(decision === 'approve' ? t('depth.timeoff.approved') : t('depth.timeoff.denied'), {
          tone: 'success',
          icon: 'check',
        });
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function withdraw(requestId: string): void {
    startTransition(async () => {
      const result = await deleteTimeOffAction(requestId);
      if (result.ok) {
        setRequests((prev) => prev.filter((row) => row.id !== requestId));
        toast(t('depth.timeoff.withdrawn'), { tone: 'success', icon: 'check' });
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const visible = filter ? requests.filter((request) => request.status === filter) : requests;

  return (
    <div {...stylex.props(s.stack)}>
      <div {...stylex.props(styles.toolbar)}>
        <FilterChips
          chips={chips}
          active={filter}
          onSelect={(value) => setFilter(value as TimeOffStatus | '')}
          ariaLabel={t('depth.timeoff.filterAria')}
        />
        <Btn
          v="primary"
          size="sm"
          icon="plus"
          onClick={() => setRequestOpen(true)}
          disabled={staff.length === 0}
        >
          {t('depth.timeoff.request')}
        </Btn>
      </div>

      {visible.length === 0 ? (
        <EmptyCard>{t('depth.timeoff.empty')}</EmptyCard>
      ) : (
        <Card variant="default" padding={0} xstyle={s.card}>
          <ul {...stylex.props(s.list)}>
            {visible.map((request) => (
              <li key={request.id} {...stylex.props(styles.requestRow)}>
                <div {...stylex.props(styles.reqMain)}>
                  <p {...stylex.props(styles.reqName)}>{request.staffName}</p>
                  <p {...stylex.props(styles.reqDates)}>
                    {formatDate(request.startDate, locale)} – {formatDate(request.endDate, locale)}
                  </p>
                  {request.reason ? (
                    <p {...stylex.props(styles.reqReason)}>{request.reason}</p>
                  ) : null}
                  {request.decidedBy && request.decidedAt ? (
                    <span {...stylex.props(styles.decidedMeta)}>
                      {t('depth.timeoff.decidedBy', {
                        name: request.decidedBy,
                        date: formatDate(request.decidedAt, locale),
                      })}
                    </span>
                  ) : null}
                </div>
                <div {...stylex.props(styles.reqSide)}>
                  <Badge tone={STATUS_TONE[request.status]}>
                    {t(`depth.timeoff.status.${request.status}` as 'depth.timeoff.status.pending')}
                  </Badge>
                  <div {...stylex.props(styles.actions)}>
                    {request.status === 'pending' ? (
                      <>
                        <Btn
                          v="outline"
                          size="sm"
                          icon="check"
                          onClick={() => decide(request, 'approve')}
                          disabled={pending}
                        >
                          {t('depth.timeoff.approve')}
                        </Btn>
                        <Btn
                          v="outline"
                          size="sm"
                          icon="x"
                          onClick={() => decide(request, 'deny')}
                          disabled={pending}
                        >
                          {t('depth.timeoff.deny')}
                        </Btn>
                      </>
                    ) : null}
                    <button
                      type="button"
                      aria-label={t('depth.timeoff.withdrawAria')}
                      onClick={() => withdraw(request.id)}
                      disabled={pending}
                      {...stylex.props(s.iconBtn)}
                    >
                      <Icon name="trash" {...stylex.props(s.smIcon)} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {requestOpen ? (
        <RequestTimeOffModal
          staff={staff}
          onClose={() => setRequestOpen(false)}
          onCreated={(created) => {
            setRequests((prev) => [created, ...prev]);
            setRequestOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** The "Request time off" dialog — pick a staff member, a date range, and a reason. */
function RequestTimeOffModal({
  staff,
  onClose,
  onCreated,
}: {
  staff: StaffMember[];
  onClose: () => void;
  onCreated: (request: TimeOffRequestRow) => void;
}) {
  const t = useTranslations('admin.staff');
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [staffId, setStaffId] = useState(staff[0]?.id ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const canSubmit = staffId && startDate && endDate && endDate >= startDate;

  function submit(): void {
    if (!canSubmit || pending) return;
    startTransition(async () => {
      const result = await createTimeOffAction(staffId, {
        startDate,
        endDate,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (result.ok) {
        toast(t('depth.timeoff.requested'), { tone: 'success', icon: 'check' });
        onCreated(result.data);
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <Modal
      open
      onClose={() => (pending ? undefined : onClose())}
      title={t('depth.timeoff.requestTitle')}
      description={t('depth.timeoff.requestBody')}
      size="sm"
      footer={
        <>
          <Btn v="outline" size="md" onClick={onClose} disabled={pending}>
            {t('depth.cancel')}
          </Btn>
          <Btn v="primary" size="md" onClick={submit} disabled={pending || !canSubmit}>
            {pending ? t('depth.saving') : t('depth.timeoff.submit')}
          </Btn>
        </>
      }
    >
      <div {...stylex.props(styles.form)}>
        <label>
          <span {...stylex.props(styles.fieldLabel)}>{t('depth.pickStaff')}</span>
          <Select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} · {member.email}
              </option>
            ))}
          </Select>
        </label>
        <div {...stylex.props(styles.formRow)}>
          <label>
            <span {...stylex.props(styles.fieldLabel)}>{t('depth.timeoff.startLabel')}</span>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            <span {...stylex.props(styles.fieldLabel)}>{t('depth.timeoff.endLabel')}</span>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        <label>
          <span {...stylex.props(styles.fieldLabel)}>{t('depth.timeoff.reasonLabel')}</span>
          <Textarea
            rows={3}
            placeholder={t('depth.timeoff.reasonPlaceholder')}
            value={reason}
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
