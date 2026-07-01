'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { MeGoal } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Btn, Card, Icon, Progress, useToast } from '@/src/components/ui';
import { saveGoalsAction } from '@/app/actions/goals';

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

/** A "Your goals" card: progress bars in view mode, an inline editor (add/remove,
 * label/current/target/unit) in edit mode, persisted via the goals action. */
export function GoalsCard({ initialGoals }: { initialGoals: MeGoal[] }) {
  const t = useTranslations('member.goals');
  const { toast } = useToast();
  const router = useRouter();
  const [goals, setGoals] = useState<MeGoal[]>(initialGoals);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(initialGoals.map(toDraft));
  const [pending, startSaving] = useTransition();

  function startEdit(): void {
    setDrafts(
      goals.length > 0 ? goals.map(toDraft) : [{ label: '', current: '0', target: '10', unit: '' }],
    );
    setEditing(true);
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
      .slice(0, 8);

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
    <Card glow className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="target" className="h-5 w-5 text-brand-600 dark:text-brand-300" />
          <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">
            {t('title')}
          </h2>
        </div>
        {!editing ? (
          <Btn v="ghost" size="sm" icon="settings" onClick={startEdit}>
            {t('edit')}
          </Btn>
        ) : (
          <div className="flex gap-2">
            <Btn v="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
              {t('cancel')}
            </Btn>
            <Btn v="primary" size="sm" icon="check" onClick={save} disabled={pending}>
              {pending ? t('saving') : t('save')}
            </Btn>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          {drafts.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={d.label}
                placeholder={t('labelPh')}
                onChange={(e) =>
                  setDrafts((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
                className="h-10 min-w-0 flex-1 rounded-field border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
              <input
                type="number"
                value={d.current}
                aria-label={t('current')}
                onChange={(e) =>
                  setDrafts((p) =>
                    p.map((x, j) => (j === i ? { ...x, current: e.target.value } : x)),
                  )
                }
                className="h-10 w-16 rounded-field border border-ink-200 bg-white px-2 text-center text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
              <span className="text-ink-400">/</span>
              <input
                type="number"
                value={d.target}
                aria-label={t('target')}
                onChange={(e) =>
                  setDrafts((p) =>
                    p.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)),
                  )
                }
                className="h-10 w-16 rounded-field border border-ink-200 bg-white px-2 text-center text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
              <input
                value={d.unit}
                placeholder={t('unitPh')}
                onChange={(e) =>
                  setDrafts((p) => p.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))
                }
                className="h-10 w-20 rounded-field border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
              <button
                type="button"
                aria-label={t('remove')}
                onClick={() => setDrafts((p) => p.filter((_, j) => j !== i))}
                className="grid h-9 w-9 place-items-center rounded-md text-ink-400 hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/10"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
          {drafts.length < 8 && (
            <Btn
              v="outline"
              size="sm"
              icon="plus"
              onClick={() =>
                setDrafts((p) => [...p, { label: '', current: '0', target: '10', unit: '' }])
              }
            >
              {t('add')}
            </Btn>
          )}
        </div>
      ) : goals.length > 0 ? (
        <div className="mt-4 space-y-4">
          {goals.map((g) => {
            const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
            return (
              <div key={g.id}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink-800 dark:text-ink-200">{g.label}</span>
                  <span className="font-mono text-ink-500 dark:text-ink-400">
                    {g.current}/{g.target} {g.unit}
                  </span>
                </div>
                <Progress value={pct} tone="bg-brand-500" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 grid place-items-center gap-2 py-6 text-center">
          <Icon name="target" className="h-8 w-8 text-ink-300 dark:text-ink-600" />
          <p className="text-sm text-ink-500 dark:text-ink-400">{t('empty')}</p>
          <Btn v="outline" size="sm" icon="plus" onClick={startEdit}>
            {t('addFirst')}
          </Btn>
        </div>
      )}
    </Card>
  );
}
