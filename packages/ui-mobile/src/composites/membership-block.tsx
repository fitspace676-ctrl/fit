import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import { Button } from '../forms/button';
import { IconButton } from '../forms/icon-button';
import type { IconName } from '../primitives/icon/paths';
import { Pill } from '../feedback/pill';
import { ProgressBar } from '../feedback/progress';
import { ProgressRing } from '../feedback/progress';
import { Eyebrow, Heading, Mono, Text } from '../primitives/text';
import { Surface } from '../primitives/surface';
import { clampRadiusTo } from '../internal/clamp-radius';
import { ink } from '../palette';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// THE LIME BLOCK. The one element of the direction the member recognises the
// app by, and it appears on two screens:
//
//   home     `mobile-home-v2.tsx:228-269`  eyebrow + `ProgressRing`, then an
//            ink-950 capsule holding a big mono figure, its caption, and a
//            44pt lime round action that opens the check-in code
//   profile  `mobile-profile.tsx:184-224`  eyebrow + a status `Pill`, then a
//            `ProgressBar` on an ink-950/15 track and two on-block buttons
//
// Same shell in both: CUT_LG (radius 32, the `page` rung), `bg-brand-300`,
// `text-ink-950`, `p-5`. Same plan name at 34/800 uppercase, same 13/500
// status line under it. Everything below that line differs, and the difference
// is what the two `trailing`/footer shapes express.
//
// ---------------------------------------------------------------------------
// IT TAKES NO STATUS ENUM. THIS IS THE DESIGN DECISION OF THE COMPONENT.
//
// The obvious API is `status: 'ACTIVE' | 'FROZEN' | 'PAST_DUE'`, and it is
// wrong twice. It puts BACKEND VOCABULARY inside a design package — the exact
// thing `no-restricted-imports` bans `@fit/types` to prevent — and it forces
// this component to own the mapping from a subscription state to a sentence,
// which is copy, in a locale it cannot see.
//
// So `statusLine` is a string ("აქტიური · 22 / 30 დღე დარჩა", "განახლდება 14
// აგვისტოს · დარჩა 22/30 დღე") and `statusPill` is a string. Both screens then
// serve from one component, and adding a fourth subscription state to the API
// changes no file in this package.
//
// The one number this component DOES understand is the period progress, which
// is geometry rather than vocabulary: `value` / `min` / `max` land on either
// the ring or the bar, and both announce through the caller's
// `progressAccessibilityLabel`.
//
// ---------------------------------------------------------------------------
// EVERY CONTROL ON THE BLOCK IS AN `onAccent` CONTROL.
//
// `Button` ships `onAccent` (ink-950 plate, brand-300 text) and
// `onAccentQuiet` (a 10% ink wash, ink-950 text) for exactly this surface —
// they exist because a `secondary` button's ink-800 plate on lime reads as a
// hole, and a `primary` lime button on lime is invisible. `IconButton`'s
// `accent` variant is the home block's 44pt lime disc on the ink capsule.
//
// Nothing here paints a colour of its own: `accent` and `onAccent` are
// mode-independent in the semantic map (brand-300 / ink-950 in BOTH arms), so
// the block is identical in light and dark by construction, which is the
// point of the direction.
//
// ---------------------------------------------------------------------------
// THE COVER IS A BAND ON TOP, NOT A LAYER BEHIND. THIS IS A DECISION.
//
// `coverUrl` is the gym's own photograph — the member portal's sign-in image,
// `GET /gyms/by-subdomain/:slug` → `portal.loginImageUrl` — and the obvious
// treatment is `ClassCard`'s: full-bleed behind the content under a measured
// scrim. That is wrong HERE, and for a reason no screenshot shows: every text
// run on this block is `ink-950` ON LIME, and a photo needs a DARK scrim to be
// read over. Dark scrim plus near-black text is an unreadable card, so the
// full-bleed layer forces every colour on the block (eyebrow, plan, status
// line, ring, capsule) onto a second ladder — and the lime block is the one
// element of the direction a member recognises the app by.
//
// So the photograph is a FULL-BLEED BAND above the eyebrow and the lime body is
// untouched below it: the gym's picture arrives, the brand and every contrast
// ratio stay exactly as they were, and NO text is ever set over the image —
// which is also why there is no scrim here. A scrim exists to make text legible
// over a photograph; over a band that carries none it would only be darkening
// the gym's own picture, and the two scrim roles this package ships (72% and
// 85% ink) would darken it nearly to black.
//
// `coverUrl == null` — the normal case, and every gym that has uploaded no
// portal image — renders this block EXACTLY as it is drawn without one: no
// image node, no placeholder, no grey plate. A URL that fails to load degrades
// to the same card (`onError` drops it), rather than showing the platform's
// broken-image glyph on the member's plan.
// ===========================================================================

