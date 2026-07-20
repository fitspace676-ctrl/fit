'use client';

import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { ClassTypeForm } from './class-type-form';
import type { RelationOption } from './class-template-form';

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
 * "New class type" as a right-hand slide-in drawer on the Class Types tab —
 * curate a reusable kind of class (Boxing, CrossFit) the schedule then places
 * occurrences of. {@link useSlideDrawer} owns the slide + staged close; the form's
 * `onSuccess` refreshes the roster and closes the drawer in place.
 *
 * Rendered only for staff holding `ClassWrite` (the page gates on it); the action
 * and the API both re-check.
 */
export function AddClassTypeDrawer({ plans }: { plans: RelationOption[] }) {
  const drawer = useSlideDrawer();

  return (
    <>
      <Button
        variant="primary"
        size="lg"
        label="New class type"
        icon={<Icon name="plus" sw={2} {...stylex.props(styles.icon)} />}
        onClick={drawer.open}
      />

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        aria-label="New class type"
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
              title="Add New Class Type"
              hasDivider={false}
              onOpenChange={drawer.handleOpenChange}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              <ClassTypeForm
                key={drawer.contentKey}
                mode="create"
                plans={plans}
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
