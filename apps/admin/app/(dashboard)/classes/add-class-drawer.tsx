'use client';

import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminClassTypeOption } from '@fit/types';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { ClassTemplateForm, type RelationOption } from './class-template-form';

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
 * "New class" as a right-hand slide-in drawer, replacing the jump to the
 * standalone `/classes/new` page so the class-templates roster stays on screen
 * behind the form (the same treatment products and members get from their add
 * drawers). {@link useSlideDrawer} owns the slide and the staged close, and the
 * form's `onSuccess` refreshes the roster and closes the drawer in place instead
 * of navigating away.
 *
 * Wider than the member drawer at 44rem: the form's capacity/duration and PT
 * pricing rows are three-column grids and the recurrence editor needs room, so a
 * narrower drawer crowds them.
 *
 * Rendered only for staff holding `ClassWrite` (the page gates on it), but that is
 * presentation only — `createClassTemplateAction` and the API both re-check.
 */
export function AddClassDrawer({
  trainers,
  locations,
  plans,
  classTypes,
  triggerLabel = 'New class',
}: {
  trainers: RelationOption[];
  locations: RelationOption[];
  plans: RelationOption[];
  classTypes: AdminClassTypeOption[];
  /** Label for the button that opens the drawer (e.g. "Add Class" on the schedule). */
  triggerLabel?: string;
}) {
  const drawer = useSlideDrawer();

  return (
    <>
      <Button
        variant="primary"
        size="lg"
        label={triggerLabel}
        icon={<Icon name="plus" sw={2} {...stylex.props(styles.icon)} />}
        onClick={drawer.open}
      />

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        // `Dialog` renders a bare <dialog> and never wires its header to one, so
        // without this the drawer is announced unnamed.
        aria-label="New class"
        width="44rem"
        maxHeight="100dvh"
        position={{ top: '0.75rem', right: '0.75rem', bottom: '0.75rem' }}
        padding={6}
        xstyle={[styles.drawer, drawer.motion]}
      >
        <Layout
          height="fill"
          header={
            <DialogHeader
              title="New class"
              hasDivider={false}
              onOpenChange={drawer.handleOpenChange}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              <ClassTemplateForm
                key={drawer.contentKey}
                mode="create"
                trainers={trainers}
                locations={locations}
                plans={plans}
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
