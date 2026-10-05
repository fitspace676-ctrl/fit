// @fit/mobile — the frame all five auth screens share.
//
// ===========================================================================
// NO MOBILE ARTBOARD EXISTS FOR ANY OF THESE FIVE SCREENS.
//
// All six mobile comps are signed-in screens. `TextField` was already
// transcribed from the WEB member login (`web-member-login.tsx`) and its header
// flags the gap this file inherits: the keyboard's accessory bar, the return-key
// chain between fields, and how far the layout scrolls when the keyboard opens
// have no comp behind them and are invented here. Each decision is written down
// where it is made, not summarised, so a later edit that "looks equivalent" has
// to argue with the reason rather than only with the value.
//
// DECISION 1 — `Screen` handles the scroll, and `reserveTabBar={false}`.
//   The auth stack has no floating capsule under it, so reserving 128pt of
//   bottom clearance would leave a band of dead canvas below the submit button
//   on every one of these screens.
//
// DECISION 2 — `keyboardShouldPersistTaps="handled"` comes free, and is the
//   single most important behaviour on the screen. `Screen`'s `ScrollView` sets
//   it. Without it a `ScrollView` defaults to `"never"`: while the keyboard is
//   up, a touch inside is consumed by dismissing it and the button under the
//   finger never fires. The user presses "Sign in", the keyboard closes, nothing
//   happens, they press again — indistinguishable from a slow network, and it
//   reads as the app being broken. This file does NOT re-implement scrolling,
//   precisely so that behaviour cannot be lost.
//
// DECISION 3 — NO `InputAccessoryView`. It was considered and rejected.
//   `InputAccessoryView` is iOS-only, so a Next/Done bar would give the two
//   platforms different field-to-field affordances, and it needs copy ("Next",
//   "Done") that no namespace carries — this stage is already carrying an
//   unpaid i18n debt for offline and cool-down and must not add a third. The
//   return-key chain (decision 4) does the same job with the keyboard the OS
//   already draws, on both platforms, with no new strings.
//
// DECISION 4 — the return-key chain, on every multi-field form.
//   Non-final fields take `returnKeyType="next"` and `submitBehavior="submit"`,
//   and their `onSubmitEditing` focuses the next input. `submitBehavior="submit"`
//   (RN's replacement for `blurOnSubmit`) is what KEEPS THE KEYBOARD UP across
//   the hop: the default blurs first, so the keyboard collapses and re-opens
//   between two adjacent fields, which on Android also re-runs the layout twice.
//   The last field takes `returnKeyType="go"` and submits the form. See
//   `field.tsx` for why the ref that makes this work needs a type-only cast.
//
// DECISION 5 — `autoComplete` AND `textContentType`, on every field.
//   They are different platforms' APIs for the same thing and neither is a
//   superset: `autoComplete` drives Android's autofill service, `textContentType`
//   drives iOS's QuickType/Keychain strip. Setting one is a password manager
//   that works on half the install base. The `new-password` / `newPassword`
//   pair on register and reset is what makes iOS offer to SAVE a strong
//   password and Android offer to UPDATE the stored one; `current-password` /
//   `password` on login is what makes them offer to fill it.
//
// DECISION 6 — ONE FRAME, TOP TO BOTTOM (the 2026-09-30 pre-login layout).
//   · A navigation row in `Screen`'s static header slot: a back `IconButton`
//     on the left where the screen already had a way back. Login and register
//     show the full, centred FormaCore logo below any navigation controls.
//   · The title block scrolls WITH the form rather than staying pinned. With
//     the keyboard up on a small phone, a pinned two-line title takes the room
//     the focused field needs.
//   · The main action goes in `Screen`'s footer, on the canvas, above the
//     keyboard. Login is the exception by product decision: its submit stays
//     under the password field (`login.tsx`).
//   · The body follows the title block directly, `spacing[6]` below it, on
//     every screen — short ones included. Centring a single field in the space
//     left over parted it from the sentence that asks for it (the approved
//     `forgot-password` mockup keeps them together).
// ===========================================================================

import { Heading, IconButton, Screen, Text, spacing, useTheme } from '@fit/ui-mobile';
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';

import { useI18n } from '../../providers/I18nProvider';

