'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { ShiftSlotRow, StaffMember } from '@fit/types';
import { Btn, Icon, Input, Select, useToast } from '@/components/ui';
import { loadStaffScheduleAction, updateStaffScheduleAction } from './depth-actions';
import { depthStyles as s, EmptyCard, StaffPicker } from './depth-shared';

/** The seven weekday indices the API uses — 0 (Mon) … 6 (Sun). */
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** A shift held in the editor draft — a local key plus the API's shift fields. */
interface DraftShift {
  key: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
}

const styles = stylex.create({
  grid: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(7, minmax(0, 1fr))',
    },
  },
  dayCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    minHeight: '6rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.625rem',
  },
  dayName: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
  },
  shift: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.375rem',
  },
  shiftHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.375rem',
  },
  shiftTime: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-accent)',
  },
  shiftLoc: {
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
    overflowWrap: 'anywhere',
  },
  removeShift: {
    display: 'grid',
    height: '1rem',
    width: '1rem',
    placeItems: 'center',
    borderWidth: 0,
    background: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-accent)',
  },
  emptyDay: {
    margin: 0,
    fontSize: '0.6875rem',
    color: 'var(--color-text-disabled)',
  },
  addGrid: {
    display: 'grid',
    gap: '0.625rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 768px)': '1.4fr 1fr 1fr 1.4fr auto',
    },
    alignItems: 'end',
  },
  addField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  addLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
  },
  saveRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  dirty: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
});

/** Compare two draft lists (order-insensitive) to derive the dirty flag. */
function serialise(shifts: DraftShift[]): string {
  return shifts
    .map((shift) => `${shift.dayOfWeek}|${shift.startTime}|${shift.endTime}|${shift.location}`)
    .sort()
    .join('\n');
}

/**
 * The Calendar tab (T12.15) — a staff member's weekly shift schedule as a
 * seven-day grid with shift management. Loads from `GET /staff/:id/schedule`;
 * shifts are edited in a local draft (add / remove) and committed as a whole with
 * `PUT /staff/:id/schedule` (the API is set-based). A dirty indicator shows unsaved
 * edits; every mutation is gated on `StaffManage`.
 */
