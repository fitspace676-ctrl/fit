'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { MemberStatus } from '@fit/types';
import { Btn, Icon } from '@/components/ui';
import { createMemberAction, updateMemberAction } from './actions';

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    maxWidth: '32rem',
  },
  formInDrawer: {
    minHeight: '100%',
    maxWidth: 'none',
  },
  formSection: {
    overflow: 'visible',
  },
  sectionIcon: {
    width: '1rem',
    height: '1rem',
  },
  statusToggle: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  labelOptional: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  field: {
    height: '2.75rem',
    width: '100%',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    paddingBlock: 0,
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-disabled)',
    },
    outline: 'none',
  },
  hint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  actionsInDrawer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    width: '100%',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  drawerFooter: {
    position: 'sticky',
    bottom: 0,
    zIndex: 1,
    marginTop: 'auto',
    gap: '0.75rem',
    paddingBlockStart: '1rem',
    paddingBlockEnd: '0.25rem',
    backgroundColor: 'var(--color-background-body)',
  },
  actionButton: {
    width: '100%',
    height: '3rem',
  },
  cancelLink: {
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
});

type Props =
  | { mode: 'create'; onSuccess?: () => void; onCancel?: () => void }
  | {
      mode: 'edit';
      memberId: string;
      initial: { name: string; email: string; phone: string };
      onSuccess?: () => void;
      onCancel?: () => void;
    };

/**
 * The create / edit member form (T4.3). One component serves both flows: in
 * `create` mode it collects name + email (+ optional phone, initial status) and
 * calls {@link createMemberAction}; in `edit` mode the email is shown read-only
 * (it is the immutable auth identity) and it calls {@link updateMemberAction}.
 * On success it navigates to the member's detail page; the discriminated
 * {@link ActionResult} surfaces any API error inline without throwing across the
 * Server Action boundary.
 */
export function MemberForm(props: Props) {
  const t = useTranslations('admin.members');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const [name, setName] = useState(isEdit ? props.initial.name : '');
  const [email, setEmail] = useState(isEdit ? props.initial.email : '');
  const [phone, setPhone] = useState(isEdit ? props.initial.phone : '');
  const [status, setStatus] = useState<MemberStatus>('ACTIVE');

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateMemberAction(props.memberId, { name, phone })
        : await createMemberAction({ name, email, phone, status });
      if (result.ok) {
        if (props.onSuccess) {
          props.onSuccess();
          router.refresh();
        } else {
          router.push(`/members/${result.data.id}`);
          router.refresh();
        }
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/members/${props.memberId}` : '/members';

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form, props.onCancel && styles.formInDrawer)}>
      <Card variant="default" padding={4} xstyle={styles.formSection}>
        <Stack gap={4}>
          <Text type="label" weight="semibold" color="secondary" display="block">
            {t('form.contactSection')}
          </Text>
          <TextInput
            label={t('form.name')}
            htmlName="name"
            type="text"
            isRequired
            hasAutoFocus
            size="lg"
            width="100%"
            value={name}
            onChange={setName}
            startIcon={<Icon name="user" {...stylex.props(styles.sectionIcon)} />}
          />

          <TextInput
            label={t('form.email')}
            htmlName="email"
            type="email"
            isRequired={!isEdit}
            isDisabled={isEdit}
            disabledMessage={isEdit ? t('form.emailReadonlyHint') : undefined}
            description={isEdit ? t('form.emailReadonlyHint') : undefined}
            size="lg"
            width="100%"
            value={email}
            onChange={setEmail}
            startIcon={<Icon name="message" {...stylex.props(styles.sectionIcon)} />}
          />

          <TextInput
            label={t('form.phone')}
            htmlName="phone"
            type="text"
            isOptional
            size="lg"
            width="100%"
            value={phone}
            onChange={setPhone}
            startIcon={<Icon name="message" {...stylex.props(styles.sectionIcon)} />}
          />
        </Stack>
      </Card>

      {!isEdit ? (
        <Card variant="default" padding={4} xstyle={styles.formSection}>
          <Stack gap={3}>
            <Text type="label" weight="semibold" color="secondary" display="block">
              {t('form.membershipSection')}
            </Text>
            <Text type="supporting" color="secondary" display="block">
              {t('form.status')}
            </Text>
            <ToggleButton
              label={status === 'ACTIVE' ? t('form.statusActive') : t('form.statusInvited')}
              isPressed={status === 'ACTIVE'}
              onPressedChange={(isPressed) => setStatus(isPressed ? 'ACTIVE' : 'INVITED')}
              size="lg"
              icon={<Icon name="users" {...stylex.props(styles.sectionIcon)} />}
              pressedIcon={<Icon name="check" {...stylex.props(styles.sectionIcon)} />}
              xstyle={styles.statusToggle}
            />
          </Stack>
        </Card>
      ) : null}

      <div {...stylex.props(styles.footer, props.onCancel && styles.drawerFooter)}>
        {error ? (
          <Card variant="default" padding={0} xstyle={styles.errorCard}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </Card>
        ) : null}

        <div {...stylex.props(styles.actions, props.onCancel && styles.actionsInDrawer)}>
          <Btn
            type="submit"
            v="primary"
            size={props.onCancel ? 'lg' : 'md'}
            icon="plus"
            disabled={pending}
            {...(props.onCancel ? stylex.props(styles.actionButton) : {})}
          >
            {pending ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.createMember')}
          </Btn>
          {props.onCancel ? (
            <Btn
              type="button"
              v="outline"
              size="lg"
              icon="x"
              onClick={props.onCancel}
              disabled={pending}
              {...stylex.props(styles.actionButton)}
            >
              {t('form.cancel')}
            </Btn>
          ) : (
            <Link href={cancelHref} {...stylex.props(styles.cancelLink)}>
              {t('form.cancel')}
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
