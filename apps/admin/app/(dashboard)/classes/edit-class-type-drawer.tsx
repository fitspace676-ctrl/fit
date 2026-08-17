'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminClassTypeRow } from '@fit/types';
import { Button, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { ClassTypeForm, type ClassTypeInitial } from './class-type-form';
import { getClassTypeAction } from './class-type-actions';
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
  header: {
    paddingBlock: '0.5rem',
  },
  content: {
    padding: '1.5rem',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '8rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/**
 * "Edit class type" — a right-hand slide-in drawer, one per roster row. The row
 * carries everything the form needs except the description, so on open it pulls
 * the full profile via {@link getClassTypeAction} and hands it to {@link ClassTypeForm}
 * in edit mode. {@link useSlideDrawer} owns the slide + staged close; the form's
 * `onSuccess` refreshes the roster and closes the drawer.
 *
 * Rendered only for staff holding `ClassWrite` (the page gates on it); the action
 * and the API both re-check.
 */
export function EditClassTypeDrawer({
  type,
  plans,
}: {
  type: AdminClassTypeRow;
  plans: RelationOption[];
}) {
  const drawer = useSlideDrawer();
  const [initial, setInitial] = useState<ClassTypeInitial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  function open(): void {
    setInitial(null);
    setError(null);
    drawer.open();
    startLoading(async () => {
      const result = await getClassTypeAction(type.id);
      if (result.ok) {
        setInitial(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size="inline"
        onClick={open}
        aria-label={`Edit ${type.name}`}
        label="Edit"
      />

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        aria-label={`Edit ${type.name}`}
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
              title={`Edit ${type.name}`}
              hasDivider={false}
              onOpenChange={drawer.handleOpenChange}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              {error ? (
                <Card padding="none" xstyle={styles.errorCard}>
                  <Icon name="info" {...stylex.props(styles.errorIcon)} />
                  <p role="alert" {...stylex.props(styles.errorText)}>
                    {error}
                  </p>
                </Card>
              ) : loading || !initial ? (
                <div {...stylex.props(styles.centered)}>Loading…</div>
              ) : (
                <ClassTypeForm
                  key={drawer.contentKey}
                  mode="edit"
                  typeId={type.id}
                  initial={initial}
                  plans={plans}
                  onSuccess={drawer.requestClose}
                  onCancel={drawer.requestClose}
                />
              )}
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