/**
 * The full FormaCore logos, cropped to their visible bounds (989 × 288).
 *
 * `require`, not `import`: the `*.png` module declaration lives in Expo's
 * generated `expo-env.d.ts`, which is gitignored, so an `import` type-checks
 * on a machine that has run `expo start` and fails on a clean CI checkout.
 * Metro resolves both to the same asset id.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO_DARK = require('../../assets/logo-dark.png') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO_LIGHT = require('../../assets/logo-light.png') as number;

const BRAND_WIDTH = 200;
const BRAND_ASPECT_RATIO = 989 / 288;

/** The nav row's height: the back button's 44pt target, kept when it is empty. */
const NAV_ROW = spacing[11];

/** The rhythm between fields. */
const BODY_GAP = spacing[4];

/** The full logo, with lettering selected for the active theme. Decorative. */
export function BrandMark({ testID }: { testID?: string }) {
  const { isDark } = useTheme();
  return (
    <Image
      testID={testID}
      source={isDark ? LOGO_DARK : LOGO_LIGHT}
      // The title beside it already names the product; a screen reader gains
      // nothing from hearing a picture of the same name.
      accessible={false}
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      style={{
        width: BRAND_WIDTH,
        height: BRAND_WIDTH / BRAND_ASPECT_RATIO,
        alignSelf: 'center',
      }}
    />
  );
}

/**
 * Keep the logo centred independently of back/skip controls. Separate rows
 * prevent long translated controls from overlapping it on a narrow phone.
 */
export function NavRow({
  leading,
  trailing,
  brand,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  brand?: ReactNode;
}) {
  return (
    <View style={{ gap: spacing[3] }}>
      {leading || trailing || !brand ? (
        <View
          style={{
            minHeight: NAV_ROW,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexShrink: 0 }}>{leading}</View>
          <View style={{ flexShrink: 0 }}>{trailing}</View>
        </View>
      ) : null}
      {brand}
    </View>
  );
}

export interface AuthScreenProps {
  /**
   * The screen title, as a `Heading` — which carries
   * `accessibilityRole="header"`, and it is the ONLY header on these screens,
   * which is plan §6 item 7's "one `role=header` per screen". Nothing else here
   * may use `Heading`; `Alert` and `EmptyState` deliberately do not.
   */
  title: string;
  /**
   * The line under it. Optional: the verify screen's in-flight state has a
   * title ("Verifying your email…") and no second sentence, and inventing one
   * would mean authoring copy this stage is not authoring.
   */
  subtitle?: string;
  /** The form, the panel, or the state. */
  children: ReactNode;
  /**
   * Pinned at the bottom, above the keyboard: the screen's main action and
   * whatever belongs with it. Rendered through `Screen`'s footer, which paints
   * the canvas behind it down to the edge.
   */
  footer?: ReactNode;
  /**
   * The existing way back, drawn as a chevron at the top left. Pass the SAME
   * handler the screen's own "back to sign in" already runs — this is that
   * action made findable, not a new destination.
   */
  onBack?: () => void;
  /** Centred full logo above the title. Login and register only. */
  brand?: boolean;
  /** Forwarded to `Screen`; `${testID}-header`, `-scroll`, `-footer`, `-nav-back`, `-brand` follow. */
  testID: string;
}

/** The auth stack's page frame. See decision 6 above. */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
  onBack,
  brand = false,
  testID,
}: AuthScreenProps) {
  const { t } = useI18n();
  const brandMark = brand ? <BrandMark testID={`${testID}-brand`} /> : null;

  return (
    <Screen
      testID={testID}
      // No tab bar under the auth stack — see decision 1.
      reserveTabBar={false}
      header={
        <NavRow
          leading={
            onBack === undefined ? null : (
              <IconButton
                icon="chevronLeft"
                variant="surface"
                accessibilityLabel={t('notifications.back')}
                onPress={onBack}
                testID={`${testID}-nav-back`}
              />
            )
          }
          brand={brandMark}
        />
      }
      footer={
        footer === undefined ? undefined : (
          <View style={{ paddingTop: spacing[4], gap: spacing[3] }}>{footer}</View>
        )
      }
    >
      <View style={{ paddingTop: spacing[5], paddingBottom: spacing[6] }}>
        <View style={{ marginBottom: spacing[6] }}>
          <Heading level={2}>{title}</Heading>
          {subtitle ? (
            <Text variant="bodyRegular" color="textSecondary" style={{ marginTop: spacing[2] }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: BODY_GAP }}>{children}</View>
      </View>
    </Screen>
  );
}
