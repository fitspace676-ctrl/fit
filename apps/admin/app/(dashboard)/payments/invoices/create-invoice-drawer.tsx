'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Icon, buttonClasses, useToast } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { InvoiceForm } from './invoice-form';

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
 * "Create invoice" as a right-hand drawer, so the invoice roster stays on screen
 * behind the form — the same treatment members, products and plans get.
 * {@link useSlideDrawer} owns the slide and the staged close.
 *
 * 40rem wide: the form is a single column, but the description textarea and the
 * amount/date pair need more room than the 32rem member drawer offers.
 *
 * Rendered only for staff holding `BillingManage` (the board gates on it), but that is
 * presentation only — `createInvoiceAction` and the API both re-check.
 */
export function CreateInvoiceDrawer() {
  const drawer = useSlideDrawer();
  const { toast } = useToast();
  const [title] = useState('New invoice');

  return (
    <>
      <button type="button" onClick={drawer.open} className={buttonClasses('primary', 'sm')}>
        <Icon name="plus" className="h-4 w-4" />
        Create invoice
      </button>

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        // `Dialog` renders a bare <dialog> and never wires its header to one, so
        // without this the drawer is announced unnamed.
        aria-label={title}
        width="40rem"
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
              <InvoiceForm
                key={drawer.contentKey}
                onSuccess={({ number }) => {
                  // The number is allocated server-side, so this is the staffer's
                  // first sight of the reference they just created.
                  toast(`Invoice ${number} created`, { tone: 'success', icon: 'check' });
                  drawer.requestClose();
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
