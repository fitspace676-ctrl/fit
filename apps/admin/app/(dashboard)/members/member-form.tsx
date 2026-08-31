'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { requiredIntakeFields } from '@fit/types';
import type { Gender, GymMemberIntakeSettings, MemberIntakeField, MemberStatus } from '@fit/types';
import { Button, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useActiveLocation } from '@/components/active-location';
import { composeName, type StartDateWindow } from '@/lib/member-intake';
import {
  createMemberAction,
  listActivePlanOptionsAction,
  updateMemberAction,
  type CreatedMember,
  type PlanOption,
} from './actions';

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
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

/**
 * The `form.*` message key each intake toggle is named by when a submit is blocked
 * for leaving it blank. Mostly the field's own label; `emergencyContact` and
 * `medicalNotes` are one toggle over a whole section, so they borrow the section
 * heading rather than naming one of their two inputs.
 */
const INTAKE_FIELD_LABEL: Record<MemberIntakeField, string> = {
  name: 'name',
  surname: 'surname',
  email: 'email',
  phone: 'phone',
  gender: 'gender',
  dateOfBirth: 'dateOfBirth',
  startDate: 'startDate',
  personalId: 'personalId',
  address: 'address',
  emergencyContact: 'emergencySection',
  membershipPlan: 'plan',
  paymentMethod: 'paymentMethod',
  medicalNotes: 'medicalSection',
};

/** The editable profile fields a member's create/edit form seeds from + submits. */
export interface MemberFormInitial {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  /** `YYYY-MM-DD`, or `''` for a membership recorded before the field existed. */
  startDate: string;
  personalId: string;
  gender: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalNotes: string;
  /**
   * The member's current home branch, by NAME — `null` for one recorded before
   * branches existed.
   *
   * The name and not the id because the name is all `GET /members/:id` returns
   * (`MemberRow.locationName`), and it is only ever printed: it labels the branch
   * select's "leave this alone" option. The edit form therefore never pre-selects
   * a branch, which is the safe shape — an unrecognised or deactivated branch
   * simply leaves the option unselected and the field is omitted from the PATCH
   * rather than silently transferring the member somewhere.
   */
  locationName: string | null;
}

type Props =
  | {
      mode: 'create';
      intake?: GymMemberIntakeSettings;
      /**
       * Bounds for the start-date picker, when `intake.startDate` is on — the
       * gym's `startDatePolicy` already resolved against today in the gym's own
       * time zone (see `gymStartDateWindow`). Omitted by a caller that has no
       * settings to derive it from, in which case the input is unbounded and the
       * API's own validator is the only check — the same position every field was
       * in before the policy existed.
       */
      startDateWindow?: StartDateWindow;
      /**
       * Show the membership-plan / payment-method / status block. Defaults to on.
       * The POS drawer passes `false`: at the till the enrolment *is* the cart, so
       * offering it here would invite charging the member twice. Structural rather
       * than configurable, hence a prop and not a `memberIntake` toggle.
       */
      enrolment?: boolean;
      /** Overrides the submit button's label (the till says "Create & attach"). */
      submitLabel?: string;
      onSuccess?: (member: CreatedMember) => void;
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
 * medical notes) plus an optional membership plan enrolment + initial status;
 * `edit` shows the email read-only (immutable auth identity) and omits the plan /
 * status controls. On success it navigates to the member's detail page (or closes
 * the drawer). The discriminated {@link ActionResult} surfaces API errors inline.
 */
