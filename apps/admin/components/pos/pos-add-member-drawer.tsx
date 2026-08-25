'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { GymMemberIntakeSettings } from '@fit/types';
import { MemberForm } from '@/app/(dashboard)/members/member-form';
import type { PosMemberRow } from '@/app/(dashboard)/pos/actions';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';

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
  guestHint: {
    margin: 0,
    marginBlockEnd: '1rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  // An outlined pill, not a bare text link — it sits among the cart's real
  // controls and has to read as one of them.
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-pill, 999px)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-text-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-accent-muted)',
    },
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color',
    transitionDuration: '150ms',
  },
  triggerIcon: { width: '0.875rem', height: '0.875rem' },
});

/**
 * Register a member without leaving the till.
 *
 * This hosts the roster's own {@link MemberForm}, not a POS-specific copy, so the
 * till asks for exactly what the members page asks for — the gym's Settings →
 * Membership intake config governs both. A member registered here is therefore
 * never thinner than one registered from the roster, which is the whole point:
 * the two entry points cannot drift because there is only one form.
 *
 * Two deliberate departures from the roster drawer:
 *
 *  • `enrolment={false}` — at the till the enrolment *is* the cart. Offering a
 *    plan and a payment method here would invite charging the member twice.
 *  • `onCreated` — the new member is handed straight back and attached to the sale
 *    in progress, so a walk-in who wants a membership becomes a member and the
 *    sale continues in one step.
 */
export function PosAddMemberDrawer({
  intake,
  onCreated,
  onError,
}: {
  intake: GymMemberIntakeSettings;
  onCreated: (member: PosMemberRow) => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('admin.pos.member');
  const drawer = useSlideDrawer();
  const title = t('addNewTitle');

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onError(null);
          drawer.open();
        }}
        {...stylex.props(styles.trigger)}
      >
        <Icon name="plus" {...stylex.props(styles.triggerIcon)} sw={2} />
        {t('addNew')}
      </button>

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        // `Dialog` renders a bare <dialog> and never wires its header to one, so
        // without this the drawer is announced unnamed.
        aria-label={title}
        width="32rem"
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
              {/* Someone added at the till holds no subscription, so the roster
                  derives their standing as a guest. Said here because the form
                  itself has no status field to show it. */}
              <p {...stylex.props(styles.guestHint)}>{t('guestHint')}</p>
              <MemberForm
                key={drawer.contentKey}
                mode="create"
                intake={intake}
                enrolment={false}
                submitLabel={t('createAndAttach')}
                onSuccess={(member) => {
                  drawer.requestClose();
                  // A person registered at the till has no photo, and no plan
                  // until one is sold to them — which is often the next thing
                  // that happens on this very sale. Until then they are a guest
                  // on a live account, which is what the roster would derive for
                  // them the moment it is asked.
                  onCreated({
                    ...member,
                    photoUrl: null,
                    planName: null,
                    outstanding: null,
                    kind: 'GUEST',
                    status: 'ACTIVE',
                  });
                }}
                onCancel={drawer.requestClose}
              />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
