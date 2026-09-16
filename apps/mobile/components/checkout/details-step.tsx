// @fit/mobile — step 3: who this membership is for.
//
// ===========================================================================
// THE FIELD LIST IS THE GYM'S, NOT THIS FILE'S.
//
// `GymMemberIntakeSettings` travels on `GET /catalogue` precisely because the
// visitor filling this form has no session and no other way to be told which
// fields their gym asks for. A gym that wants a phone and a national id on file
// from day one switches them on under Settings → Membership; a gym that wants a
// two-field door does not. `requiredIntakeFields` is the single statement of
// "on means required" that the staff console, `POST /members` and
// `POST /auth/signup` all answer to — so a hard-coded list here would make the
// join funnel the one member-create in the product that ignores the gym's own
// settings, which is exactly the defect `memberSignupSchemaFor` was introduced
// to fix on web.
//
// So: `FIELDS` below is a DESCRIPTOR TABLE, filtered by `asksFor`, and the
// return-key chain is wired from whatever survives the filter rather than from
// a fixed sequence of refs. Turning a toggle off removes a field and re-links
// the chain around it with no edit here.
// ===========================================================================
//
// TWO DEPARTURES FROM WEB, BOTH DELIBERATE:
//
//   1. **The two groups are used.** `checkout.details.groups.about` and
//      `.groups.account` are authored in both locales and web reads neither —
//      it has a two-column grid where the shape does the grouping. One column
//      on a phone has no such shape, so nine fields in a row read as a wall.
//      The login pair goes LAST: "You will use these to sign in to the member
//      portal" is the commitment, and it belongs at the end of the form rather
//      than in the middle of the profile questions.
//   2. **`emailTaken` is shown where it fires.** On web the banner renders
//      inside a `hidden` step-2 section while submit only ever runs at step 3,
//      so after a real 409 the buyer sits on the payment step with a re-enabled
//      button and no message at all. This funnel renders one step at a time and
//      returns to this one, so the sentence is on screen when it is true.

import { Alert as Advisory, Button, Chip, SectionHeader, Text, spacing } from '@fit/ui-mobile';
import type { Gender, MemberIntakeField } from '@fit/types';
import { useRef } from 'react';
import { View, type TextInput } from 'react-native';

import { AuthField } from '../auth/field';
import { dayInputFromIso, isoFromDayInput, maskDayInput } from './date-mask';
import {
  asksFor,
  missingDetailFields,
  passwordAccepted,
  startDateAccepted,
  type DetailsContext,
  type JoinAction,
  type JoinState,
  type JoinTextField,
} from './join-state';
import { StartDateField } from './start-date-field';
import { startDateHintKey } from './start-date';
import type { MessageKey } from '../../lib/i18n/keys';
import { useI18n } from '../../providers/I18nProvider';

/** The three answers `genderSchema` accepts, in the order web lists them. */
const GENDERS = ['FEMALE', 'MALE', 'OTHER'] as const satisfies readonly Gender[];

/** One text input, and everything that decides whether it is drawn. */
interface FieldSpec {
  readonly key: JoinTextField;
  /** The intake toggle that shows it, or `null` for a field always shown. */
  readonly toggle: MemberIntakeField | null;
  /** The `MemberIntakeField` its validation error is reported against. */
  readonly reportsAs: MemberIntakeField;
  readonly labelKey: MessageKey;
  readonly hintKey?: MessageKey;
  /** Which group it sits in. */
  readonly group: 'about' | 'account';
  /** A `dd.mm.yyyy` masked entry rather than free text. */
  readonly date?: true;
  readonly keyboard?: 'email-address' | 'phone-pad' | 'number-pad';
  readonly autoComplete?:
    | 'given-name'
    | 'family-name'
    | 'email'
    | 'new-password'
    | 'tel'
    | 'birthdate-full';
  readonly textContentType?:
    | 'givenName'
    | 'familyName'
    | 'emailAddress'
    | 'newPassword'
    | 'telephoneNumber';
  readonly secure?: true;
}