export function MemberForm(props: Props) {
  const t = useTranslations('admin.members');
  const tCommon = useTranslations('admin.common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const seed = isEdit ? props.initial : null;

  // Enrolment is a create-only block, and the till opts out of it entirely.
  const enrolment = props.mode === 'create' ? props.enrolment !== false : false;
  const submitLabel = props.mode === 'create' ? props.submitLabel : undefined;
  const startDateWindow = props.mode === 'create' ? props.startDateWindow : undefined;

  // In edit mode every field shows (config governs the create drawer only).
  const show = (field: keyof GymMemberIntakeSettings): boolean =>
    isEdit || props.intake?.[field] !== false;

  /**
   * The fields this gym switched on, which are therefore mandatory — a toggle in
   * Settings → Membership means "ask for this", not "offer a box staff may ignore".
   *
   * Create only. An edit must stay saveable for someone enrolled back when the
   * field was off: their address is genuinely blank, and refusing to save an
   * unrelated phone-number correction until a staffer invents one would punish the
   * gym for having changed its own setting.
   */
  const requiredSet = useMemo(
    () =>
      new Set<MemberIntakeField>(isEdit || !props.intake ? [] : requiredIntakeFields(props.intake)),
    [isEdit, props.intake],
  );
  const required = (field: MemberIntakeField): boolean => requiredSet.has(field);
  /** The "· Optional" label suffix, dropped once a field is mandatory. */
  const optionalLabel = (field: MemberIntakeField): string | undefined =>
    required(field) ? undefined : t('form.optional');

  const [name, setName] = useState(seed?.name ?? '');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState(seed?.email ?? '');
  const [phone, setPhone] = useState(seed?.phone ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(seed?.dateOfBirth ?? '');
  const [startDate, setStartDate] = useState(seed?.startDate ?? '');
  const [personalId, setPersonalId] = useState(seed?.personalId ?? '');
  const [gender, setGender] = useState(seed?.gender ?? '');
  const [address, setAddress] = useState(seed?.address ?? '');
  const [emergencyName, setEmergencyName] = useState(seed?.emergencyContactName ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(seed?.emergencyContactPhone ?? '');
  const [medicalNotes, setMedicalNotes] = useState(seed?.medicalNotes ?? '');
  const [status, setStatus] = useState<MemberStatus>('ACTIVE');

  /**
   * The member's HOME branch (`GymMember.locationId`) — not the staff
   * work-assignment array, and not the till's "Selling at" branch.
   *
   * SEEDED FROM THE SWITCHER ON CREATE, NEVER ON EDIT. Someone who has scoped the
   * console to Riverside is enrolling at Riverside, so pre-filling it there saves
   * a click and stops walk-ins piling up at whichever branch the API would have
   * defaulted to. Doing the same on edit would be the opposite of helpful: opening
   * a Downtown member's profile while scoped to Riverside would silently propose
   * transferring them, and a staffer correcting a phone number would carry the
   * transfer through with the save. So edit starts empty — `''` omits the field
   * from the PATCH entirely (see `updateMemberSchema.locationId`, which is
   * optional and deliberately not nullable) and the member stays where they are.
   *
   * In "All locations" mode create ALSO starts empty, and the API's default-branch
   * fallback (`Location.isDefault`) decides. Guessing here — first branch, or
   * alphabetically first — would look like a considered choice while being an
   * arbitrary one, and the API is the only party that knows which branch is the
   * gym's default.
   *
   * Seed, not sync: this is `useState`'s initial value, so moving the top-bar
   * switcher mid-form never overwrites a branch the operator has already picked.
   */
  const { locationId: activeLocationId, locations } = useActiveLocation();
  const [locationId, setLocationId] = useState(isEdit ? '' : (activeLocationId ?? ''));

  // Create-only membership enrolment.
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [planId, setPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  useEffect(() => {
    // No enrolment block, no plan picker to populate — skip the round trip.
    if (!enrolment) return;
    let active = true;
    void listActivePlanOptionsAction().then((opts) => {
      if (active) setPlanOptions(opts);
    });
    return () => {
      active = false;
    };
  }, [enrolment]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    // The API enforces the same policy (`MEMBER_INTAKE_REQUIRED`), so this is not
    // the guard — it is the courtesy: one message naming every missing field beats
    // a round trip that reports them one at a time. Needed in JS rather than left
    // to the browser because the Astryx `TextInput` renders `aria-required` without
    // the native `required` attribute, so `phone` and `surname` would sail through.
    const filled = (value: string): boolean => value.trim().length > 0;
    const supplied: Record<MemberIntakeField, boolean> = {
      name: filled(name),
      surname: filled(surname),
      email: filled(email),
      phone: filled(phone),
      gender: filled(gender),
      dateOfBirth: filled(dateOfBirth),
      startDate: filled(startDate),
      personalId: filled(personalId),
      address: filled(address),
      emergencyContact: filled(emergencyName) && filled(emergencyPhone),
      membershipPlan: filled(planId),
      paymentMethod: filled(paymentMethod),
      medicalNotes: filled(medicalNotes),
    };
    const missing = [...requiredSet].filter((field) => !supplied[field]);
    if (missing.length > 0) {
      setError(
        t('form.requiredMissing', {
          fields: missing.map((field) => t(`form.${INTAKE_FIELD_LABEL[field]}`)).join(', '),
        }),
      );
      return;
    }

    // Shared profile fields; empty strings clear on the API (see `memberProfileShape`).
    const profile = {
      dateOfBirth,
      // Sent on every save, empty included: `editableText` turns `''` into `null`,
      // which is what lets a start date be *removed* as well as corrected. Omitting
      // it when blank would make the field one-way — settable, never clearable.
      startDate,
      personalId,
      gender: gender ? (gender as Gender) : null,
      address,
      emergencyContactName: emergencyName,
      emergencyContactPhone: emergencyPhone,
      medicalNotes,
    };

    startTransition(async () => {
      const composedName = composeName(name, surname);

      // The two modes are split rather than shared because only `create` has a
      // member to hand back — `onSuccess` is typed differently on each branch.
      if (props.mode === 'edit') {
        const result = await updateMemberAction(props.memberId, {
          name: composedName,
          phone,
          ...profile,
          // Omitted unless the operator actually picked a branch — an absent
          // `locationId` leaves the member's current branch untouched, which is
          // what every save that is not a transfer wants.
          locationId: locationId || undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (props.onSuccess) {
          props.onSuccess();
          router.refresh();
        } else {
          router.push(`/members/${result.data.id}`);
          router.refresh();
        }
        return;
      }

      const result = await createMemberAction({
        name: composedName,
        email,
        phone,
        status,
        ...profile,
        // Both are '' whenever the enrolment block is hidden, so the till never
        // silently enrols anyone in a plan its operator could not see.
        planId: planId || undefined,
        paymentMethod: paymentMethod || undefined,
        // '' in "All locations" mode, where the API picks the gym's default branch.
        locationId: locationId || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (props.onSuccess) {
        props.onSuccess(result.data);
        router.refresh();
      } else {
        router.push(`/members/${result.data.id}`);
        router.refresh();
      }
    });
  }

  const cancelHref = isEdit ? `/members/${props.memberId}` : '/members';

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form, props.onCancel && styles.formInDrawer)}>
      {/* Contact + personal information. */}
      <Card padding="sm" xstyle={styles.formSection}>
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
              isRequired={required('surname')}
              isOptional={!required('surname')}
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
              isRequired={required('phone')}
              isOptional={!required('phone')}
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
                  optional={optionalLabel('dateOfBirth')}
                >
                  <input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    required={required('dateOfBirth')}
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
                  optional={optionalLabel('gender')}
                >
                  <select
                    id="gender"
                    name="gender"
                    required={required('gender')}
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

          {/*
            When the membership begins.

            Deliberately NOT inside the enrolment block below: the POS till hides
            that block entirely (at the till the enrolment is the cart), and a
            field the gym's settings have made required but the operator cannot
            see would make registering a walk-in impossible. On create it asks a
            question about the membership rather than recording a fact about the
            person, which is why the intake toggle defaults off.

            EDITABLE, not create-only. A date typed at a busy front desk is
            exactly the field that gets mistyped, and a profile that shows a wrong
            date with no way to fix it is worse than one that never recorded it.
            Clearing the box clears the column — see the `profile` payload above.

            `min`/`max` ARE NOT APPLIED IN EDIT MODE, and that is deliberate:
            `startDatePolicy` bounds what a signed-out visitor may pick in the join
            wizard, and the API does not enforce it on the staff endpoints at all.
            Bounding the picker here would re-impose a limit the server no longer
            applies and would block the one case this field exists to serve —
            correcting a date that has already passed. `startDateWindow` is
            `undefined` on the edit branch by construction; please leave it that
            way. On create it is the gym's window resolved against today in the
            GYM's zone (see `gymStartDateWindow`), which spares the desk a rejected
            save on a date the join wizard would have refused anyway.
          */}
          {show('startDate') ? (
            <LabeledField
              label={t('form.startDate')}
              htmlFor="startDate"
              optional={optionalLabel('startDate')}
              hint={t('form.startDateHint')}
            >
              <input
                id="startDate"
                name="startDate"
                type="date"
                required={required('startDate')}
                min={startDateWindow?.min}
                max={startDateWindow?.max}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                {...stylex.props(styles.field)}
              />
            </LabeledField>
          ) : null}

          {/*
            National id. Whether the desk may skip it is the gym's call, not this
            form's: a gym that leaves the toggle on is saying it wants the document
            recorded at signup, while one that expects members to arrive without it
            switches the field off rather than collecting blanks.
          */}
          {show('personalId') && (
            <LabeledField
              label={t('form.personalId')}
              htmlFor="personalId"
              optional={optionalLabel('personalId')}
            >
              <input
                id="personalId"
                name="personalId"
                type="text"
                required={required('personalId')}
                value={personalId}
                onChange={(e) => setPersonalId(e.target.value)}
                {...stylex.props(styles.field)}
              />
            </LabeledField>
          )}

          {show('address') && (
            <LabeledField
              label={t('form.address')}
              htmlFor="address"
              optional={optionalLabel('address')}
            >
              <input
                id="address"
                name="address"
                type="text"
                required={required('address')}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                {...stylex.props(styles.field)}
              />
            </LabeledField>
          )}

          {/*
            Home branch. NOT behind an intake toggle: `memberIntake` governs what
            the gym asks the *person* for, and which branch a membership belongs to
            is an operational fact the desk records, not a question the member
            answers. A gym could no more switch it off than it could switch off the
            member's id.

            Hidden entirely for a gym with no branches on file, the same guard the
            till's "Selling at" select uses — a select with nothing in it is worse
            than no select.
          */}
          {locations.length > 0 ? (
            <LabeledField
              label={tCommon('locationLabel')}
              htmlFor="locationId"
              // "Optional" only where there is actually something to leave blank.
              // On create with a branch already active in the chrome the field is
              // pre-filled and has no empty option, so the suffix would describe a
              // choice the select does not offer.
              optional={isEdit || !activeLocationId ? t('form.optional') : undefined}
            >
              <select
                id="locationId"
                name="locationId"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                {...stylex.props(styles.field)}
              >
                {/*
                  The "no choice" option, whose meaning differs by mode and whose
                  label says so: on edit it is "keep them where they are" — worded
                  around the branch they are at rather than repeating its bare name,
                  which would put two identical-looking entries in one list; on
                  create it is "let the API use the gym's default branch". Both are
                  the empty string, which drops `locationId` from the payload.

                  On create with a branch already selected in the chrome there is
                  no such option at all — the field is pre-filled with that branch,
                  and offering "gym default" beside it would invite a choice that
                  quietly means "somewhere else".
                */}
                {isEdit ? (
                  <option value="">
                    {seed?.locationName
                      ? t('form.locationKeep', { branch: seed.locationName })
                      : t('form.locationUnassigned')}
                  </option>
                ) : null}
                {!isEdit && !activeLocationId ? (
                  <option value="">{t('form.locationDefault')}</option>
                ) : null}
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </LabeledField>
          ) : null}
        </Stack>
      </Card>

      {/* Emergency contact. */}
      {show('emergencyContact') && (
        <Card padding="sm" xstyle={styles.formSection}>
          <Stack gap={3}>
            <Text type="label" weight="semibold" color="secondary" display="block">
              {t('form.emergencySection')}
            </Text>
            <div {...stylex.props(styles.grid2)}>
              {/* One toggle over both inputs — a next of kin with no number is
                  not a next of kin, so neither half stands alone. */}
              <LabeledField
                label={t('form.emergencyName')}
                htmlFor="emergencyName"
                optional={optionalLabel('emergencyContact')}
              >
                <input
                  id="emergencyName"
                  name="emergencyName"
                  type="text"
                  required={required('emergencyContact')}
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  {...stylex.props(styles.field)}
                />
              </LabeledField>
              <LabeledField
                label={t('form.emergencyPhone')}
                htmlFor="emergencyPhone"
                optional={optionalLabel('emergencyContact')}
              >
                <input
                  id="emergencyPhone"
                  name="emergencyPhone"
                  type="text"
                  required={required('emergencyContact')}
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  {...stylex.props(styles.field)}
                />
              </LabeledField>
            </div>
          </Stack>
        </Card>
      )}

      {/* Membership plan enrolment (create only, and never at the till). */}
      {enrolment ? (
        <Card padding="sm" xstyle={styles.formSection}>
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

      {/* Medical notes. */}
      {show('medicalNotes') ? (
        <Card padding="sm" xstyle={styles.formSection}>
          <Stack gap={3}>
            <Text type="label" weight="semibold" color="secondary" display="block">
              {t('form.medicalSection')}
            </Text>
            {show('medicalNotes') && (
              <LabeledField
                label={t('form.medicalSection')}
                htmlFor="medicalNotes"
                optional={optionalLabel('medicalNotes')}
              >
                <textarea
                  id="medicalNotes"
                  name="medicalNotes"
                  rows={3}
                  required={required('medicalNotes')}
                  placeholder={t('form.medicalPlaceholder')}
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                  {...stylex.props(styles.textarea)}
                />
              </LabeledField>
            )}
          </Stack>
        </Card>
      ) : null}

      <div {...stylex.props(styles.footer, props.onCancel && styles.drawerFooter)}>
        {error ? (
          <Card padding="none" xstyle={styles.errorCard}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </Card>
        ) : null}

        <div {...stylex.props(styles.actions, props.onCancel && styles.actionsInDrawer)}>
          <Button
            type="submit"
            variant="primary"
            // `page` in a drawer, where this is the one action the sheet exists
            // to collect; `block` on the standalone page, where the form already
            // fills the screen and a 48px control would shout.
            size={props.onCancel ? 'page' : 'block'}
            icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
            loading={pending}
            xstyle={props.onCancel ? styles.actionButton : undefined}
            label={
              pending
                ? t('form.saving')
                : (submitLabel ?? (isEdit ? t('form.saveChanges') : t('form.createMember')))
            }
          />
          {props.onCancel ? (
            <Button
              type="button"
              variant="secondary"
              size="page"
              icon={<Icon name="x" {...stylex.props(styles.kitGlyph)} />}
              onClick={props.onCancel}
              disabled={pending}
              xstyle={styles.actionButton}
              label={t('form.cancel')}
            />
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
