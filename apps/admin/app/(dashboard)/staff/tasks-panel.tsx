'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { StaffMember, StaffTaskRow } from '@fit/types';
import { Btn, Icon, Input, Textarea, useToast } from '@/components/ui';
import {
  addStaffTaskAction,
  deleteStaffTaskAction,
  loadStaffTasksAction,
  updateStaffTaskAction,
} from './depth-actions';
import { depthStyles as s, EmptyCard, StaffPicker, formatDate } from './depth-shared';

const styles = stylex.create({
  taskRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: '0.75rem',
  },
  check: {
    marginTop: '0.125rem',
    display: 'grid',
    height: '1.25rem',
    width: '1.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    background: 'none',
    cursor: 'pointer',
    color: 'var(--color-on-accent)',
  },
  checkDone: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent)',
  },
  main: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: 'var(--color-text-secondary)',
  },
  desc: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'pre-wrap',
  },
  deleteBtn: {
    display: 'grid',
    height: '1.75rem',
    width: '1.75rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    background: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The Tasks tab (T12.15) — assign follow-up tasks to a staff member, toggle them
 * complete, and remove them. Data loads from `GET /staff/:id/tasks` on selection;
 * mutations post through the depth server actions (gated on `StaffManage`).
 */
export function TasksPanel({
  staff,
  selectedStaffId,
  onSelectStaff,
}: {
  staff: StaffMember[];
  selectedStaffId: string;
  onSelectStaff: (id: string) => void;
}) {
  const t = useTranslations('admin.staff');
  const locale = useLocale();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<StaffTaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const load = useCallback(
    (staffId: string) => {
      if (!staffId) {
        setTasks([]);
        return;
      }
      setLoading(true);
      void loadStaffTasksAction(staffId)
        .then((result) => {
          if (result.ok) {
            setTasks(result.data.tasks);
          } else {
            toast(result.error, { tone: 'danger', icon: 'info' });
          }
        })
        .finally(() => setLoading(false));
    },
    [toast],
  );

  useEffect(() => {
    load(selectedStaffId);
  }, [selectedStaffId, load]);

  function add(): void {
    const trimmed = title.trim();
    if (!trimmed || !selectedStaffId) return;
    startTransition(async () => {
      const result = await addStaffTaskAction(selectedStaffId, {
        title: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(dueDate ? { dueDate } : {}),
      });
      if (result.ok) {
        setTasks((prev) => [result.data, ...prev]);
        setTitle('');
        setDescription('');
        setDueDate('');
        toast(t('depth.tasks.added'), { tone: 'success', icon: 'check' });
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function toggle(task: StaffTaskRow): void {
    startTransition(async () => {
      const result = await updateStaffTaskAction(task.id, { completed: !task.completed });
      if (result.ok) {
        setTasks((prev) => prev.map((row) => (row.id === task.id ? result.data : row)));
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function remove(taskId: string): void {
    startTransition(async () => {
      const result = await deleteStaffTaskAction(taskId);
      if (result.ok) {
        setTasks((prev) => prev.filter((task) => task.id !== taskId));
        toast(t('depth.tasks.deleted'), { tone: 'success', icon: 'check' });
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div {...stylex.props(s.stack)}>
      <div {...stylex.props(s.pickerRow)}>
        <StaffPicker
          label={t('depth.pickStaff')}
          staff={staff}
          value={selectedStaffId}
          onChange={onSelectStaff}
        />
      </div>

      {!selectedStaffId ? (
        <EmptyCard>{t('depth.noStaff')}</EmptyCard>
      ) : (
        <Card variant="default" padding={0} xstyle={s.card}>
          <h3 {...stylex.props(s.sectionLabel)}>{t('depth.tasks.title')}</h3>

          <div {...stylex.props(s.addForm)}>
            <Input
              placeholder={t('depth.tasks.titlePlaceholder')}
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Textarea
              rows={2}
              placeholder={t('depth.tasks.descPlaceholder')}
              value={description}
              maxLength={4000}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div {...stylex.props(s.addFormRow)}>
              <Input
                type="date"
                aria-label={t('depth.tasks.dueLabel')}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
              <div {...stylex.props(s.addFormActions)}>
                <Btn
                  v="primary"
                  size="sm"
                  icon="plus"
                  onClick={add}
                  disabled={pending || !title.trim()}
                >
                  {pending ? t('depth.saving') : t('depth.tasks.add')}
                </Btn>
              </div>
            </div>
          </div>

          {loading ? (
            <p {...stylex.props(s.mutedText)}>{t('depth.loading')}</p>
          ) : tasks.length === 0 ? (
            <p {...stylex.props(s.mutedText)}>{t('depth.tasks.empty')}</p>
          ) : (
            <div {...stylex.props(s.stack)}>
              {tasks.map((task) => (
                <div key={task.id} {...stylex.props(styles.taskRow)}>
                  <button
                    type="button"
                    aria-label={
                      task.completed ? t('depth.tasks.markPending') : t('depth.tasks.markDone')
                    }
                    onClick={() => toggle(task)}
                    disabled={pending}
                    {...stylex.props(styles.check, task.completed && styles.checkDone)}
                  >
                    {task.completed ? <Icon name="check" {...stylex.props(s.smIcon)} /> : null}
                  </button>
                  <div {...stylex.props(styles.main)}>
                    <p {...stylex.props(styles.title, task.completed && styles.titleDone)}>
                      {task.title}
                    </p>
                    <p {...stylex.props(s.rowSub)}>
                      {task.dueDate
                        ? t('depth.tasks.due', { date: formatDate(task.dueDate, locale) })
                        : t('depth.tasks.noDue')}
                      {task.assignedBy ? ` · ${task.assignedBy}` : ''}
                    </p>
                    {task.description ? (
                      <p {...stylex.props(styles.desc)}>{task.description}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={t('depth.tasks.deleteAria')}
                    onClick={() => remove(task.id)}
                    disabled={pending}
                    {...stylex.props(styles.deleteBtn)}
                  >
                    <Icon name="trash" {...stylex.props(s.smIcon)} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