/**
 * Every TEXT field the form can draw, in render order.
 *
 * `startDate` is not among them any more. It is the only field on the step that
 * asks a QUESTION rather than records a fact, and it is now answered on a week
 * strip (`start-date-field.tsx`) rather than typed — so it is neither a
 * `FieldSpec` nor a link in the return-key chain, and it is drawn FIRST inside
 * the `about` group, which is where web puts it and why: burying a decision
 * under six data-entry boxes is how it gets answered by accident.
 */
const FIELDS: readonly FieldSpec[] = [
  {
    key: 'firstName',
    toggle: null,
    reportsAs: 'name',
    labelKey: 'checkout.details.fields.firstName',
    group: 'about',
    autoComplete: 'given-name',
    textContentType: 'givenName',
  },
  {
    key: 'lastName',
    // Shown when the gym splits the name, but NEVER enforced: the form joins
    // it onto `name` before the request, so `missingSignupIntakeFields` marks
    // `surname` satisfied unconditionally. Carried over from web rather than
    // diverged from — a mobile-only stricter rule would reject bodies the API
    // accepts. Flagged in the C4b report.
    toggle: 'surname',
    reportsAs: 'name',
    labelKey: 'checkout.details.fields.lastName',
    group: 'about',
    autoComplete: 'family-name',
    textContentType: 'familyName',
  },
  {
    key: 'phone',
    toggle: 'phone',
    reportsAs: 'phone',
    labelKey: 'checkout.details.fields.phone',
    group: 'about',
    keyboard: 'phone-pad',
    autoComplete: 'tel',
    textContentType: 'telephoneNumber',
  },
  {
    key: 'dateOfBirth',
    toggle: 'dateOfBirth',
    reportsAs: 'dateOfBirth',
    labelKey: 'checkout.details.fields.dateOfBirth',
    group: 'about',
    date: true,
    keyboard: 'number-pad',
    autoComplete: 'birthdate-full',
  },
  {
    key: 'personalId',
    toggle: 'personalId',
    reportsAs: 'personalId',
    labelKey: 'checkout.details.fields.personalId',
    hintKey: 'checkout.details.fields.personalIdHint',
    group: 'about',
  },
  {
    key: 'email',
    toggle: null,
    reportsAs: 'email',
    labelKey: 'checkout.details.fields.email',
    group: 'account',
    keyboard: 'email-address',
    autoComplete: 'email',
    textContentType: 'emailAddress',
  },
  {
    key: 'password',
    toggle: null,
    reportsAs: 'email',
    labelKey: 'checkout.details.fields.password',
    hintKey: 'checkout.details.fields.passwordHint',
    group: 'account',
    secure: true,
    // `new-password` / `newPassword`, not `password`: this is what makes iOS
    // offer to GENERATE and save a strong one and Android offer to store it,
    // rather than both offering to fill an existing entry.
    autoComplete: 'new-password',
    textContentType: 'newPassword',
  },
];

export interface DetailsStepProps {
  state: JoinState;
  dispatch: (action: JoinAction) => void;
  context: DetailsContext;
  /**
   * Paint the invalid fields.
   *
   * Off until the buyer has actually tried to move on. A form that turns red as
   * the first character is typed is a form that calls every answer wrong before
   * it has been given.
   */
  showErrors: boolean;
  /** The `409 EMAIL_TAKEN` branch — an offer, not a failure. */
  emailTaken: boolean;
  /** Take the buyer to sign-in with the address they typed. */
  onSignIn: () => void;
  /** A request is in flight; every control is frozen but nothing is hidden. */
  disabled: boolean;
  /**
   * The keychain read has not resolved yet, so it is not yet known whether this
   * buyer already has an account.
   *
   * Drawing the guest form during hydration and swapping it for "you're signed
   * in" a frame later is the same class of flash `SessionStatus.hydrating`
   * exists to prevent at the route level.
   */
  sessionPending: boolean;
  testID: string;
}

