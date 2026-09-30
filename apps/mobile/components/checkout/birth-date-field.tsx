// @fit/mobile — the date of birth, picked on the platform's own date wheel.
//
// ===========================================================================
// WHY THIS IS NO LONGER A MASKED TEXT BOX.
//
// It was one (`date-mask.ts`), and on a phone it could not be filled in. The
// box was CONTROLLED BY THE ISO STATE: every keystroke ran through
// `isoFromDayInput`, which is `''` for anything short of eight digits, and the
// box then re-rendered from that `''`. So the first digit typed vanished, and
// the second, and every one after — the field stayed empty however long the
// buyer kept typing. The render test never saw it because it pasted all eight
// digits in one `changeText`, which is the one input a person never makes.
//
// A birthday is also the date a text box is worst at: forty-odd years back,
// day-first on a number pad, with nothing saying which order is wanted. So the
// fix is not a better mask but the control each platform already ships for it:
//
//   * iOS — the wheel, in a `Sheet`, committed by "Done". Committed rather than
//     live so that scrolling past a day does not answer the question.
//   * Android — the system calendar dialog, which is modal and has its own OK.
//   * web — the typed box again, with its own text state, because
//     `@react-native-community/datetimepicker` has no web half and the web
//     build only exists for the phone preview panel.
//
// THE STATE CONTRACT IS UNCHANGED: `JoinState.dateOfBirth` is `YYYY-MM-DD` or
// `''`, and the API still receives exactly what `memberSignupSchema` checks.
// ===========================================================================

import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  Button,
  FieldLabel,
  Icon,
  Sheet,
  Text,
  TextField,
  layout,
  spacing,
  useTheme,
} from '@fit/ui-mobile';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { dayKey } from '../classes/schedule';
import { dayInputFromIso, isoFromDayInput, maskDayInput } from './date-mask';
import { dayFromIso } from './start-date';
import { useI18n } from '../../providers/I18nProvider';

/** The earliest birthday the wheel scrolls to. */
const EARLIEST = new Date(1900, 0, 1);

/** Where the wheel opens when nothing is picked yet: an adult's birthday. */
const OPEN_YEARS_BACK = 25;

/** `h-[52px]` — the same box every `TextField` on the step draws. */
const FIELD_HEIGHT = 52;

export interface BirthDateFieldProps {
  /** `YYYY-MM-DD`, or `''` while unanswered. */
  value: string;
  onChange: (iso: string) => void;
  /** Today on the device, `YYYY-MM-DD` — the latest day on offer. */
  today: string;
  label: string;
  invalid: boolean;
  disabled: boolean;
  testID: string;
}

/** The date of birth, as a field that opens the platform's date picker. */
export function BirthDateField(props: BirthDateFieldProps) {
  return Platform.OS === 'web' ? <TypedBirthDate {...props} /> : <PickedBirthDate {...props} />;
}

function PickedBirthDate({
  value,
  onChange,
  today,
  label,
  invalid,
  disabled,
  testID,
}: BirthDateFieldProps) {
  const { t, locale } = useI18n();
  const { colors, isDark } = useTheme();

  const latest = dayFromIso(today) ?? new Date();
  const chosen = dayFromIso(value);
  const opening =
    chosen ?? new Date(latest.getFullYear() - OPEN_YEARS_BACK, latest.getMonth(), latest.getDate());

  // The day the iOS wheel is on. Only "Done" copies it into the form.
  const [draft, setDraft] = useState<Date>(opening);
  const [open, setOpen] = useState(false);

  const shown = dayInputFromIso(value);
  const pickerLocale = locale === 'ka' ? 'ka-GE' : 'en-GB';

  function present(): void {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: opening,
        mode: 'date',
        maximumDate: latest,
        minimumDate: EARLIEST,
        onChange: (event, date) => {
          if (event.type === 'set' && date !== undefined) onChange(dayKey(date));
        },
      });
      return;
    }
    setDraft(opening);
    setOpen(true);
  }

  const borderColor = invalid ? colors.error : disabled ? colors.neutral : colors.border;

  return (
    <View testID={testID}>
      {/* The same `FieldLabel` every `TextField` on the step draws. */}
      <FieldLabel style={{ marginBottom: spacing[2] }}>{label}</FieldLabel>

      <Pressable
        testID={`${testID}-button`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown === '' ? t('checkout.details.calendar.open') : shown }}
        accessibilityState={{ disabled }}
        aria-invalid={invalid}
        disabled={disabled}
        onPress={present}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[2.5],
          height: FIELD_HEIGHT,
          paddingHorizontal: spacing[4],
          borderRadius: 14,
          borderWidth: layout.hairline,
          borderColor,
          backgroundColor: disabled ? colors.backgroundMuted : colors.tile,
        }}
      >
        <Icon name="calendar" size={18} color={colors.iconSecondary} />
        <Text
          variant="body"
          color={shown === '' ? 'textDisabled' : 'textPrimary'}
          style={{ flex: 1, fontWeight: '500' }}
          testID={`${testID}-value`}
        >
          {shown === '' ? t('checkout.details.calendar.open') : shown}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Sheet
          testID={`${testID}-sheet`}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          title={label}
          // TODO(i18n): no namespace-neutral "Close" — the same borrowing
          // `components/reviews/review-sheet.tsx` makes.
          closeAccessibilityLabel={t('classes.modal.close')}
          footer={
            <Button
              testID={`${testID}-done`}
              label={t('checkout.details.calendar.done')}
              icon="check"
              fullWidth
              onPress={() => {
                onChange(dayKey(draft));
                setOpen(false);
              }}
            />
          }
        >
          <View style={{ alignItems: 'center' }}>
            <DateTimePicker
              testID={`${testID}-picker`}
              value={draft}
              mode="date"
              display="spinner"
              maximumDate={latest}
              minimumDate={EARLIEST}
              locale={pickerLocale}
              themeVariant={isDark ? 'dark' : 'light'}
              textColor={colors.textPrimary}
              onChange={(_event, date) => {
                if (date !== undefined) setDraft(date);
              }}
            />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

/**
 * The web preview's typed box. Its TEXT is its own state and only a complete
 * day reaches the form — the inverse of the defect in this file's header.
 */
function TypedBirthDate({
  value,
  onChange,
  label,
  invalid,
  disabled,
  testID,
}: BirthDateFieldProps) {
  const { t } = useI18n();
  const [text, setText] = useState(() => dayInputFromIso(value));
  return (
    <TextField
      testID={testID}
      label={label}
      placeholder={t('checkout.details.fields.datePlaceholder')}
      value={text}
      invalid={invalid}
      disabled={disabled}
      keyboardType="number-pad"
      onChangeText={(next) => {
        const masked = maskDayInput(next);
        setText(masked);
        onChange(isoFromDayInput(masked));
      }}
    />
  );
}
