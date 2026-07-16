'use client';

import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout } from '@astryxdesign/core/Layout';
import { LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminProductCategory } from '@fit/types';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { ProductForm } from './product-form';

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
  icon: {
    width: '1rem',
    height: '1rem',
  },
  header: {
    paddingBlock: '0.5rem',
  },
  content: {
    padding: '1.5rem',
  },
});

/**
 * "New product" as a right-hand drawer, replacing the standalone `/shop/new` page
 * so the catalog stays on screen behind the form (the same treatment members get
 * from `AddMemberDrawer`). {@link useSlideDrawer} owns the slide and the staged
 * close.
 *
 * Wider than the member drawer at 40rem: the variants editor is a five-column grid
 * whose fixed columns alone claim ~16rem, so a narrower drawer squeezes the name
 * and SKU inputs to the point of uselessness.
 *
 * Rendered only for staff holding `ProductWrite` (the caller gates on it), but that
 * is presentation only — `createProductAction` and the API both re-check.
 */
export function AddProductDrawer({ categories }: { categories: AdminProductCategory[] }) {
  const drawer = useSlideDrawer();

  return (
    <>
      <Button
        variant="primary"
        size="lg"
        label="New product"
        icon={<Icon name="plus" sw={2} {...stylex.props(styles.icon)} />}
        onClick={drawer.open}
      />

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        // `Dialog` renders a bare <dialog> and never wires its header to one, so
        // without this the drawer is announced unnamed.
        aria-label="New product"
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
              title="New product"
              hasDivider={false}
              onOpenChange={drawer.handleOpenChange}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              <ProductForm
                key={drawer.contentKey}
                mode="create"
                categories={categories}
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