/** The home block's ink capsule: a big figure, its caption, a round action. */
export interface MembershipBlockHighlight {
  /** The figure, already formatted — "8". Set in mono at 26/700. */
  value: string;
  /** Its caption — "დღე დარჩა". 10/600 small caps. */
  label: string;
  /**
   * REQUIRED. What the capsule says as one sentence — "8 days left". Without
   * it VoiceOver reads "eight" and then, as an unrelated stop, "days left".
   */
  accessibilityLabel: string;
  /** The lime disc on the right. Omit and the capsule is text only. */
  action?: {
    icon: IconName;
    onPress: () => void;
    /** REQUIRED — an icon-only control has no other name. */
    accessibilityLabel: string;
    testID?: string;
  };
}

/** One of the profile block's two on-block buttons. */
export interface MembershipBlockAction {
  label: string;
  onPress: () => void;
  /** A leading glyph — the freeze button's `pause`. */
  icon?: IconName;
  /**
   * `true` for the loud one (ink-950 plate, lime text) — the profile's
   * "check-in QR". `false`, the default, for the quiet ink wash beside it.
   */
  primary?: boolean;
  disabled?: boolean;
  testID?: string;
}

export interface MembershipBlockProps {
  /** The section eyebrow — "აბონემენტი" / "წევრობა". 12/600, 0.14em. */
  eyebrow: string;

  /** The plan name — "Premium". Set at 34/800; the artboards uppercase it. */
  plan: string;

  /**
   * The one line under the plan name. A whole sentence, composed by the
   * caller: this component takes no status enum. See the header.
   */
  statusLine?: string;

  /**
   * An optional ink-950 pill at the top right — the profile block's "აქტიური".
   * A string, for the same reason `statusLine` is.
   */
  statusPill?: string;

  /**
   * The gym's photograph, drawn as a full-bleed band across the top of the
   * block. `null` / omitted is the NORMAL case and renders the block exactly as
   * it is drawn without one; a URL that fails to load degrades to that same
   * block. Decoration — the API ships no alt text, and there is nothing here a
   * member needs announced. See the header for why this is a band rather than a
   * layer behind the content.
   */
  coverUrl?: string | null;

  /** Where the billing period is, 0–100 unless `progressMax` says otherwise. */
  progressValue?: number;
  /** Default 0. */
  progressMin?: number;
  /** Default 100. */
  progressMax?: number;

  /**
   * REQUIRED WHENEVER A PROGRESS INDICATOR IS DRAWN — that is, whenever
   * `progressValue` is given. Typed optional because a block with no meter
   * needs no label; `ProgressBar`/`ProgressRing` require it, so a caller that
   * passes a value and forgets the label fails type-check at the call below.
   */
  progressAccessibilityLabel?: string;

  /**
   * Spoken instead of the bare percentage — "22 of 30 days left". Strongly
   * recommended: "73 percent" is not what a member wants to hear about their
   * membership.
   */
  progressValueText?: string;

  /**
   * Draw the period as a RING beside the eyebrow (home) rather than as a BAR
   * under the status line (profile). Default `'bar'`.
   */
  progressShape?: 'bar' | 'ring';

  /** The home block's ink capsule. */
  highlight?: MembershipBlockHighlight;

