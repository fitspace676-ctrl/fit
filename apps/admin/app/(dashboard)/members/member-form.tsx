'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { Gender, GymMemberIntakeSettings, MemberStatus } from '@fit/types';
import { Btn, Icon } from '@/components/ui';
import { composeName } from '@/lib/member-intake';
import {
  createMemberAction,
  listActivePlanOptionsAction,
  updateMemberAction,
  type PlanOption,
} from './actions';

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
  grid2: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(2, minmax(0, 1fr))',
    },
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
  textarea: {
    minHeight: '5rem',
    width: '100%',
    padding: '0.625rem 0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-family-body)',
    lineHeight: 1.5,
    color: 'var(--color-text-primary)',
    outline: 'none',
    resize: 'vertical',
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

/** The editable profile fields a member's create/edit form seeds from + submits. */
export interface MemberFormInitial {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalNotes: string;
  /** Comma-separated tag string (e.g. `"VIP, Corporate"`). */
  tags: string;
}

type Props =
  | {
      mode: 'create';
      intake?: GymMemberIntakeSettings;
      onSuccess?: () => void;
      onCancel?: () => void;
    }
  | {
      mode: 'edit';
      memberId: string;
      initial: MemberFormInitial;
      intake?: GymMemberIntakeSettings;
      onSuccess?: () => void;
      onCancel?: () => void;
    };

/** Split a comma-separated tag string into a clean, de-duplicated, capped array. */
function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const tag = part.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

/** A native labelled field (select / date / text) matching the form's styling. */
function LabeledField({
  label,
  htmlFor,
  optional,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div {...stylex.props(styles.fieldGroup)}>
      <label htmlFor={htmlFor} {...stylex.props(styles.label)}>
        {label}
        {optional ? <span {...stylex.props(styles.labelOptional)}> · {optional}</span> : null}
      </label>
      {children}
      {hint ? <p {...stylex.props(styles.hint)}>{hint}</p> : null}
    </div>
  );
}

/**
 * The create / edit member form (T4.3, extended T4.x). One component serves both
 * flows: `create` collects the full profile (contact, personal, emergency contact,
 * medical notes, tags) plus an optional membership plan enrolment + initial status;
 * `edit` shows the email read-only (immutable auth identity) and omits the plan /
 * status controls. On success it navigates to the member's detail page (or closes
 * the drawer). The discriminated {@link ActionResult} surfaces API errors inline.
 */
export function MemberForm(props: Props) {
  const t = useTranslations('admin.members');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const seed = isEdit ? props.initial : null;

  // In edit mode every field shows (config governs the create drawer only).
  const show = (field: keyof GymMemberIntakeSettings): boolean =>
    isEdit || props.intake?.[field] !== false;

  const [name, setName] = useState(seed?.name ?? '');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState(seed?.email ?? '');
  const [phone, setPhone] = useState(seed?.phone ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(seed?.dateOfBirth ?? '');
  const [gender, setGender] = useState(seed?.gender ?? '');
  const [address, setAddress] = useState(seed?.address ?? '');
  const [emergencyName, setEmergencyName] = useState(seed?.emergencyContactName ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(seed?.emergencyContactPhone ?? '');
  const [medicalNotes, setMedicalNotes] = useState(seed?.medicalNotes ?? '');
  const [tags, setTags] = useState(seed?.tags ?? '');
  const [status, setStatus] = useState<MemberStatus>('ACTIVE');

  // Create-only membership enrolment.
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [planId, setPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  useEffect(() => {
    if (isEdit) return;
    let active = true;
    void listActivePlanOptionsAction().then((opts) => {
      if (active) setPlanOptions(opts);
    });
    return () => {
      active = false;
    };
  }, [isEdit]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    // Shared profile fields; empty strings clear on the API (see `memberProfileShape`).
    const profile = {
      dateOfBirth,
      gender: gender ? (gender as Gender) : null,
      address,
      emergencyContactName: emergencyName,
      emergencyContactPhone: emergencyPhone,
      medicalNotes,
      tags: parseTags(tags),
    };

    startTransition(async () => {
      const composedName = composeName(name, surname);
      const result = isEdit
        ? await updateMemberAction(props.memberId, { name: composedName, phone, ...profile })
        : await createMemberAction({
            name: composedName,
            email,
            phone,
            status,
            ...profile,
            planId: planId || undefined,
            paymentMethod: paymentMethod || undefined,
          });
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
      {/* Contact + personal information. */}
      <Card variant="default" padding={4} xstyle={styles.formSection}>
        <Stack gap={4}>
          <Text type="label" weight="semibold" color="secondary" display="block">
            {t('form.contactSection')}
          </Text>
          {show('name') && (
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
          )}

          {show('surname') && !isEdit ? (
            <TextInput
              label={t('form.surname')}
              htmlName="surname"
              type="text"
              isOptional
              size="lg"
              width="100%"
              value={surname}
              onChange={setSurname}
              startIcon={<Icon name="user" {...stylex.props(styles.sectionIcon)} />}
            />
          ) : null}

          {show('email') && (
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
          )}

          {show('phone') && (
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
          )}

          {show('dateOfBirth') || show('gender') ? (
            <div {...stylex.props(styles.grid2)}>
              {show('dateOfBirth') && (
                <LabeledField
                  label={t('form.dateOfBirth')}
                  htmlFor="dateOfBirth"
                  optional={t('form.optional')}
                >
                  <input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    {...stylex.props(styles.field)}
                  />
                </LabeledField>
              )}
              {show('gender') && (
                <LabeledField
                  label={t('form.gender')}
                  htmlFor="gender"
                  optional={t('form.optional')}
                >
                  <select
                    id="gender"
                    name="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    {...stylex.props(styles.field)}
                  >
                    <option value="">{t('form.genderUnset')}</option>
                    <option value="MALE">{t('gender.MALE')}</option>
                    <option value="FEMALE">{t('gender.FEMALE')}</option>
                    <option value="OTHER">{t('gender.OTHER')}</option>
                  </select>
                </LabeledField>
              )}
            </div>
          ) : null}

          {show('address') && (
            <LabeledField label={t('form.address')} htmlFor="address" optional={t('form.optional')}>
              <input
                id="address"
                name="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                {...stylex.props(styles.field)}
              />
            </LabeledField>
          )}
        </Stack>
      </Card>

      {/* Emergency contact. */}
      {show('emergencyContact') && (
        <Card variant="default" padding={4} xstyle={styles.formSection}>
          <Stack gap={3}>
            <Text type="label" weight="semibold" color="secondary" display="block">
              {t('form.emergencySection')}
            </Text>
            <div {...stylex.props(styles.grid2)}>
              <LabeledField
                label={t('form.emergencyName')}
                htmlFor="emergencyName"
                optional={t('form.optional')}
              >
                <input
                  id="emergencyName"
                  name="emergencyName"
                  type="text"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  {...stylex.props(styles.field)}
                />
              </LabeledField>
              <LabeledField
                label={t('form.emergencyPhone')}
                htmlFor="emergencyPhone"
                optional={t('form.optional')}
              >
                <input
                  id="emergencyPhone"
                  name="emergencyPhone"
                  type="text"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  {...stylex.props(styles.field)}
                />
              </LabeledField>
            </div>
          </Stack>
        </Card>
      )}

      {/* Membership plan enrolment (create only). */}
      {!isEdit ? (
        <Card variant="default" padding={4} xstyle={styles.formSection}>
          <Stack gap={3}>
            <Text type="label" weight="semibold" color="secondary" display="block">
              {t('form.membershipSection')}
            </Text>
            {show('membershipPlan') && (
              <LabeledField label={t('form.plan')} htmlFor="planId" optional={t('form.optional')}>
                <select
                  id="planId"
                  name="planId"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  {...stylex.props(styles.field)}
                >
                  <option value="">{t('form.planNone')}</option>
                  {planOptions.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </LabeledField>
            )}
            {show('paymentMethod') && (
              <LabeledField
                label={t('form.paymentMethod')}
                htmlFor="paymentMethod"
                optional={t('form.optional')}
              >
                <select
                  id="paymentMethod"
                  name="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  {...stylex.props(styles.field)}
                >
                  <option value="">{t('form.paymentUnset')}</option>
                  <option value="CASH">{t('form.paymentCash')}</option>
                  <option value="CARD">{t('form.paymentCard')}</option>
                  <option value="BANK_TRANSFER">{t('form.paymentBankTransfer')}</option>
                </select>
              </LabeledField>
            )}

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

      {/* Medical notes + tags. */}
      {show('medicalNotes') || show('tags') ? (
        <Card variant="default" padding={4} xstyle={styles.formSection}>
          <Stack gap={3}>
            <Text type="label" weight="semibold" color="secondary" display="block">
              {t('form.medicalSection')}
            </Text>
            {show('medicalNotes') && (
              <LabeledField
                label={t('form.medicalSection')}
                htmlFor="medicalNotes"
                optional={t('form.optional')}
              >
                <textarea
                  id="medicalNotes"
                  name="medicalNotes"
                  rows={3}
                  placeholder={t('form.medicalPlaceholder')}
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                  {...stylex.props(styles.textarea)}
                />
              </LabeledField>
            )}
            {show('tags') && (
              <LabeledField
                label={t('form.tags')}
                htmlFor="tags"
                optional={t('form.optional')}
                hint={t('form.tagsHint')}
              >
                <input
                  id="tags"
                  name="tags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  {...stylex.props(styles.field)}
                />
              </LabeledField>
            )}
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
            {...stylex.props(props.onCancel && styles.actionButton)}
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
