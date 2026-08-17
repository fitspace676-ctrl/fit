'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { MeGoal } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Icon, useToast } from '@/src/components/ui';
import { Button, Card, EmptyState, Meter, focus, text } from '@/src/components/ui/kit';
import { saveGoalsAction } from '@/app/actions/goals';

// The last Tailwind-authored screen in the member portal, on the kit.
//
// It was also the last place a `Card glow` survived — the Aurora-glass skin's
// coloured bloom, which the FormaCore direction bans outright; the card is flat
// now, like every other panel. The editor's four inputs were hand-rolled with
// Tailwind focus rings in brand-500 at 20% opacity, one ring per field and none
// of them matching the sign-in screen's; they share the kit's one ring now.
//
// The bars are the kit's `Meter` with its header hidden: this card prints its own
// `current/target unit` line, which carries the unit the meter's plain `n/m`
// cannot.

const styles = stylex.create({
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  headIcon: {
    height: '1.25rem',
    width: '1.25rem',
    color: 'var(--color-icon-accent)',
  },
  title: {
    fontSize: '1rem',
  },
  headActions: {
    display: 'flex',
    gap: '0.5rem',
  },

  /* -------------------------------- editor -------------------------------- */
  rows: {
    marginTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  // The editor's inputs are bare controls in a row rather than labelled fields:
  // the column headings are implied by position, and a 10px micro-label over
  // each of four inline boxes would be more chrome than content. They keep the
  // kit's field SKIN so they still belong to the same family.
  input: {
    height: '2.5rem',
    minWidth: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--fc-tile)',
    color: 'var(--color-text-primary)',
    paddingInline: '0.75rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    outline: 'none',
    boxShadow: { default: null, ':focus': 'var(--fc-focus-ring)' },
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
    '::placeholder': { color: 'var(--color-text-disabled)' },
  },
  inputLabel: { flex: 1 },
  inputNumber: {
    width: '4rem',
    paddingInline: '0.5rem',
    textAlign: 'center',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  inputUnit: { width: '5rem', paddingInline: '0.5rem' },
  slash: { color: 'var(--color-text-disabled)' },
  remove: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-error-muted)' },
    color: { default: 'var(--color-text-disabled)', ':hover': 'var(--color-text-red)' },
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  removeIcon: { height: '1rem', width: '1rem' },

  /* --------------------------------- view --------------------------------- */
  list: {
    marginTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  goalHead: {
    marginBottom: '0.375rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.875rem',
  },
  goalLabel: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  emptyIcon: {
    height: '2rem',
    width: '2rem',
  },
});

/** The maximum number of goals a member may track. */
const MAX_GOALS = 8;

interface Draft {
  label: string;
  current: string;
  target: string;
  unit: string;
}

const toDraft = (g: MeGoal): Draft => ({
  label: g.label,
  current: String(g.current),
  target: String(g.target),
  unit: g.unit,
});

const BLANK: Draft = { label: '', current: '0', target: '10', unit: '' };

/**
 * A "Your goals" card: progress bars in view mode, an inline editor (add/remove,
 * label/current/target/unit) in edit mode, persisted via the goals action.
 */
export function GoalsCard({ initialGoals }: { initialGoals: MeGoal[] }) {
  const t = useTranslations('member.goals');
  const { toast } = useToast();
  const router = useRouter();
  const [goals, setGoals] = useState<MeGoal[]>(initialGoals);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(initialGoals.map(toDraft));
  const [pending, startSaving] = useTransition();

  function startEdit(): void {
    setDrafts(goals.length > 0 ? goals.map(toDraft) : [BLANK]);
    setEditing(true);
  }

  function patch(index: number, key: keyof Draft, value: string): void {
    setDrafts((prev) => prev.map((d, j) => (j === index ? { ...d, [key]: value } : d)));
  }

  function save(): void {
    const cleaned = drafts
      .map((d) => ({
        label: d.label.trim(),
        current: Math.max(0, Number(d.current) || 0),
        target: Math.max(1, Number(d.target) || 1),
        unit: d.unit.trim(),
      }))
      .filter((d) => d.label.length > 0)
      .slice(0, MAX_GOALS);

    startSaving(async () => {
      const res = await saveGoalsAction(cleaned);
      if (res.ok) {
        setGoals(cleaned.map((d, i) => ({ id: String(i), ...d })));
        setEditing(false);
        toast(t('saved'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(res.code === 'UNAUTHENTICATED' ? t('signIn') : t('error'), {
          tone: 'danger',
          icon: 'x',
        });
      }
    });
  }

  return (
    <Card>
      <div {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headLeft)}>
          <Icon name="target" {...stylex.props(styles.headIcon)} />
          <h2 {...stylex.props(text.heading, styles.title)}>{t('title')}</h2>
        </div>

        {editing ? (
          <div {...stylex.props(styles.headActions)}>
            <Button
              variant="ghost"
              size="inline"
              label={t('cancel')}
              onClick={() => setEditing(false)}
              disabled={pending}
            />
            <Button
              variant="primary"
              size="inline"
              label={pending ? t('saving') : t('save')}
              icon={<Icon name="check" {...stylex.props(styles.removeIcon)} />}
              onClick={save}
              loading={pending}
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="inline"
            label={t('edit')}
            icon={<Icon name="settings" {...stylex.props(styles.removeIcon)} />}
            onClick={startEdit}
          />
        )}
      </div>

      {editing ? (
        <div {...stylex.props(styles.rows)}>
          {drafts.map((d, i) => (
            <div key={i} {...stylex.props(styles.row)}>
              <input
                value={d.label}
                placeholder={t('labelPh')}
                aria-label={t('labelPh')}
                onChange={(e) => patch(i, 'label', e.target.value)}
                {...stylex.props(styles.input, styles.inputLabel)}
              />
              <input
                type="number"
                value={d.current}
                aria-label={t('current')}
                onChange={(e) => patch(i, 'current', e.target.value)}
                {...stylex.props(styles.input, styles.inputNumber)}
              />
              <span aria-hidden {...stylex.props(styles.slash)}>
                /
              </span>
              <input
                type="number"
                value={d.target}
                aria-label={t('target')}
                onChange={(e) => patch(i, 'target', e.target.value)}
                {...stylex.props(styles.input, styles.inputNumber)}
              />
              <input
                value={d.unit}
                placeholder={t('unitPh')}
                aria-label={t('unitPh')}
                onChange={(e) => patch(i, 'unit', e.target.value)}
                {...stylex.props(styles.input, styles.inputUnit)}
              />
              <button
                type="button"
                aria-label={t('remove')}
                onClick={() => setDrafts((p) => p.filter((_, j) => j !== i))}
                {...stylex.props(styles.remove, focus.ring)}
              >
                <Icon name="trash" {...stylex.props(styles.removeIcon)} />
              </button>
            </div>
          ))}

          {drafts.length < MAX_GOALS && (
            <Button
              variant="secondary"
              size="inline"
              label={t('add')}
              icon={<Icon name="plus" {...stylex.props(styles.removeIcon)} />}
              onClick={() => setDrafts((p) => [...p, BLANK])}
            />
          )}
        </div>
      ) : goals.length > 0 ? (
        <div {...stylex.props(styles.list)}>
          {goals.map((g) => (
            <div key={g.id}>
              <div {...stylex.props(styles.goalHead)}>
                <span {...stylex.props(styles.goalLabel)}>{g.label}</span>
                <span {...stylex.props(text.numeral, text.secondary)}>
                  {g.current}/{g.target} {g.unit}
                </span>
              </div>
              {/* Header off: the line above already states the progress, and with
                  the unit, which a bare `n/m` cannot carry. */}
              <Meter value={g.current} max={g.target} label={g.label} showHeader={false} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          icon={<Icon name="target" {...stylex.props(styles.emptyIcon)} />}
          title={t('empty')}
          action={
            <Button
              variant="secondary"
              size="inline"
              label={t('addFirst')}
              icon={<Icon name="plus" {...stylex.props(styles.removeIcon)} />}
              onClick={startEdit}
            />
          }
        />
      )}
    </Card>
  );
}
