// ===========================================================================
// PARKED — 2026-08-31. NO CONSUMER IN THE APP, AND THAT IS DELIBERATE.
//
// `apps/mobile` no longer has a QR screen. Decision Q1 closed the other way:
// there is no scanner integration, and the only check-in surface on the API is
// `@Controller('admin/check-ins')`, behind `MemberRead` / `MemberWrite`, which
// a member cannot call. A screen whose whole purpose is to be scanned had
// nothing to talk to, so it was removed along with `app/qr.tsx`,
// `lib/checkin.ts`, `components/qr/**` and the capsule's centre action.
//
// THIS FILE STAYS, WITH ITS TESTS. An export with no consumer is normally the
// exact rot that killed the previous design package — the exception is earned
// here. The encoder underneath it carried TWO shipping-grade bugs that were
// found and fixed: a zig-zag walk that never wrote column 0 (and wrote column 4
// twice), and a version block that was reserved and never drawn. Both are
// invisible in a screenshot; both were verified module-for-module against an
// independent implementation, and 71 golden vectors pin them. Deleting this and
// re-porting it later would re-introduce both, and the second port would be
// reviewed exactly as carefully as the first one was — which is to say, it was
// called "sound" twice before the vectors found the bugs.
//
// COST OF BRINGING IT BACK: one screen. The components, the encoder and their
// tests are all here and green; what is missing is a scanner on the other side
// and a member-scoped endpoint to check in against.
// ===========================================================================

import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import { Avatar } from '../primitives/avatar';
import { IconButton } from '../forms/icon-button';
import { Pill } from '../feedback/pill';
import { Eyebrow, Mono, Text } from '../primitives/text';
import { Surface } from '../primitives/surface';
import { brand, ink } from '../palette';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';
import { QrCode } from './qr/qr-code';

// ===========================================================================
// THE MEMBER CARD. Artboard `mobile-qr.tsx:199-248`; the same component,
// inside a `Sheet` with different chrome around it, at
// `mobile-home-v2.tsx:536-667`.
//
// ---------------------------------------------------------------------------
// READ THIS BEFORE CHANGING THE HIERARCHY. THE QR IS NOT A CREDENTIAL.
//
// Decision Q1 is closed, and the answer is that THERE IS NO SCANNER SIDE. The
// only check-in surface in the API is `@Controller('admin/check-ins')`, behind
// `MemberRead`/`MemberWrite` — a member cannot call it, and nothing consumes
// this code. What the QR encodes is a user id and a gym id: non-secret,
// stable, and derivable by anyone who has ever seen the code once. It is an
// IDENTITY CLAIM, not a credential.
//
// Three consequences, and they are the whole design of this component:
//
//   1. THE MEMBER ID IS THE PRIMARY ELEMENT — large mono, with a copy
//      affordance, directly under the gym name and ABOVE the code. A
//      receptionist typing `FC-4821` into the admin console is the flow that
//      works today; the QR is there for the day a scanner exists. The artboard
//      draws the reverse order and puts the id in a separate "manual fallback"
//      section below the card. That was drawn when a scanner was assumed.
//
//   2. THERE IS NO COUNTDOWN, AND THERE IS NO PROP FOR ONE. The artboard has a
//      "განახლდება 0:47-ში" row between the code and the member strip, and the
//      salvaged `checkin.ts` is candid that its nonce is cosmetic and a scanner
//      would ignore it. A refresh timer is read by every user as "this expires,
//      therefore it is secure" — and nothing here expires and nothing here is
//      secure. Shipping the timer would be the product lying to the member
//      about what the code is. The `qr` i18n namespace still carries a
//      `refreshesIn` key; it stays unused, deliberately.
//
//      The member id row occupies exactly the space the countdown had.
//
//   3. `payload` IS A STRING THIS COMPONENT NEVER PARSES. The URI scheme
//      (`fitspace://check-in?...`) is a backend contract, so it is built in
//      `apps/mobile` and handed in whole. See `qr/qr-code.tsx`.
//
// ---------------------------------------------------------------------------
// `boosted` FLIPS THE SURFACES TO WHITE, AND THAT IS ALL IT DOES.
//
// The screen raises the device's brightness; this component's part is to give
// the camera the highest-contrast target it can — white paper, black ink. The
// lime plate under the code (`brand-50`, near-white) becomes true white, and
// the lime card becomes white. The code's own modules never change: ink-950 on
// the plate colour, always, because the light modules are as much a part of the
// symbol as the dark ones.
// ===========================================================================

/** The copy affordance beside the member id. */
export interface CheckInPassCopyAction {
  onPress: () => void;
  /** REQUIRED — an icon-only control has no other name. */
  accessibilityLabel: string;
  /**
   * Latch it after a successful copy: the glyph becomes a tick and the plate
   * takes the accent pair, exactly as `mobile-qr.tsx:277` draws it. The screen
   * owns the timeout that clears it — a component that cleared its own state
   * would fight the screen's toast.
   *
   * THE TICK IS NOT AN ANNOUNCEMENT. It is a colour and a glyph, and a screen
   * reader sees neither, so the screen must say it: fire `useToast` on a
   * successful copy. This component deliberately does not change the button's
   * LABEL to say "copied" — a control whose name changes under the user is a
   * control they cannot find again.
   */
  copied?: boolean;
  testID?: string;
}

