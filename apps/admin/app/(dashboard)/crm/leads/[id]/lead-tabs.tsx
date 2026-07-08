'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { CrmActivityEntry, CrmActivityType, CrmTaskEntry, LeadDetail } from '@fit/types';
import { Badge, Btn, Icon, Input, Select, Textarea, useToast } from '@/components/ui';
import { createLeadTaskAction, logLeadActivityAction, toggleLeadTaskAction } from '../../actions';
import {
  ACTIVITY_COLORS,
  ACTIVITY_ICONS,
  formatDate,
  formatDateTime,
  fromDateInputValue,
} from '../../lead-meta';

/** Translator for the `admin.crm` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/** The detail page's tab keys — labels come from `leadTabs.<key>`. */
const TABS = ['overview', 'activity', 'notes', 'tasks'] as const;
type Tab = (typeof TABS)[number];

/** The touchpoint types staff can log by hand (`TASK_COMPLETED` is automatic). */
const LOGGABLE_TYPES = ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE'] as const;

const styles = stylex.create({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  tablist: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  tab: {
    flexShrink: 0,
    marginBottom: '-1px',
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    background: 'none',
    cursor: 'pointer',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)',
  },
  tabActive: {
    borderBottomColor: 'var(--color-accent)',
    color: 'var(--color-text-accent)',
  },
  panelStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  sectionHint: {
    margin: 0,
    marginTop: '-0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  mutedText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  bodyText: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    color: 'var(--color-text-primary)',
  },
  reasonCardWon: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-success)',
    backgroundColor: 'var(--color-success-muted)',
    padding: '1rem',
  },
  reasonCardLost: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    padding: '1rem',
  },
  reasonTitleWon: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--color-success)',
  },
  reasonTitleLost: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--color-error)',
  },
  reasonBody: {
    margin: 0,
    marginTop: '0.375rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  contactGrid: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  contactTile: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  contactIcon: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  contactIconSvg: {
    width: '1rem',
    height: '1rem',
  },
  contactCol: {
    minWidth: 0,
  },
  contactLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--color-text-secondary)',
  },
  contactValue: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  addForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  addFormRow: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  addFormActions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  timeline: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  timelineItem: {
    position: 'relative',
    display: 'flex',
    gap: '0.875rem',
    paddingBottom: '1.25rem',
  },
  timelineRail: {
    position: 'absolute',
    left: '1.125rem',
    top: '2.5rem',
    bottom: '0.25rem',
    width: '1px',
    backgroundColor: 'var(--color-border)',
  },
  timelineIcon: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  timelineIconSvg: {
    width: '1rem',
    height: '1rem',
  },
  timelineBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  timelineHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  timelineType: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  timelineNotes: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    color: 'var(--color-text-primary)',
  },
  timelineMeta: {
    margin: 0,
    fontSize: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-secondary)',
  },
  taskRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  taskRowDone: {
    opacity: 0.7,
  },
  taskCheck: {
    display: 'grid',
    height: '1.375rem',
    width: '1.375rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    cursor: 'pointer',
    color: 'transparent',
    padding: 0,
  },
  taskCheckDone: {
    borderColor: 'var(--color-success)',
    backgroundColor: 'var(--color-success)',
    color: '#fff',
  },
  taskCheckIcon: {
    width: '0.75rem',
    height: '0.75rem',
  },
  taskMain: {
    minWidth: 0,
    flexGrow: 1,
  },
  taskTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  taskTitleDone: {
    textDecoration: 'line-through',
    color: 'var(--color-text-secondary)',
  },
  taskSub: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  noteTile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  noteHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  noteAuthor: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  noteMeta: {
    fontSize: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-secondary)',
  },
  noteBody: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    color: 'var(--color-text-primary)',
  },
});

/**
 * The lead detail's tabbed experience (T12.3): Overview (contact + notes +
 * close reason), Activity (the timeline + Log Activity), Notes (add + history —
 * notes are `NOTE`-type activities, so they appear on the timeline too) and
 * Tasks (create + pending / completed with a done toggle that auto-logs a
 * `TASK_COMPLETED` activity API-side). Data is fetched server-side and passed
 * in; forms are `CrmManage`-gated and re-checked by the actions.
 */