/** Step 3 — the profile the gym asked for, and the account to hang it on. */
export function DetailsStep({
  state,
  dispatch,
  context,
  showErrors,
  emailTaken,
  onSignIn,
  disabled,
  sessionPending,
  testID,
}: DetailsStepProps) {
  const { t } = useI18n();
  const refs = useRef<Partial<Record<JoinTextField, TextInput | null>>>({});

  if (sessionPending) {
    return (
      <Advisory
        testID={`${testID}-session-pending`}
        tone="info"
        icon="clock"
        title={t('checkout.details.loading')}
      />
    );
  }

  // A signed-in buyer has already answered all of this. Re-asking for a name
  // and a password would be asking them to create a second account.
  if (context.signedIn) {
    return (
      <Advisory
        testID={`${testID}-signed-in`}
        tone="success"
        icon="check"
        title={t('checkout.details.signedIn')}
      />
    );
  }

  const shown = FIELDS.filter(
    (field) => field.toggle === null || asksFor(context.intake, field.toggle),
  );
  const missing = missingDetailFields(state, context);
  const policy = context.startDatePolicy;

  const showStartDate = asksFor(context.intake, 'startDate');

  /** Is this field's value one the API would refuse? */
  function invalid(field: FieldSpec): boolean {
    if (!showErrors) return false;
    if (field.key === 'password') return !passwordAccepted(state);
    if (field.key === 'lastName') return false;
    return missing.includes(field.reportsAs);
  }

  function hintFor(field: FieldSpec): string | undefined {
    return field.hintKey === undefined ? undefined : t(field.hintKey);
  }

  function valueOf(field: FieldSpec): string {
    return field.date === true ? dayInputFromIso(state[field.key]) : state[field.key];
  }

  function onChange(field: FieldSpec, next: string): void {
    dispatch({
      type: 'text',
      field: field.key,
      // A date's STATE is always ISO; the mask is only what the buyer sees.
      // An incomplete entry stores `''`, which `signupBodyFor` then omits —
      // an unanswered optional field must be absent, never half-typed.
      value: field.date === true ? isoFromDayInput(maskDayInput(next)) : next,
    });
  }

  const groups = [
    {
      id: 'about' as const,
      titleKey: 'checkout.details.groups.about.title' as MessageKey,
      hintKey: 'checkout.details.groups.about.hint' as MessageKey,
    },
    {
      id: 'account' as const,
      titleKey: 'checkout.details.groups.account.title' as MessageKey,
      hintKey: 'checkout.details.groups.account.hint' as MessageKey,
    },
  ];

  return (
    <View style={{ gap: spacing[5] }} testID={testID}>
      <Text variant="bodySmall" color="textSecondary" testID={`${testID}-subtitle`}>
        {t('checkout.details.guestSubtitle')}
      </Text>

      {emailTaken ? (
        <Advisory
          testID={`${testID}-email-taken`}
          tone="danger"
          icon="info"
          // `live`: this is the direct result of pressing Pay, and a buyer who
          // has just pressed a button and heard nothing has no way to know why.
          live
          title={t('checkout.details.emailTaken')}
        >
          <Button
            testID={`${testID}-sign-in`}
            variant="secondary"
            size="sm"
            label={t('checkout.details.emailTakenAction')}
            onPress={onSignIn}
          />
        </Advisory>
      ) : null}

      {groups.map((group) => {
        const fields = shown.filter((field) => field.group === group.id);
        const showGender = group.id === 'about' && asksFor(context.intake, 'gender');
        const startDateHere = group.id === 'about' && showStartDate;
        if (fields.length === 0 && !showGender && !startDateHere) return null;

        return (
          <View key={group.id} style={{ gap: spacing[4] }}>
            <SectionHeader
              testID={`${testID}-group-${group.id}`}
              title={t(group.titleKey)}
              subtitle={t(group.hintKey)}
            />

            {startDateHere ? (
              <StartDateField
                testID={`${testID}-startDate`}
                label={t('checkout.details.fields.startDate')}
                // The window said out loud, built from the gym's own number
                // rather than written into the catalogue — so widening a
                // fortnight to a month updates the sentence with no copy change.
                hint={
                  policy === null
                    ? undefined
                    : t(startDateHintKey(policy), { days: policy.maxDaysAhead })
                }
                value={state.startDate}
                onChange={(iso) => {
                  dispatch({ type: 'text', field: 'startDate', value: iso });
                }}
                policy={policy}
                today={context.today}
                invalid={showErrors && !startDateAccepted(state, context)}
                disabled={disabled}
              />
            ) : null}

            {fields.map((field) => {
              const index = shown.indexOf(field);
              const next = shown[index + 1];
              const isLast = next === undefined;
              return (
                <AuthField
                  key={field.key}
                  ref={(node: TextInput | null) => {
                    refs.current[field.key] = node;
                  }}
                  testID={`${testID}-${field.key}`}
                  // A gym that does not split the name gets ONE box, and
                  // labelling that box "First name" would be asking for half a
                  // name. `checkout.details.fields.name` is "Full name", which
                  // is what the single box actually collects.
                  label={
                    field.key === 'firstName' && !asksFor(context.intake, 'surname')
                      ? t('checkout.details.fields.name')
                      : t(field.labelKey)
                  }
                  placeholder={
                    field.date === true ? t('checkout.details.fields.datePlaceholder') : undefined
                  }
                  hint={hintFor(field)}
                  value={valueOf(field)}
                  onChangeText={(text: string) => {
                    onChange(field, text);
                  }}
                  invalid={invalid(field)}
                  disabled={disabled}
                  secureTextEntry={field.secure}
                  revealLabels={
                    field.secure === true
                      ? { show: t('auth.showPassword'), hide: t('auth.hidePassword') }
                      : undefined
                  }
                  keyboardType={field.keyboard}
                  autoCapitalize={
                    field.key === 'firstName' || field.key === 'lastName' ? 'words' : 'none'
                  }
                  autoCorrect={false}
                  autoComplete={field.autoComplete}
                  textContentType={field.textContentType}
                  // Decision 4 of `components/auth/auth-screen.tsx`, applied to
                  // a list that is not fixed: `submitBehavior="submit"` is what
                  // KEEPS THE KEYBOARD UP across the hop. The default blurs
                  // first, so it collapses and reopens between two adjacent
                  // fields — and on Android that re-runs the layout twice.
                  returnKeyType={isLast ? 'done' : 'next'}
                  submitBehavior={isLast ? undefined : 'submit'}
                  onSubmitEditing={() => {
                    if (next !== undefined) refs.current[next.key]?.focus();
                  }}
                />
              );
            })}

            {showGender ? (
              <View style={{ gap: spacing[2] }} testID={`${testID}-gender`}>
                <Text variant="caption" color="textSecondary">
                  {t('checkout.details.fields.gender')}
                </Text>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('checkout.details.fields.gender')}
                >
                  {GENDERS.map((value) => (
                    <Chip
                      key={value}
                      testID={`${testID}-gender-${value.toLowerCase()}`}
                      label={t(`checkout.details.gender.${value.toLowerCase()}` as MessageKey)}
                      selected={state.gender === value}
                      disabled={disabled}
                      onPress={() => {
                        dispatch({ type: 'gender', gender: value });
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      {showErrors &&
      (missing.length > 0 || !passwordAccepted(state) || !startDateAccepted(state, context)) ? (
        <Advisory
          testID={`${testID}-invalid`}
          tone="danger"
          icon="info"
          live
          title={t('checkout.details.invalid')}
        />
      ) : null}
    </View>
  );
}
