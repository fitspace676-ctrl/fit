'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { StaffMember, StaffSpecialtyRow } from '@fit/types';
import { Btn, Icon, Input, useToast } from '@/components/ui';
import {
  addStaffSpecialtyAction,
  deleteStaffSpecialtyAction,
  loadStaffSpecialtiesAction,
} from './depth-actions';
import { depthStyles as s, EmptyCard, StaffPicker } from './depth-shared';

const styles = stylex.create({
  addRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'stretch',
  },
  grow: {
    flex: 1,
  },
});

/**
 * The Specialties tab (T12.15) — the "Manage Specialties" surface: pick a staff
 * member, then tag / untag their specialties (e.g. "Strength", "Yoga"). Data loads
 * from `GET /staff/:id/specialties`; mutations post through the depth server
 * actions (gated on `StaffManage`).
 */
export function SpecialtiesPanel({
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
  const [specialties, setSpecialties] = useState<StaffSpecialtyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');

  const load = useCallback(
    (staffId: string) => {
      if (!staffId) {
        setSpecialties([]);
        return;
      }
      setLoading(true);
      void loadStaffSpecialtiesAction(staffId)
        .then((result) => {
          if (result.ok) {
            setSpecialties(result.data.specialties);
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
    const trimmed = name.trim();
    if (!trimmed || !selectedStaffId) return;
    startTransition(async () => {
      const result = await addStaffSpecialtyAction(selectedStaffId, { name: trimmed });
      if (result.ok) {
        setSpecialties((prev) => [...prev, result.data]);
        setName('');
        toast(t('depth.specialties.added'), { tone: 'success', icon: 'check' });
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function remove(specialtyId: string): void {
    startTransition(async () => {
      const result = await deleteStaffSpecialtyAction(specialtyId);
      if (result.ok) {
        setSpecialties((prev) => prev.filter((row) => row.id !== specialtyId));
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
          <h3 {...stylex.props(s.sectionLabel)}>{t('depth.specialties.title')}</h3>

          <div {...stylex.props(styles.addRow)}>
            <div {...stylex.props(styles.grow)}>
              <Input
                placeholder={t('depth.specialties.placeholder')}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    add();
                  }
                }}
              />
            </div>
            <Btn v="primary" size="md" icon="plus" onClick={add} disabled={pending || !name.trim()}>
              {t('depth.specialties.add')}
            </Btn>
          </div>

          {loading ? (
            <p {...stylex.props(s.mutedText)}>{t('depth.loading')}</p>
          ) : specialties.length === 0 ? (
            <p {...stylex.props(s.mutedText)}>{t('depth.specialties.empty')}</p>
          ) : (
            <div {...stylex.props(s.chips)}>
              {specialties.map((specialty) => (
                <span key={specialty.id} {...stylex.props(s.chip)}>
                  {specialty.name}
                  <button
                    type="button"
                    aria-label={t('depth.specialties.removeAria', { name: specialty.name })}
                    onClick={() => remove(specialty.id)}
                    disabled={pending}
                    {...stylex.props(s.chipRemove)}
                  >
                    <Icon name="x" {...stylex.props(s.smIcon)} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