/** The member id block: the element this card exists to show. */
export interface CheckInPassMemberId {
  /** The eyebrow — "წევრის ID". Copy, so it is the caller's. */
  label: string;
  /** The id itself — "FC-4821". Set in tracked, tabular mono at 20/700. */
  value: string;
  /**
   * REQUIRED. What the block says as one sentence.
   *
   * An id is the one string where VoiceOver's character-by-character reading
   * is arguably RIGHT ("F C dash four eight two one" is what you would read to
   * a receptionist), so the caller decides — but it must decide: an unlabelled
   * mono run announces as neither the label nor the id, but as both, twice.
   */
  accessibilityLabel: string;
  /** Omit and the id is displayed without a copy button. */
  copy?: CheckInPassCopyAction;
}

/** The member strip under the code. */
export interface CheckInPassMember {
  name: string;
  /** The line under the name — "Premium · წევრის ID FC-4821". */
  meta?: string;
  /** A remote or bundled portrait. */
  avatar?: ImageSourcePropType;
  /** The monogram fallback. Initial-taking is locale-specific, so it is a prop. */
  initials?: string;
  /**
   * Replaces what the strip announces. Optional: `name` and `meta` are plain
   * text and read correctly on their own.
   */
  accessibilityLabel?: string;
}

/** The figure on the right of the member strip — the artboard's "8 days left". */
export interface CheckInPassTrailing {
  /** Already formatted — "8". */
  value: string;
  /** Its caption — "დარჩენილი დღე". */
  label: string;
  /** REQUIRED. The whole spoken sentence: "8 days left". */
  accessibilityLabel: string;
}

export interface CheckInPassProps {
  /**
   * The string encoded into the code, whole and opaque. This component never
   * builds or parses it; see consequence 3 in the header.
   */
  payload: string;

  /** REQUIRED. What the code announces — "ჩექ-ინის QR კოდი". */
  qrAccessibilityLabel: string;

  /** The gym's name, as the card's eyebrow — "Downtown Strength". */
  gymName: string;

  /** The ink pill at the top right — "აქტიური". A string; no status enum. */
  statusLabel?: string;

  /** The member id. The primary element. */
  memberId: CheckInPassMemberId;

  /** The member strip. Omit inside a sheet that already names the member. */
  member?: CheckInPassMember;

  /** The figure at the right of the member strip. */
  trailing?: CheckInPassTrailing;

  /**
   * White surfaces for the brightness boost. Default false. See the header —
   * the code's own modules are unaffected.
   */
  boosted?: boolean;

  /**
   * An upper bound on the code's side, in points. Default 232 — the QR tab's
   * plate. The sheet-hosted copy is smaller: `mobile-home-v2.tsx:536` draws a
   * `w-60` plate at `p-5`, so it passes 200.
   */
  qrSize?: number;

