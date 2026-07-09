'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AudienceSegmentRow, MarketingCatalogResponse, MessageTemplateRow } from '@fit/types';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Btn, ConfirmDialog, Icon, useToast } from '@/components/ui';
import { CampaignWizard } from './campaign-wizard';
import { TemplateFormDialog } from './template-form-dialog';
import { deleteTemplateAction } from './actions';
import { CHANNEL_ICONS, CHANNEL_TONES } from './marketing-meta';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  headingWrap: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  headingTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  headingHint: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  grid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  cardInner: { display: 'flex', flexDirection: 'column', gap: '0.625rem', height: '100%' },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  channelCell: { display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  channelIcon: { width: '0.875rem', height: '0.875rem', flexShrink: 0 },
  rowActions: { display: 'inline-flex', gap: '0.125rem' },
  name: { fontWeight: 600, color: 'var(--color-text-primary)' },
  category: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  preview: {
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.625rem',
  },
  previewLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
  },
  previewSubject: {
    margin: '0.125rem 0 0',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  previewBody: {
    margin: '0.375rem 0 0',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  spacer: { flex: 1 },
  useRow: { display: 'flex' },
  emptyWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    textAlign: 'center',
    paddingBlock: '3rem',
  },
  emptyIcon: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  emptyIconSvg: { width: '1.5rem', height: '1.5rem' },
  emptyTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; template: MessageTemplateRow }
  | { kind: 'use'; template: MessageTemplateRow }
  | { kind: 'delete'; template: MessageTemplateRow }
  | null;

/**
 * The Message Templates gallery (T12.8): each template as a card with channel +
 * category, a subject/body preview, and — behind `MarketingManage` — edit,
 * delete, and "Use in campaign" (opens the wizard seeded with the template's
 * channel/subject/body). The New Template button opens the create form.
 */
export function TemplatesView({
  templates,
  canManage,
  catalog,
  segments,
}: {
  templates: MessageTemplateRow[];
  canManage: boolean;
  catalog: MarketingCatalogResponse;
  segments: AudienceSegmentRow[];
}) {
  const t = useTranslations('admin.marketing');
  const { toast } = useToast();
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, startBusy] = useTransition();

  function confirmDelete(template: MessageTemplateRow): void {
    startBusy(async () => {
      const result = await deleteTemplateAction(template.id);
      if (result.ok) {
        setDialog(null);
        toast(t('templates.deleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div {...stylex.props(styles.stack)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headingWrap)}>
          <h2 {...stylex.props(styles.headingTitle)}>{t('templates.heading')}</h2>
          <p {...stylex.props(styles.headingHint)}>{t('templates.subheading')}</p>
        </div>
        {canManage ? (
          <Btn v="primary" size="md" icon="plus" onClick={() => setDialog({ kind: 'create' })}>
            {t('templates.newTemplate')}
          </Btn>
        ) : null}
      </div>

      {templates.length === 0 ? (
        <div {...stylex.props(styles.emptyWrap)}>
          <span {...stylex.props(styles.emptyIcon)}>
            <Icon name="mail" {...stylex.props(styles.emptyIconSvg)} />
          </span>
          <p {...stylex.props(styles.emptyTitle)}>{t('templates.emptyTitle')}</p>
          <p {...stylex.props(styles.emptyHint)}>
            {canManage ? t('templates.emptyHintWrite') : t('templates.emptyHintRead')}
          </p>
        </div>
      ) : (
        <div {...stylex.props(styles.grid)}>
          {templates.map((template) => (
            <Card key={template.id} variant="default">
              <div {...stylex.props(styles.cardInner)}>
                <div {...stylex.props(styles.cardHead)}>
                  <Badge tone={CHANNEL_TONES[template.channel]}>
                    <span {...stylex.props(styles.channelCell)}>
                      <Icon
                        name={CHANNEL_ICONS[template.channel]}
                        {...stylex.props(styles.channelIcon)}
                      />
                      {t(`channels.${template.channel}`)}
                    </span>
                  </Badge>
                  {canManage ? (
                    <span {...stylex.props(styles.rowActions)}>
                      <Btn
                        v="ghost"
                        size="icon"
                        icon="settings"
                        aria-label={t('templates.editFor', { name: template.name })}
                        title={t('templates.edit')}
                        onClick={() => setDialog({ kind: 'edit', template })}
                      />
                      <Btn
                        v="ghost"
                        size="icon"
                        icon="trash"
                        aria-label={t('templates.deleteFor', { name: template.name })}
                        title={t('templates.delete')}
                        onClick={() => setDialog({ kind: 'delete', template })}
                      />
                    </span>
                  ) : null}
                </div>

                <span {...stylex.props(styles.name)}>{template.name}</span>
                {template.category ? (
                  <span {...stylex.props(styles.category)}>{template.category}</span>
                ) : null}

                <div {...stylex.props(styles.preview)}>
                  {template.subject ? (
                    <>
                      <p {...stylex.props(styles.previewLabel)}>{t('content.subjectLabel')}</p>
                      <p {...stylex.props(styles.previewSubject)}>{template.subject}</p>
                    </>
                  ) : null}
                  <p {...stylex.props(styles.previewBody)}>{template.body}</p>
                </div>

                <span {...stylex.props(styles.spacer)} />
                {canManage ? (
                  <div {...stylex.props(styles.useRow)}>
                    <Btn
                      v="outline"
                      size="sm"
                      iconRight="chevronRight"
                      onClick={() => setDialog({ kind: 'use', template })}
                    >
                      {t('templates.use')}
                    </Btn>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {dialog?.kind === 'create' ? (
        <TemplateFormDialog mode="create" catalog={catalog} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <TemplateFormDialog
          mode="edit"
          seed={dialog.template}
          catalog={catalog}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'use' ? (
        <CampaignWizard
          mode="create"
          initial={{
            channel: dialog.template.channel,
            subject: dialog.template.subject,
            body: dialog.template.body,
          }}
          catalog={catalog}
          segments={segments}
          templates={templates}
          onClose={() => setDialog(null)}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.template);
          }
        }}
        title={t('templates.deleteTitle')}
        message={
          dialog?.kind === 'delete'
            ? t('templates.deleteMessage', { name: dialog.template.name })
            : ''
        }
        confirmLabel={t('templates.delete')}
        cancelLabel={t('wizard.cancel')}
        danger
        busy={busy}
      />
    </div>
  );
}
