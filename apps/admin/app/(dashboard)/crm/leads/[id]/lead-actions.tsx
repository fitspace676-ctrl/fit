'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { LeadDetail } from '@fit/types';
import { Btn, ConfirmDialog, useToast } from '@/components/ui';
import { deleteLeadAction } from '../../actions';
import { CloseLeadDialog, type CloseKind } from '../../close-lead-dialog';
import { LeadFormDialog } from '../../lead-form-dialog';
import { isOpenLead } from '../../lead-meta';
import type { SelectOption } from '../../leads-view';

const styles = stylex.create({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
});

/** Which dialog is up. */
type DialogState =
  | { kind: 'edit' }
  | { kind: 'close'; close: CloseKind }
  | { kind: 'delete' }
  | null;

/**
 * The lead header's write actions (`CrmManage`): Edit (the full form, including
 * open-stage moves), Mark Won / Mark Lost while the lead is open, and Delete —
 * which navigates back to the roster once the lead is gone.
 */
export function LeadActions({
  lead,
  staffOptions,
  locationOptions,
}: {
  lead: LeadDetail;
  staffOptions: SelectOption[];
  locationOptions: SelectOption[];
}) {
  const t = useTranslations('admin.crm');
  const { toast } = useToast();
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);

  function confirmDelete(): void {
    startDelete(async () => {
      const result = await deleteLeadAction(lead.id);
      if (result.ok) {
        toast(t('list.leadDeleted'), { tone: 'success', icon: 'check' });
        router.push('/crm');
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div {...stylex.props(styles.actions)}>
      {isOpenLead(lead.status) ? (
        <>
          <Btn
            v="primary"
            size="sm"
            icon="check"
            onClick={() => setDialog({ kind: 'close', close: 'won' })}
          >
            {t('detail.markWon')}
          </Btn>
          <Btn
            v="outline"
            size="sm"
            icon="x"
            onClick={() => setDialog({ kind: 'close', close: 'lost' })}
          >
            {t('detail.markLost')}
          </Btn>
        </>
      ) : null}
      <Btn v="outline" size="sm" icon="settings" onClick={() => setDialog({ kind: 'edit' })}>
        {t('detail.edit')}
      </Btn>
      <Btn v="ghost" size="sm" icon="trash" onClick={() => setDialog({ kind: 'delete' })}>
        {t('list.delete')}
      </Btn>

      {dialog?.kind === 'edit' ? (
        <LeadFormDialog
          mode="edit"
          lead={lead}
          staffOptions={staffOptions}
          locationOptions={locationOptions}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'close' ? (
        <CloseLeadDialog
          kind={dialog.close}
          leadId={lead.id}
          leadName={`${lead.firstName} ${lead.lastName}`}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={confirmDelete}
        title={t('list.deleteTitle')}
        message={t('list.deleteMessage', { name: `${lead.firstName} ${lead.lastName}` })}
        confirmLabel={t('list.delete')}
        cancelLabel={t('form.cancel')}
        danger
        busy={deleting}
      />
    </div>
  );
}