  /** The profile block's row of on-block buttons. Two, in the artboard. */
  actions?: readonly MembershipBlockAction[];

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * THE TWO COLOURS THIS FILE NAMES ITSELF, AND WHY THEY ARE PALETTE LITERALS
 * RATHER THAN ROLES.
 *
 * Both sit on a MODE-INDEPENDENT surface. `accent` is `brand-300` in both arms
 * of the semantic map and `onAccent` is `ink-950` in both, so the lime block
 * and the ink capsule inside it are the same two colours in light mode as in
 * dark. A role on top of them would not be: `textSecondary` is `ink-400` in
 * dark (right) and `ink-600` in light (grey on near-black, unreadable), and
 * the role would be repainting a surface that never changed.
 *
 * Same exception, same reasoning, and the same two neighbours it is modelled
 * on: `ProgressBar`'s `ON_LIME_TRACK` and `Button`'s `ON_ACCENT_QUIET`. Both
 * values here are palette members, so the drift guard still recognises them.
 *
 * `text-ink-800` on lime — the eyebrow and the status line.
 */
const ON_LIME_MUTED = ink[800];

/** `text-ink-400` on the ink capsule — the figure's caption. */
const CAPSULE_CAPTION = ink[400];

/** `py-2.5 pl-5 pr-2.5` on a capsule — the home block's ink pill. */
const CAPSULE = { padV: 2.5, padLeft: 5, padRight: 2.5 } as const;

/** `p-5` — the block's own padding, and the cover band's inner offset. */
const PAD = 5;

/**
 * The cover band's height.
 *
 * Tall enough to read as the gym's photograph rather than as a coloured rule
 * (a 60pt strip of a wide interior shot is a texture), short enough that the
 * plan name is still above the fold on a 390×844 screen with the app bar, the
 * band, and the block's own 170pt of content above the counters.
 */
const COVER_HEIGHT = 132;

/** The lime block, on home and on profile. */
export function MembershipBlock({
  eyebrow,
  plan,
  statusLine,
  statusPill,
  progressValue,
  progressMin = 0,
  progressMax = 100,
  progressAccessibilityLabel,
  progressValueText,
  progressShape = 'bar',
  coverUrl = null,
  highlight,
  actions,
  testID,
  style,
  className,
}: MembershipBlockProps) {
  const colors = useThemeColors();

  /**
   * The URL that failed, not a boolean — `ClassCard`'s rule, and for the same
   * reason: keyed by URL, a gym whose photo is replaced draws the new one
   * instead of inheriting the dead one's silence.
   */
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const cover = coverUrl !== null && coverUrl !== '' && coverUrl !== failedCover ? coverUrl : null;

  // The number `Surface` resolves `'page'` to, so the band's top corners are the
  // block's corners rather than an approximation of them.
  const coverRadius = clampRadiusTo('page');

  const showRing =
    progressShape === 'ring' && progressValue !== undefined && progressAccessibilityLabel;
  const showBar =
    progressShape === 'bar' && progressValue !== undefined && progressAccessibilityLabel;

  /**
   * The band. `overflow: 'hidden'` on the wrapper AND a radius on the `Image`:
   * the wrapper's clip is what actually rounds the photo, and the radius on the
   * image itself is the Android belt-and-braces `Avatar` documents.
   */
  const coverBand =
    cover === null ? null : (
      <View
        {...DECORATIVE}
        testID={testID === undefined ? undefined : `${testID}-cover`}
        style={{
          height: COVER_HEIGHT,
          borderTopLeftRadius: coverRadius,
          borderTopRightRadius: coverRadius,
          overflow: 'hidden',
          // The band sits on the block's own lime, so a photograph with
          // transparency (a PNG mark) lands on the brand rather than on nothing.
          backgroundColor: colors.accent,
        }}
      >
        <Image
          source={{ uri: cover }}
          resizeMode="cover"
          onError={() => {
            setFailedCover(cover);
          }}
          testID={testID === undefined ? undefined : `${testID}-cover-image`}
          style={[
            StyleSheet.absoluteFill,
            { borderTopLeftRadius: coverRadius, borderTopRightRadius: coverRadius },
          ]}
        />
      </View>
    );

  const body = (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing[3],
        }}
      >
        {/*
          12 / 600 / uppercase, 0.14em — the `eyebrow` role. `onAccent` at 80%
          is what the artboards' `text-ink-800` is on lime: the block's own
          secondary, not the page's `textSecondary`, which is a light grey and
          would vanish here.
        */}
        <Eyebrow size="eyebrow" color={ON_LIME_MUTED} numberOfLines={1} style={{ flex: 1 }}>
          {eyebrow}
        </Eyebrow>