  /** Forwarded to the root node. Maestro targets `member-qr-pass`. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * The three colours this file names, all palette literals, all on
 * mode-independent surfaces. Same exception as `membership-block.tsx`; see its
 * note for the reasoning.
 */
const ON_LIME_MUTED = ink[800]; // The gym name on the lime (or white) card.
const PLATE_CAPTION = ink[400]; // Captions on the ink-950 plates.
const QR_PLATE = brand[50]; //     `bg-brand-50`, the near-white QR ground.

/** `rounded-[26px]` on the code's plate, `rounded-[22px]` on the ink plates. */
const QR_PLATE_RADIUS = 26;
const PLATE_RADIUS = 22;

/** `h-11 w-11` — the artboard's avatar, with its lime ring. */
const AVATAR_SIZE = 44;

/**
 * `h-10 w-10` — the artboard's copy button (`mobile-qr.tsx:275`).
 *
 * Pinned rather than left to the variant, because the variant CHANGES between
 * the idle and copied states (`onAccent` is 40, `accent` is 44) and a control
 * that grows by four points at the moment it is pressed shifts the id beside
 * it. `IconButton` scales its glyph and its hit slop from the size it is
 * given, so 40 here still clears the 44pt touch target.
 */
const COPY_BUTTON_SIZE = 40;

/** A member's card: their id, their code, and who they are. */
export function CheckInPass({
  payload,
  qrAccessibilityLabel,
  gymName,
  statusLabel,
  memberId,
  member,
  trailing,
  boosted = false,
  qrSize,
  testID,
  style,
  className,
}: CheckInPassProps) {
  const colors = useThemeColors();

  // Boosted: the card and the code's plate both go true white. See the header.
  const plate = boosted ? colors.onDark : QR_PLATE;

  return (
    <Surface
      testID={testID}
      tone="accent"
      radius="page"
      padding={5}
      background={boosted ? colors.onDark : undefined}
      style={style}
      className={className}
    >
      {/* ---------------------------------------------------------------- */}
      {/* The gym, and the membership's state.                             */}
      {/* ---------------------------------------------------------------- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[3],
        }}
      >
        <Eyebrow size="eyebrow" color={ON_LIME_MUTED} numberOfLines={1} style={{ flex: 1 }}>
          {gymName}
        </Eyebrow>
        {statusLabel ? (
          <Pill tone="onAccent" size="sm">
            {statusLabel}
          </Pill>
        ) : null}
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* THE MEMBER ID. First, largest, and the only thing here that any   */}
      {/* system on the other side of the desk can actually accept today.   */}
      {/* ---------------------------------------------------------------- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          marginTop: spacing[4],
          borderRadius: PLATE_RADIUS,
          backgroundColor: colors.onAccent,
          paddingVertical: spacing[3],
          paddingLeft: spacing[4],
          paddingRight: memberId.copy ? spacing[2.5] : spacing[4],
        }}
      >
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={memberId.accessibilityLabel}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Eyebrow size="label" color={PLATE_CAPTION} numberOfLines={1} {...DECORATIVE}>
            {memberId.label}
          </Eyebrow>
          {/*
            20 / 700 with 0.1em of tracking (`mobile-qr.tsx:271`). The mono
            scale's nearest steps are 17 (`monoLarge`) and 30 (`monoDisplay`),
            so the role supplies the face and the tabular figures and the two
            literals the artboard sets are written out. Tracking on an id is
            not decoration: it is what makes `FC-4821` legible to someone
            reading it off a phone held at arm's length across a desk.
          */}
          <Mono
            variant="monoLarge"
            color="onDark"
            numberOfLines={1}
            {...DECORATIVE}
            style={{ marginTop: spacing[1.5], fontSize: 20, lineHeight: 24, letterSpacing: 2 }}
          >
            {memberId.value}
          </Mono>
        </View>

        {/*
          THE COPIED STATE IS A VARIANT SWAP, AND `selected` IS DELIBERATELY
          NOT USED.
          
          `IconButton`'s `selected` takes the INVERSE pair for the two already-
          accented variants, so on `onAccent` (ink plate, lime glyph) it is
          visually a no-op and on `accent` it is the exact opposite of what the
          artboard draws for "copied". Flipping the variant is what produces
          the artboard's pair: ink plate + lime glyph idle, lime plate + ink
          glyph once copied.
          
          `selected` would also be the wrong WORD. It is a toggle's on-state,
          and copying is momentary, not a mode. The announcement belongs to the
          screen: fire the package's own `useToast` on a successful copy, which
          is a live region and says it once. The LABEL never changes either
          way, so a user who searched for "copy member ID" can still find the
          control after using it.
        */}
        {memberId.copy ? (
          <IconButton
            icon={memberId.copy.copied ? 'check' : 'copy'}
            onPress={memberId.copy.onPress}
            accessibilityLabel={memberId.copy.accessibilityLabel}
            testID={memberId.copy.testID}
            variant={memberId.copy.copied ? 'accent' : 'onAccent'}
            size={COPY_BUTTON_SIZE}
          />
        ) : null}
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* The code. Centred, never stretched — see `qr-code.tsx`.           */}
      {/* ---------------------------------------------------------------- */}
      <View
        style={{
          alignSelf: 'center',
          alignItems: 'center',
          marginTop: spacing[4],
          borderRadius: QR_PLATE_RADIUS,
          backgroundColor: plate,
          padding: spacing[4],
        }}
      >
        <QrCode
          value={payload}
          accessibilityLabel={qrAccessibilityLabel}
          size={qrSize}
          color="onAccent"
          background={plate}
        />
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Who this is. NOTE what is NOT between the code and this strip.    */}
      {/* ---------------------------------------------------------------- */}
      {(member ?? trailing) ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
            marginTop: spacing[5],
            borderRadius: PLATE_RADIUS,
            backgroundColor: colors.onAccent,
            padding: spacing[3.5],
          }}
        >
          {member ? (
            <>
              <Avatar
                source={member.avatar}
                initials={member.initials}
                size={AVATAR_SIZE}
                ring="accent"
              />
              <View
                accessible
                accessibilityRole="text"
                {...(member.accessibilityLabel
                  ? { accessibilityLabel: member.accessibilityLabel }
                  : {})}
                style={{ flex: 1, minWidth: 0 }}
              >
                <Text variant="bodyLarge" color="onDark" numberOfLines={1}>
                  {member.name}
                </Text>
                {member.meta ? (
                  <Text
                    variant="caption"
                    color={PLATE_CAPTION}
                    numberOfLines={1}
                    style={{ marginTop: spacing[0.5] }}
                  >
                    {member.meta}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          {trailing ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={trailing.accessibilityLabel}
              style={{ flexShrink: 0, alignItems: 'flex-end' }}
            >
              <Mono
                variant="monoDisplay"
                color="accent"
                {...DECORATIVE}
                style={{ fontSize: 22, lineHeight: 22 }}
              >
                {trailing.value}
              </Mono>
              <Text
                variant="micro"
                color={PLATE_CAPTION}
                {...DECORATIVE}
                style={{ marginTop: spacing[1] }}
              >
                {trailing.label}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Surface>
  );
}
