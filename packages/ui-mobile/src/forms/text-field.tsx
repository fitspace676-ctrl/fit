import { useState, type ReactNode } from 'react';
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { clampRadiusTo } from '../internal/clamp-radius';
import { IconButton } from './icon-button';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Eyebrow, Text } from '../primitives/text';
import type { SurfaceRadius } from '../tokens/radii';
import { layout, spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';
import { type as typeRoles } from '../tokens/typography';

// ===========================================================================
// NO MOBILE ARTBOARD CONTAINS A TEXT INPUT.
//
// ---------------------------------------------------------------------------
// All six mobile comps are signed-in screens; the five screens that actually
// collect typing — login, register, forgot, reset, verify — have never been
// drawn for a phone. So this control is derived from the WEB member login
// (`web-member-login.tsx`), which is the only post-repaint comp in the set
// that contains a field at all, and every value below is transcribed from it:
//
//   field   `h-[52px] w-full border bg-ink-950 px-4 text-[15px] font-medium
//            text-white placeholder:text-ink-600` + `CUT_MD` → radius 14
//   border  `border-ink-800`, focus `focus:border-brand-300`
//   ring    `focus:ring-2 focus:ring-brand-300/40`
//   error   `border-danger-500` + `mt-2 block text-[12px] font-medium
//            text-danger-400`
//   label   `mb-2 block text-[10px] font-semibold uppercase
//            tracking-[0.16em] text-ink-500`
//
// THIS IS A FLAG, NOT A FOOTNOTE: the five auth screens will be built against
// a control that was designed for a 1440pt browser. A 52pt field and a 14px
// radius port cleanly, but the things a phone form has and a desktop form does
// not — the keyboard's accessory bar, the return-key chain between fields, how
// far the layout scrolls when the keyboard opens — have no comp behind them
// and will be invented by whoever builds WP-10's C1 stage.
// ---------------------------------------------------------------------------
// ===========================================================================

/** `h-[52px]` — the login field, and the same height as a `lg` Button. */
const FIELD_HEIGHT = 52;

/** `focus:ring-2 ring-brand-300/40`, drawn as an outline. RN has no
 *  `box-shadow` spread, but it does have `outlineWidth` (0.76+), which sits
 *  OUTSIDE the border box and so cannot shift the layout the way a thicker
 *  border would. */
const FOCUS_RING_WIDTH = 3;

const GLYPH = 18;

export interface TextFieldProps extends Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'editable' | 'accessibilityLabel'
> {
  /**
   * The micro-label above the field, and the input's accessible name.
   * REQUIRED — rule 1, and a `TextInput` with only a placeholder is unnamed
   * for a screen reader the moment anything is typed into it.
   */
  label: string;

  /**
   * Keep {@link label} as the accessible name without drawing it. Mirrors
   * ui-kit's `labelHidden`. It is HIDDEN, not dropped: leaning on a
   * placeholder instead would leave the control unnamed, and the placeholder
   * disappears as soon as there is a value.
   */
  labelHidden?: boolean;

  /** Rule-of-the-field copy under the control. Replaced by {@link error}. */
  hint?: string;

  /**
   * The message under the field. Its presence is what draws the error border,
   * so there is no way to paint the field red without saying why.
   */
  error?: string;

  /**
   * Draw the error border with no message — for a field that is invalid
   * because of a group-level rule stated elsewhere. Kept separate from
   * {@link error} exactly as ui-kit keeps `invalid` separate from `hint`.
   */
  invalid?: boolean;

  /** Hung off the end of the label row — a "forgot password?" link. */
  action?: ReactNode;

  /** A glyph inside the field, before the text. */
  startIcon?: IconName;

  /**
   * Accessible names for the show/hide toggle. Passing them turns a
   * `secureTextEntry` field into a revealable one; the strings come from the
   * caller so they stay in the app's catalogue. Mirrors ui-kit.
   */
  revealLabels?: { show: string; hide: string };

  disabled?: boolean;

  /** Override the rung. Default `'element'` (14) — the login field's CUT_MD. */
  radius?: SurfaceRadius;

  /** Forwarded to the WRAPPER; the input itself takes `${testID}-input`. */
  testID?: string;

  /** Merged last onto the wrapper. */
  style?: StyleProp<ViewStyle>;

  /** Merged last onto the input. */
  inputStyle?: StyleProp<TextStyle>;

  /** Merged last onto the wrapper. */
  className?: string;
}

/**
 * A single-line text input, with its label, hint and error.
 *
 * The error message carries `accessibilityLiveRegion="polite"` and
 * `accessibilityRole="alert"` — both, because they are different platforms'
 * answers to the same question. Without them a validation failure is a purely
 * visual event: the field turns red, a line of text appears, and a screen
 * reader user who has already moved on hears nothing at all and cannot tell
 * why the form will not submit.
 */
export function TextField({
  label,
  labelHidden = false,
  hint,
  error,
  invalid = false,
  action,
  startIcon,
  revealLabels,
  disabled = false,
  radius = 'element',
  testID,
  style,
  inputStyle,
  className,
  onFocus,
  onBlur,
  secureTextEntry,
  multiline,
  ...rest
}: TextFieldProps) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const hasError = Boolean(error) || invalid;
  const revealable = revealLabels !== undefined && secureTextEntry === true;

  const borderColor = hasError
    ? colors.error
    : focused
      ? colors.accent
      : disabled
        ? colors.neutral
        : colors.border;

  return (
    <View testID={testID} style={[{ alignSelf: 'stretch' }, style]} className={className}>
      {labelHidden ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: spacing[3],
            marginBottom: spacing[2],
          }}
        >
          {/* The login's 10px / 600 / uppercase micro-label. `micro` is the
              scale's 10px small-caps role; it tracks at 0.10em against the
              comp's 0.16em, a difference of 0.6pt at this size, and adding an
              eleventh sans role for it would mean editing WP-1's file. */}
          <Eyebrow size="micro" color="textSecondary" accessible={false}>
            {label}
          </Eyebrow>
          {action}
        </View>
      )}

      <View
        // The field's own box gets a selector: the border colour IS the error
        // state and the focus state, so a test that cannot address the box
        // cannot assert either of them.
        testID={testID ? `${testID}-box` : undefined}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[2.5],
          paddingHorizontal: spacing[4],
          borderRadius: clampRadiusTo(radius, multiline ? undefined : FIELD_HEIGHT),
          borderWidth: layout.hairline,
          borderColor,
          // `bg-ink-950` — the page colour, punched back through whatever the
          // field sits on. That is the `tile` role exactly, and it is why a
          // field reads as recessed on an ink-900 card and as flush on the
          // ink-950 page, which is what the login comp does on both.
          backgroundColor: disabled ? colors.backgroundMuted : colors.tile,
          ...(multiline
            ? { minHeight: FIELD_HEIGHT * 2, paddingVertical: spacing[3] }
            : { height: FIELD_HEIGHT, minHeight: FIELD_HEIGHT }),
          // The focus ring. `outlineWidth` sits outside the border box, so
          // unlike a thicker border it cannot nudge the text by a point when
          // the field takes focus.
          ...(focused && !hasError
            ? { outlineWidth: FOCUS_RING_WIDTH, outlineColor: colors.focusRing }
            : {}),
        }}
      >
        {startIcon ? (
          <Icon
            name={startIcon}
            color={disabled ? colors.iconDisabled : colors.iconSecondary}
            size={GLYPH}
          />
        ) : null}

        <TextInput
          {...rest}
          testID={testID ? `${testID}-input` : undefined}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          // `aria-invalid`'s RN equivalent. Announced as "invalid data" ahead
          // of the message, which is what makes the message make sense.
          accessibilityState={{ disabled }}
          aria-invalid={hasError}
          editable={!disabled}
          multiline={multiline}
          secureTextEntry={secureTextEntry === true && !revealed}
          placeholderTextColor={colors.textDisabled}
          selectionColor={colors.accent}
          // `cursorColor` is Android's; iOS reads `selectionColor` for both.
          cursorColor={colors.accent}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            {
              flex: 1,
              minWidth: 0,
              color: disabled ? colors.textDisabled : colors.textPrimary,
              // `text-[15px] font-medium` — the scale's 15px step. It rides
              // the system sans, so `fontWeight` is the right knob here (see
              // the note in `button.tsx` for when it is not).
              fontSize: typeRoles.body.fontSize,
              lineHeight: typeRoles.body.lineHeight,
              letterSpacing: typeRoles.body.letterSpacing,
              fontWeight: '500',
              // RN gives an Android TextInput 4pt of built-in padding and a
              // vertical centring the comp does not have. Zeroing it is what
              // makes the two platforms' 52pt fields look like one control.
              paddingVertical: 0,
              paddingHorizontal: 0,
              ...(multiline ? { textAlignVertical: 'top' as const } : {}),
            },
            inputStyle,
          ]}
        />

        {revealable ? (
          <IconButton
            icon={revealed ? 'eyeOff' : 'eye'}
            accessibilityLabel={revealed ? revealLabels.hide : revealLabels.show}
            onPress={() => {
              setRevealed((previous) => !previous);
            }}
            variant="ghost"
            testID={testID ? `${testID}-reveal` : undefined}
          />
        ) : null}
      </View>

      {error ? (
        <Text
          variant="caption"
          color="error"
          testID={testID ? `${testID}-error` : undefined}
          // Both, deliberately: `accessibilityLiveRegion` is Android's API and
          // `accessibilityRole="alert"` is what iOS honours. Neither one alone
          // announces a validation failure on both platforms.
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{ marginTop: spacing[2], fontWeight: '500' }}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textSecondary" style={{ marginTop: spacing[2] }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
