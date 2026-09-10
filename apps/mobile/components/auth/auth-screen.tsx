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
// ===========================================================================

import { AppBar, Screen } from '@fit/ui-mobile';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/** The vertical rhythm between the header block and the form. */
const FORM_GAP = 20;

export interface AuthScreenProps {
  /**
   * The screen title. Rendered by `AppBar` as a `Heading`, which carries
   * `accessibilityRole="header"` — and it is the ONLY header on these screens,
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
  /** Below the form — the "back to sign in" / "create one" row. */
  footer?: ReactNode;
  /** Forwarded to `Screen`; `${testID}-header`, `-scroll` follow from it. */
  testID: string;
}

/**
 * The auth stack's page frame: safe-area header, title block, scrolling body.
 *
 * There is deliberately no branding hero. The web screens have a photograph
 * (`AuthPhotoShell`) which exists to fill a 1440pt canvas beside a 400pt form; a
 * phone has no such space, and the artboards' own screens all open straight onto
 * their content. Adding a hero image here would push the first field below the
 * fold on an SE with the keyboard up.
 */
export function AuthScreen({ title, subtitle, children, footer, testID }: AuthScreenProps) {
  return (
    <Screen
      testID={testID}
      // No tab bar under the auth stack — see decision 1.
      reserveTabBar={false}
      header={<AppBar title={title} subtitle={subtitle} padBottom={FORM_GAP} />}
    >
      <View style={{ gap: FORM_GAP }}>{children}</View>
      {footer === undefined ? null : <View style={{ marginTop: FORM_GAP }}>{footer}</View>}
    </Screen>
  );
}
