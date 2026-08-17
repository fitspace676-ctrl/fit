'use client';

import * as stylex from '@stylexjs/stylex';
import { Button } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { SubscriptionPlanForm, type PlanClassTypeOption } from './subscription-plan-form';

const styles = stylex.create({
  drawer: {
    height: 'calc(100dvh - 1.5rem)',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-body)',
    boxShadow: 'var(--shadow-high)',
  },
  header: {
    paddingBlock: '0.5rem',
  },
  content: {
    padding: '1.5rem',
  },
});

/**
 * "New plan" as a right-hand drawer, replacing the standalone `/payments/new` page
 * so the plans board stays on screen behind the form (the same treatment members and
 * products get from `AddMemberDrawer` / `AddProductDrawer`). {@link useSlideDrawer}
 * owns the slide and the staged close.
 *
 * Wider than the member drawer at 42rem: the pricing row is a three-column grid
 * (price · currency · billing cadence) and the form carries a live member preview
 * stacked beneath it, both of which turn unreadable in a 32rem panel.
 *
 * The trigger is a plain Tailwind button rather than an Astryx `Button` — unlike the
 * Astryx-only shop and members screens, the plans board is still Tailwind, and the
 * action sits inline with its segment control.
 *
 * Rendered only for staff holding `BillingManage` (the board gates on it), but that
 * is presentation only — `createSubscriptionPlanAction` and the API both re-check.
 */
export function NewPlanDrawer({ classTypes }: { classTypes: PlanClassTypeOption[] }) {
  const t = useTranslations('admin.billingPlans');
  const drawer = useSlideDrawer();
  const title = t('newPlanTitle');

  return (
    <>
      <Button
        variant="primary"
        size="inline"
        onClick={drawer.open}
        icon={<Icon name="plus" />}
        label={t('newPlan')}
      />

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        // `Dialog` renders a bare <dialog> and never wires its header to one, so
        // without this the drawer is announced unnamed.
        aria-label={title}
        width="42rem"
        maxHeight="100dvh"
        position={{ top: '0.75rem', right: '0.75rem', bottom: '0.75rem' }}
        padding={6}
        xstyle={[styles.drawer, drawer.motion]}
      >
        <Layout
          height="fill"
          header={
            <DialogHeader
              title={title}
              hasDivider={false}
              onOpenChange={drawer.handleOpenChange}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              <SubscriptionPlanForm
                key={drawer.contentKey}
                mode="create"
                classTypes={classTypes}
                onSuccess={drawer.requestClose}
                onCancel={drawer.requestClose}
              />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