export function LeadTabs({ lead, canManage }: { lead: LeadDetail; canManage: boolean }) {
  const t = useTranslations('admin.crm');
  const locale = useLocale();
  const [active, setActive] = useState<Tab>('overview');

  const pendingCount = lead.tasks.filter((task) => !task.completed).length;

  return (
    <div {...stylex.props(styles.wrap)}>
      <div role="tablist" aria-label={t('detail.tablistLabel')} {...stylex.props(styles.tablist)}>
        {TABS.map((tab) => {
          const isActive = tab === active;
          const label =
            tab === 'tasks' && pendingCount > 0
              ? `${t(`leadTabs.${tab}`)} (${pendingCount})`
              : t(`leadTabs.${tab}`);
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              {...stylex.props(styles.tab, isActive && styles.tabActive)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {active === 'overview' && <OverviewPanel lead={lead} t={t} />}
        {active === 'activity' && (
          <ActivityPanel lead={lead} canManage={canManage} t={t} locale={locale} />
        )}
        {active === 'notes' && (
          <NotesPanel lead={lead} canManage={canManage} t={t} locale={locale} />
        )}
        {active === 'tasks' && (
          <TasksPanel lead={lead} canManage={canManage} t={t} locale={locale} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

/** Overview — the close reason (once closed), contact tiles, and the lead's notes. */
function OverviewPanel({ lead, t }: { lead: LeadDetail; t: T }) {
  return (
    <div {...stylex.props(styles.panelStack)}>
      {lead.status === 'CONVERTED' && lead.wonReason ? (
        <Card variant="default" padding={0} xstyle={styles.reasonCardWon}>
          <p {...stylex.props(styles.reasonTitleWon)}>{t('detail.wonReason')}</p>
          <p {...stylex.props(styles.reasonBody)}>{lead.wonReason}</p>
        </Card>
      ) : null}
      {lead.status === 'LOST' && lead.lostReason ? (
        <Card variant="default" padding={0} xstyle={styles.reasonCardLost}>
          <p {...stylex.props(styles.reasonTitleLost)}>{t('detail.lostReason')}</p>
          <p {...stylex.props(styles.reasonBody)}>{lead.lostReason}</p>
        </Card>
      ) : null}

      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.contactInformation')}</h3>
        <div {...stylex.props(styles.contactGrid)}>
          <div {...stylex.props(styles.contactTile)}>
            <span {...stylex.props(styles.contactIcon)}>
              <Icon name="phone" {...stylex.props(styles.contactIconSvg)} />
            </span>
            <div {...stylex.props(styles.contactCol)}>
              <p {...stylex.props(styles.contactLabel)}>{t('form.phone')}</p>
              <p {...stylex.props(styles.contactValue)}>{lead.phone || '—'}</p>
            </div>
          </div>
          <div {...stylex.props(styles.contactTile)}>
            <span {...stylex.props(styles.contactIcon)}>
              <Icon name="mail" {...stylex.props(styles.contactIconSvg)} />
            </span>
            <div {...stylex.props(styles.contactCol)}>
              <p {...stylex.props(styles.contactLabel)}>{t('form.email')}</p>
              <p {...stylex.props(styles.contactValue)}>{lead.email || '—'}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('form.notes')}</h3>
        {lead.notes ? (
          <p {...stylex.props(styles.bodyText)}>{lead.notes}</p>
        ) : (
          <p {...stylex.props(styles.mutedText)}>{t('detail.noLeadNotes')}</p>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity                                                           */
/* ------------------------------------------------------------------ */

/** One timeline entry — type icon, notes, and the staff + when line. */
function TimelineEntry({
  activity,
  isLast,
  t,
  locale,
}: {
  activity: CrmActivityEntry;
  isLast: boolean;
  t: T;
  locale: string;
}) {
  return (
    <li {...stylex.props(styles.timelineItem)}>
      {!isLast ? <span aria-hidden {...stylex.props(styles.timelineRail)} /> : null}
      <span
        {...stylex.props(styles.timelineIcon)}
        style={{ color: ACTIVITY_COLORS[activity.type] }}
      >
        <Icon name={ACTIVITY_ICONS[activity.type]} {...stylex.props(styles.timelineIconSvg)} />
      </span>
      <div {...stylex.props(styles.timelineBody)}>
        <div {...stylex.props(styles.timelineHead)}>
          <p {...stylex.props(styles.timelineType)}>{t(`activityType.${activity.type}`)}</p>
        </div>
        {activity.notes ? <p {...stylex.props(styles.timelineNotes)}>{activity.notes}</p> : null}
        <p {...stylex.props(styles.timelineMeta)}>
          {activity.staffName} · {formatDateTime(activity.occurredAt, locale)}
        </p>
      </div>
    </li>
  );
}

/** Activity — the Log Activity form + the touchpoint timeline, newest first. */
function ActivityPanel({
  lead,
  canManage,
  t,
  locale,
}: {
  lead: LeadDetail;
  canManage: boolean;
  t: T;
  locale: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<CrmActivityType>('CALL');
  const [notes, setNotes] = useState('');
  const [occurredOn, setOccurredOn] = useState('');

  function submit(): void {
    if (pending) return;
    startTransition(async () => {
      const result = await logLeadActivityAction(lead.id, {
        type: type as Exclude<CrmActivityType, 'TASK_COMPLETED'>,
        notes: notes.trim(),
        occurredAt: fromDateInputValue(occurredOn) ?? undefined,
      });
      if (result.ok) {
        setNotes('');
        setOccurredOn('');
        toast(t('detail.activityLogged'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div {...stylex.props(styles.panelStack)}>
      {canManage ? (
        <Card variant="default" padding={0} xstyle={styles.card}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.logActivity')}</h3>
          <div {...stylex.props(styles.addForm)}>
            <div {...stylex.props(styles.addFormRow)}>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as CrmActivityType)}
                aria-label={t('detail.activityTypeLabel')}
              >
                {LOGGABLE_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {t(`activityType.${option}`)}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                aria-label={t('detail.activityDateLabel')}
              />
            </div>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('detail.activityNotesPlaceholder')}
              aria-label={t('detail.activityNotesPlaceholder')}
            />
            <div {...stylex.props(styles.addFormActions)}>
              <Btn v="primary" size="sm" icon="plus" onClick={submit} disabled={pending}>
                {pending ? t('form.saving') : t('detail.logActivitySubmit')}
              </Btn>
            </div>
          </div>
        </Card>
      ) : null}

      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.activityTimeline')}</h3>
        <p {...stylex.props(styles.sectionHint)}>{t('detail.activityTimelineHint')}</p>
        {lead.activities.length === 0 ? (
          <p {...stylex.props(styles.mutedText)}>{t('detail.noActivities')}</p>
        ) : (
          <ul {...stylex.props(styles.timeline)}>
            {lead.activities.map((activity, index) => (
              <TimelineEntry
                key={activity.id}
                activity={activity}
                isLast={index === lead.activities.length - 1}
                t={t}
                locale={locale}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Notes                                                              */
/* ------------------------------------------------------------------ */

/** Notes — add a `NOTE` activity + the note history, newest first. */
function NotesPanel({
  lead,
  canManage,
  t,
  locale,
}: {
  lead: LeadDetail;
  canManage: boolean;
  t: T;
  locale: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');

  const notes = lead.activities.filter((activity) => activity.type === 'NOTE');

  function submit(): void {
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const result = await logLeadActivityAction(lead.id, { type: 'NOTE', notes: trimmed });
      if (result.ok) {
        setBody('');
        toast(t('detail.noteAdded'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div {...stylex.props(styles.panelStack)}>
      {canManage ? (
        <Card variant="default" padding={0} xstyle={styles.card}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.addNote')}</h3>
          <div {...stylex.props(styles.addForm)}>
            <Textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('detail.addNotePlaceholder')}
              aria-label={t('detail.addNote')}
            />
            <div {...stylex.props(styles.addFormActions)}>
              <Btn
                v="primary"
                size="sm"
                icon="plus"
                onClick={submit}
                disabled={pending || !body.trim()}
              >
                {pending ? t('form.saving') : t('detail.addNote')}
              </Btn>
            </div>
          </div>
        </Card>
      ) : null}

      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.notesHistory')}</h3>
        <p {...stylex.props(styles.sectionHint)}>
          {t('detail.notesCount', { count: notes.length })}
        </p>
        {notes.length === 0 ? (
          <p {...stylex.props(styles.mutedText)}>{t('detail.noNotes')}</p>
        ) : (
          <div {...stylex.props(styles.panelStack)}>
            {notes.map((note) => (
              <div key={note.id} {...stylex.props(styles.noteTile)}>
                <div {...stylex.props(styles.noteHead)}>
                  <p {...stylex.props(styles.noteAuthor)}>{note.staffName}</p>
                  <span {...stylex.props(styles.noteMeta)}>
                    {formatDateTime(note.occurredAt, locale)}
                  </span>
                </div>
                <p {...stylex.props(styles.noteBody)}>{note.notes}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tasks                                                              */
/* ------------------------------------------------------------------ */

/** One task row — done toggle, title, due line, and the state badge. */
function TaskRow({
  task,
  canManage,
  pending,
  onToggle,
  t,
  locale,
}: {
  task: CrmTaskEntry;
  canManage: boolean;
  pending: boolean;
  onToggle: (task: CrmTaskEntry) => void;
  t: T;
  locale: string;
}) {
  const done = task.completed;
  const overdue = !done && task.dueDate !== null && new Date(task.dueDate).getTime() < Date.now();
  return (
    <div {...stylex.props(styles.taskRow, done && styles.taskRowDone)}>
      <button
        type="button"
        aria-label={done ? t('detail.taskMarkPending') : t('detail.taskMarkDone')}
        onClick={() => onToggle(task)}
        disabled={pending || !canManage}
        {...stylex.props(styles.taskCheck, done && styles.taskCheckDone)}
      >
        {done ? <Icon name="check" sw={3} {...stylex.props(styles.taskCheckIcon)} /> : null}
      </button>
      <div {...stylex.props(styles.taskMain)}>
        <p {...stylex.props(styles.taskTitle, done && styles.taskTitleDone)}>{task.title}</p>
        <p {...stylex.props(styles.taskSub)}>
          {task.dueDate
            ? t('detail.taskDue', { date: formatDate(task.dueDate, locale) })
            : t('detail.taskNoDue')}
        </p>
      </div>
      {done ? (
        <Badge tone="success">{t('detail.taskDone')}</Badge>
      ) : overdue ? (
        <Badge tone="danger">{t('detail.taskOverdue')}</Badge>
      ) : (
        <Badge tone="warning">{t('detail.taskPending')}</Badge>
      )}
    </div>
  );
}

/** Tasks — the create form + pending and completed lists with a done toggle. */
function TasksPanel({
  lead,
  canManage,
  t,
  locale,
}: {
  lead: LeadDetail;
  canManage: boolean;
  t: T;
  locale: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const pendingTasks = lead.tasks.filter((task) => !task.completed);
  const completedTasks = lead.tasks.filter((task) => task.completed);

  function addTask(): void {
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const result = await createLeadTaskAction(lead.id, {
        title: trimmed,
        dueDate: fromDateInputValue(dueDate),
      });
      if (result.ok) {
        setTitle('');
        setDueDate('');
        toast(t('detail.taskAdded'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function toggle(task: CrmTaskEntry): void {
    startTransition(async () => {
      const result = await toggleLeadTaskAction(lead.id, task.id, !task.completed);
      if (result.ok) {
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div {...stylex.props(styles.panelStack)}>
      {canManage ? (
        <Card variant="default" padding={0} xstyle={styles.card}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.createTask')}</h3>
          <div {...stylex.props(styles.addForm)}>
            <div {...stylex.props(styles.addFormRow)}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('detail.taskTitlePlaceholder')}
                aria-label={t('detail.taskTitlePlaceholder')}
              />
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label={t('detail.taskDueLabel')}
              />
            </div>
            <div {...stylex.props(styles.addFormActions)}>
              <Btn
                v="primary"
                size="sm"
                icon="plus"
                onClick={addTask}
                disabled={pending || !title.trim()}
              >
                {pending ? t('form.saving') : t('detail.createTask')}
              </Btn>
            </div>
          </div>
        </Card>
      ) : null}

      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.pendingTasksTitle')}</h3>
        <p {...stylex.props(styles.sectionHint)}>
          {t('detail.pendingTasksCount', { count: pendingTasks.length })}
        </p>
        {pendingTasks.length === 0 ? (
          <p {...stylex.props(styles.mutedText)}>{t('detail.noPendingTasks')}</p>
        ) : (
          <div {...stylex.props(styles.panelStack)}>
            {pendingTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                canManage={canManage}
                pending={pending}
                onToggle={toggle}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        )}
      </Card>

      {completedTasks.length > 0 ? (
        <Card variant="default" padding={0} xstyle={styles.card}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.completedTasksTitle')}</h3>
          <p {...stylex.props(styles.sectionHint)}>
            {t('detail.completedTasksCount', { count: completedTasks.length })}
          </p>
          <div {...stylex.props(styles.panelStack)}>
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                canManage={canManage}
                pending={pending}
                onToggle={toggle}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