        {showRing ? (
          <ProgressRing
            value={progressValue}
            min={progressMin}
            max={progressMax}
            color="onAccent"
            accessibilityLabel={progressAccessibilityLabel}
            accessibilityValueText={progressValueText}
          />
        ) : null}

        {statusPill ? (
          <Pill tone="onAccent" size="sm">
            {statusPill}
          </Pill>
        ) : null}
      </View>

      {/*
        34 / 800 / uppercase, leading-none. `display` is the role, and 34 is
        its lineHeight floor — `leading-none` at this size clips Georgian
        ascenders on Android, so the role's 38 is kept rather than transcribed
        down to 34. That is the one place this component does not follow the
        artboard literally, and `tokens/typography.ts` says why.
      */}
      <Heading
        level={1}
        color="onAccent"
        numberOfLines={2}
        style={{ marginTop: spacing[3], textTransform: 'uppercase' }}
      >
        {plan}
      </Heading>

      {statusLine ? (
        <Text
          variant="bodySmall"
          color={ON_LIME_MUTED}
          style={{ marginTop: spacing[2], fontWeight: '500' }}
        >
          {statusLine}
        </Text>
      ) : null}

      {showBar ? (
        <ProgressBar
          value={progressValue}
          min={progressMin}
          max={progressMax}
          tone="onAccent"
          accessibilityLabel={progressAccessibilityLabel}
          accessibilityValueText={progressValueText}
          style={{ marginTop: spacing[4] }}
        />
      ) : null}

      {highlight ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing[5] }}>
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={highlight.accessibilityLabel}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[4],
              borderRadius: clampRadiusTo('full', 64),
              backgroundColor: colors.onAccent,
              paddingVertical: spacing[CAPSULE.padV],
              paddingLeft: spacing[CAPSULE.padLeft],
              paddingRight: spacing[CAPSULE.padRight],
            }}
          >
            <View>
              {/*
                26/700 mono. `monoDisplay` is 30 and `monoLarge` is 17; the
                artboard is between them, so the nearer role is taken and its
                size nudged rather than a seventh mono step invented.
              */}
              <Mono
                variant="monoDisplay"
                color="accent"
                {...DECORATIVE}
                style={{ fontSize: 26, lineHeight: 26 }}
              >
                {highlight.value}
              </Mono>
              <Text
                variant="micro"
                color={CAPSULE_CAPTION}
                {...DECORATIVE}
                style={{ marginTop: spacing[1] }}
              >
                {highlight.label}
              </Text>
            </View>

            {highlight.action ? (
              <IconButton
                icon={highlight.action.icon}
                onPress={highlight.action.onPress}
                accessibilityLabel={highlight.action.accessibilityLabel}
                testID={highlight.action.testID}
                variant="accent"
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {actions && actions.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[5] }}>
          {actions.map((item, i) => (
            <Button
              key={`${item.label}-${i}`}
              label={item.label}
              onPress={item.onPress}
              icon={item.icon}
              variant={item.primary ? 'onAccent' : 'onAccentQuiet'}
              disabled={item.disabled}
              testID={item.testID}
              // The artboard's first button is `flex-1` and the second
              // `shrink-0`: the loud action takes the room that is left, the
              // quiet one is exactly as wide as its label. A row of two
              // equal halves would put "გაყინვა" in the middle of a wide plate
              // and lose the hierarchy the two fills are drawing.
              style={item.primary ? { flex: 1 } : { flexShrink: 0 }}
            />
          ))}
        </View>
      ) : null}
    </>
  );

  return (
    <Surface
      testID={testID}
      tone="accent"
      radius="page"
      /*
        WITHOUT a cover the padding is the Surface's, exactly as it has always
        been. WITH one it moves to a wrapper inside, so the band is flush to
        three of the block's edges rather than inset by 20pt on each.
      */
      padding={cover === null ? PAD : undefined}
      style={[cover === null ? null : { overflow: 'hidden' }, style]}
      className={className}
    >
      {coverBand}
      {cover === null ? body : <View style={{ padding: spacing[PAD] }}>{body}</View>}
    </Surface>
  );
}
