'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout } from '@astryxdesign/core/Layout';
import { LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminServiceRow, ServiceStaffOption, ServiceType } from '@fit/types';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { fetchServiceStaffAction } from './actions';
import { ServiceForm } from './service-form';

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
  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  typeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.5rem',
    padding: '1.25rem',
    borderRadius: 'var(--radius-card)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    textAlign: 'left',
    cursor: 'pointer',
  },
  typeTitle: { fontWeight: 700, color: 'var(--color-text-primary)' },
  typeHint: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  loading: { fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
});

/** The New / Edit service drawer. Create asks for the type first; edit opens straight on the form. */
export function ServiceDrawer(
  props: { mode: 'create' } | { mode: 'edit'; service: AdminServiceRow; trigger: React.ReactNode },
) {
  const t = useTranslations('admin.services');
  const drawer = useSlideDrawer();
  const [type, setType] = useState<ServiceType | null>(
    props.mode === 'edit' ? props.service.type : null,
  );
  const [staff, setStaff] = useState<ServiceStaffOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawer.isOpen || staff !== null) return;
    let cancelled = false;
    void fetchServiceStaffAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setStaff(result.data);
      else setLoadError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [drawer.isOpen, staff]);

  // Closing without picking a type (Escape, backdrop, the X) skips both the
  // Cancel handler and the create-success handler, so without this the type
  // step would stay skipped for every "New service" open for the rest of the
  // page's life. Reset once the close animation finishes and `drawer.isOpen`
  // actually goes false.
  useEffect(() => {
    if (props.mode === 'create' && !drawer.isOpen && type !== null) {
      setType(null);
    }
  }, [props.mode, drawer.isOpen, type]);

  const title = props.mode === 'edit' ? t('editService') : t('newService');

  return (
    <>
      {props.mode === 'edit' ? (
        <span onClick={drawer.open}>{props.trigger}</span>
      ) : (
        <Button
          variant="primary"
          size="lg"
          label={t('newService')}
          icon={<Icon name="plus" sw={2} {...stylex.props(styles.icon)} />}
          onClick={drawer.open}
        />
      )}

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
              {loadError ? <p role="alert">{loadError}</p> : null}
              {staff === null && !loadError ? (
                <p {...stylex.props(styles.loading)}>{t('drawer.loadingStaff')}</p>
              ) : null}
              {staff !== null && type === null ? (
                <div {...stylex.props(styles.typeGrid)}>
                  <button
                    type="button"
                    onClick={() => setType('PERSONAL_TRAINING')}
                    {...stylex.props(styles.typeCard)}
                  >
                    <span {...stylex.props(styles.typeTitle)}>{t('drawer.ptTitle')}</span>
                    <span {...stylex.props(styles.typeHint)}>{t('drawer.ptHint')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('CUSTOM')}
                    {...stylex.props(styles.typeCard)}
                  >
                    <span {...stylex.props(styles.typeTitle)}>{t('drawer.customTitle')}</span>
                    <span {...stylex.props(styles.typeHint)}>{t('drawer.customHint')}</span>
                  </button>
                </div>
              ) : null}
              {staff !== null && type !== null ? (
                props.mode === 'edit' ? (
                  <ServiceForm
                    key={drawer.contentKey}
                    mode="edit"
                    service={props.service}
                    staff={staff}
                    onSuccess={drawer.requestClose}
                    onCancel={drawer.requestClose}
                  />
                ) : (
                  <ServiceForm
                    key={drawer.contentKey}
                    mode="create"
                    type={type}
                    staff={staff}
                    onSuccess={() => {
                      drawer.requestClose();
                      setType(null);
                    }}
                    onCancel={() => setType(null)}
                  />
                )
              ) : null}
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
