'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { StaffMember, StaffNoteRow } from '@fit/types';
import { Btn, Icon, Textarea, useToast } from '@/components/ui';
import { addStaffNoteAction, deleteStaffNoteAction, loadStaffNotesAction } from './depth-actions';
import { depthStyles as s, EmptyCard, StaffPicker, formatDateTime } from './depth-shared';

const styles = stylex.create({
  deleteBtn: {
    display: 'grid',
    height: '1.75rem',
    width: '1.75rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    background: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The Notes tab (T12.15) — pick a staff member, then read / add / delete internal
 * notes about them. Data loads from `GET /staff/:id/notes` on selection; each
 * mutation posts through the depth server actions (gated on `StaffManage`) and
 * refreshes the list.
 */
export function NotesPanel({
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
  const [notes, setNotes] = useState<StaffNoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');

  const load = useCallback(
    (staffId: string) => {
      if (!staffId) {
        setNotes([]);
        return;
      }
      setLoading(true);
      void loadStaffNotesAction(staffId)
        .then((result) => {
          if (result.ok) {
            setNotes(result.data.notes);
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

  function submit(): void {
    const trimmed = body.trim();
    if (!trimmed || !selectedStaffId) return;
    startTransition(async () => {
      const result = await addStaffNoteAction(selectedStaffId, { body: trimmed });
      if (result.ok) {
        setNotes((prev) => [result.data, ...prev]);
        setBody('');
        toast(t('depth.notes.added'), { tone: 'success', icon: 'check' });
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function remove(noteId: string): void {
    startTransition(async () => {
      const result = await deleteStaffNoteAction(noteId);
      if (result.ok) {
        setNotes((prev) => prev.filter((note) => note.id !== noteId));
        toast(t('depth.notes.deleted'), { tone: 'success', icon: 'check' });
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
          <h3 {...stylex.props(s.sectionLabel)}>{t('depth.notes.title')}</h3>

          <div {...stylex.props(s.addForm)}>
            <Textarea
              rows={3}
              placeholder={t('depth.notes.placeholder')}
              value={body}
              maxLength={4000}
              onChange={(event) => setBody(event.target.value)}
            />
            <div {...stylex.props(s.addFormActions)}>
              <Btn
                v="primary"
                size="sm"
                icon="plus"
                onClick={submit}
                disabled={pending || !body.trim()}
              >
                {pending ? t('depth.saving') : t('depth.notes.add')}
              </Btn>
            </div>
          </div>

          {loading ? (
            <p {...stylex.props(s.mutedText)}>{t('depth.loading')}</p>
          ) : notes.length === 0 ? (
            <p {...stylex.props(s.mutedText)}>{t('depth.notes.empty')}</p>
          ) : (
            <div {...stylex.props(s.stack)}>
              {notes.map((note) => (
                <div key={note.id} {...stylex.props(s.tile)}>
                  <div {...stylex.props(s.tileHead)}>
                    <p {...stylex.props(s.tileAuthor)}>{note.author}</p>
                    <div {...stylex.props(s.tileHead)}>
                      <span {...stylex.props(s.metaMono)}>
                        {formatDateTime(note.createdAt, locale)}
                      </span>
                      <button
                        type="button"
                        aria-label={t('depth.notes.deleteAria')}
                        onClick={() => remove(note.id)}
                        disabled={pending}
                        {...stylex.props(styles.deleteBtn)}
                      >
                        <Icon name="trash" {...stylex.props(s.smIcon)} />
                      </button>
                    </div>
                  </div>
                  <p {...stylex.props(s.tileBody)}>{note.body}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