export function SchedulePanel({
  staff,
  selectedStaffId,
  onSelectStaff,
}: {
  staff: StaffMember[];
  selectedStaffId: string;
  onSelectStaff: (id: string) => void;
}) {
  const t = useTranslations('admin.staff');
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftShift[]>([]);
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const keyRef = useRef(0);

  // New-shift form state.
  const [day, setDay] = useState('0');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [location, setLocation] = useState('');

  const nextKey = useCallback(() => {
    keyRef.current += 1;
    return `k${keyRef.current}`;
  }, []);

  const toDraft = useCallback(
    (shifts: ShiftSlotRow[]): DraftShift[] =>
      shifts.map((shift) => ({
        key: nextKey(),
        dayOfWeek: shift.dayOfWeek,
        startTime: shift.startTime,
        endTime: shift.endTime,
        location: shift.location ?? '',
      })),
    [nextKey],
  );

  const load = useCallback(
    (staffId: string) => {
      if (!staffId) {
        setDraft([]);
        setSaved('');
        return;
      }
      setLoading(true);
      void loadStaffScheduleAction(staffId)
        .then((result) => {
          if (result.ok) {
            const next = toDraft(result.data.shifts);
            setDraft(next);
            setSaved(serialise(next));
          } else {
            toast(result.error, { tone: 'danger', icon: 'info' });
          }
        })
        .finally(() => setLoading(false));
    },
    [toast, toDraft],
  );

  useEffect(() => {
    load(selectedStaffId);
  }, [selectedStaffId, load]);

  const dirty = useMemo(() => serialise(draft) !== saved, [draft, saved]);

  function addShift(): void {
    if (end <= start) {
      toast(t('depth.schedule.invalidRange'), { tone: 'danger', icon: 'info' });
      return;
    }
    setDraft((prev) => [
      ...prev,
      {
        key: nextKey(),
        dayOfWeek: Number(day),
        startTime: start,
        endTime: end,
        location: location.trim(),
      },
    ]);
    setLocation('');
  }

  function removeShift(key: string): void {
    setDraft((prev) => prev.filter((shift) => shift.key !== key));
  }

  function save(): void {
    if (!selectedStaffId) return;
    startTransition(async () => {
      const result = await updateStaffScheduleAction(selectedStaffId, {
        shifts: draft.map((shift) => ({
          dayOfWeek: shift.dayOfWeek,
          startTime: shift.startTime,
          endTime: shift.endTime,
          ...(shift.location ? { location: shift.location } : {}),
        })),
      });
      if (result.ok) {
        const next = toDraft(result.data.shifts);
        setDraft(next);
        setSaved(serialise(next));
        toast(t('depth.schedule.saved'), { tone: 'success', icon: 'check' });
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const byDay = useMemo(() => {
    const map = new Map<number, DraftShift[]>();
    for (const d of DAYS) {
      map.set(d, []);
    }
    for (const shift of draft) {
      map.get(shift.dayOfWeek)?.push(shift);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [draft]);

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
          <div {...stylex.props(s.cardHead)}>
            <h3 {...stylex.props(s.sectionLabel)}>{t('depth.schedule.title')}</h3>
          </div>

          {loading ? (
            <p {...stylex.props(s.mutedText)}>{t('depth.loading')}</p>
          ) : (
            <>
              <div {...stylex.props(styles.grid)}>
                {DAYS.map((d) => {
                  const shifts = byDay.get(d) ?? [];
                  return (
                    <div key={d} {...stylex.props(styles.dayCol)}>
                      <p {...stylex.props(styles.dayName)}>
                        {t(`depth.schedule.days.${d}` as 'depth.schedule.days.0')}
                      </p>
                      {shifts.length === 0 ? (
                        <p {...stylex.props(styles.emptyDay)}>{t('depth.schedule.dayEmpty')}</p>
                      ) : (
                        shifts.map((shift) => (
                          <div key={shift.key} {...stylex.props(styles.shift)}>
                            <div {...stylex.props(styles.shiftHead)}>
                              <span {...stylex.props(styles.shiftTime)}>
                                {shift.startTime}–{shift.endTime}
                              </span>
                              <button
                                type="button"
                                aria-label={t('depth.schedule.removeAria')}
                                onClick={() => removeShift(shift.key)}
                                disabled={pending}
                                {...stylex.props(styles.removeShift)}
                              >
                                <Icon name="x" {...stylex.props(s.smIcon)} />
                              </button>
                            </div>
                            {shift.location ? (
                              <span {...stylex.props(styles.shiftLoc)}>{shift.location}</span>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>

              <div {...stylex.props(styles.addGrid)}>
                <label {...stylex.props(styles.addField)}>
                  <span {...stylex.props(styles.addLabel)}>{t('depth.schedule.dayLabel')}</span>
                  <Select value={day} onChange={(event) => setDay(event.target.value)}>
                    {DAYS.map((d) => (
                      <option key={d} value={String(d)}>
                        {t(`depth.schedule.days.${d}` as 'depth.schedule.days.0')}
                      </option>
                    ))}
                  </Select>
                </label>
                <label {...stylex.props(styles.addField)}>
                  <span {...stylex.props(styles.addLabel)}>{t('depth.schedule.startLabel')}</span>
                  <Input
                    type="time"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
                <label {...stylex.props(styles.addField)}>
                  <span {...stylex.props(styles.addLabel)}>{t('depth.schedule.endLabel')}</span>
                  <Input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
                </label>
                <label {...stylex.props(styles.addField)}>
                  <span {...stylex.props(styles.addLabel)}>
                    {t('depth.schedule.locationLabel')}
                  </span>
                  <Input
                    placeholder={t('depth.schedule.locationPlaceholder')}
                    value={location}
                    maxLength={120}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </label>
                <Btn v="outline" size="md" icon="plus" onClick={addShift} disabled={pending}>
                  {t('depth.schedule.addShift')}
                </Btn>
              </div>

              <div {...stylex.props(styles.saveRow)}>
                <span {...stylex.props(styles.dirty)}>
                  {dirty ? t('depth.schedule.unsaved') : t('depth.schedule.upToDate')}
                </span>
                <Btn v="primary" size="md" icon="check" onClick={save} disabled={pending || !dirty}>
                  {pending ? t('depth.saving') : t('depth.schedule.save')}
                </Btn>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
