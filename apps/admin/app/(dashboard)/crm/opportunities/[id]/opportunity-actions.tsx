'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { OpportunityDetail } from '@fit/types';
import { Btn, ConfirmDialog, useToast } from '@/components/ui';
import { deleteOpportunityAction } from '../../actions';
import { CloseOpportunityDialog, type CloseKind } from '../../close-opportunity-dialog';
import { OpportunityFormDialog } from '../../opportunity-form-dialog';
import { isOpenOpportunity } from '../../opportunity-meta';
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
 * The opportunity header's write actions (`CrmManage`): Edit (the full form,
 * including open-stage moves), Mark Won / Mark Lost while the opportunity is
 * open, and Delete — which navigates back to the workspace once it is gone.
 */
export function OpportunityActions({
  opportunity,
  staffOptions,
}: {
  opportunity: OpportunityDetail;
  staffOptions: SelectOption[];
}) {
  const t = useTranslations('admin.crm');
  const { toast } = useToast();
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);

  function confirmDelete(): void {
    startDelete(async () => {
      const result = await deleteOpportunityAction(opportunity.id);
      if (result.ok) {
        toast(t('opportunityList.deleted'), { tone: 'success', icon: 'check' });
        router.push('/crm?tab=opportunities');
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div {...stylex.props(styles.actions)}>
      {isOpenOpportunity(opportunity.status) ? (
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
        <OpportunityFormDialog
          mode="edit"
          opportunity={opportunity}
          staffOptions={staffOptions}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'close' ? (
        <CloseOpportunityDialog
          kind={dialog.close}
          opportunityId={opportunity.id}
          memberName={opportunity.member.name}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={confirmDelete}
        title={t('opportunityList.deleteTitle')}
        message={t('opportunityList.deleteMessage', { name: opportunity.member.name })}
        confirmLabel={t('list.delete')}
        cancelLabel={t('form.cancel')}
        danger
        busy={deleting}
      />
    </div>
  );
}
