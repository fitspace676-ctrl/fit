'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout } from '@astryxdesign/core/Layout';
import { LayoutContent } from '@astryxdesign/core/Layout';
import { Icon } from '@/components/ui';
import { MemberForm } from './member-form';

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

export function AddMemberDrawer() {
  const t = useTranslations('admin.members');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        size="lg"
        label={t('list.addMember')}
        icon={<Icon name="plus" sw={2} {...stylex.props(styles.icon)} />}
        onClick={() => setIsOpen(true)}
      />

      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        purpose="info"
        width="32rem"
        maxHeight="100dvh"
        position={{ top: '0.75rem', right: '0.75rem', bottom: '0.75rem' }}
        padding={6}
        xstyle={styles.drawer}
      >
        <Layout
          height="fill"
          header={
            <DialogHeader
              title={t('list.addMember')}
              hasDivider={false}
              onOpenChange={setIsOpen}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              <MemberForm
                mode="create"
                onSuccess={() => setIsOpen(false)}
                onCancel={() => setIsOpen(false)}
              />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
