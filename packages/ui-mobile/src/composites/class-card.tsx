import { useState } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE, interactiveA11y } from '../internal/a11y';
import { DurationBadge } from '../data-display/duration-badge';
import { Button } from '../forms/button';
import { Pill } from '../feedback/pill';
import { clampRadiusTo } from '../internal/clamp-radius';
import { usePressed } from '../internal/use-pressed';
import { Eyebrow, Heading, Mono, Text } from '../primitives/text';
import { Surface } from '../primitives/surface';
import { layout, spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';
import { isClassFull } from './composite-metrics';

// ===========================================================================
// THE MOST REPEATED COMPOSITE IN THE PRODUCT.
//
//   default   `mobile-home-v2.tsx:339-401`  and, character for character,
//             `mobile-classes.tsx:343-401`
//   hero      `mobile-class-detail.tsx:132-158`
//
// The two default instances are IDENTICAL markup with different copy, which is
// the membership test for this package. Built twice, they are the tab bar
// again.
//
// ---------------------------------------------------------------------------
// THE FOUR ACTION STATES ARE DERIVED HERE, NOT PASSED IN.
//
//   status      spots       fill                        text
//   ─────────────────────────────────────────────────────────────────────────
//   null        left        brand-300                   ink-950  · book
//   null        none        brand-300                   ink-950  · waitlist
//   'BOOKED'    —           brand-950 + brand-800 ring  brand-200
//   'WAITLIST'  —           ink-800                     ink-200  · + position
//
// `spotsLeft` and `full` come from `composite-metrics.ts` — see its header for
// why the card computes them rather than taking them. What the card CANNOT
// compute is the wording: home says "მოლოდინის სია" where classes says
// "მოლოდინის სიაში ჩაწერა" for the very same state, which is precisely why all
// four labels are required props rather than three variants of one.
//
// ---------------------------------------------------------------------------
// THREE PITFALLS THAT ARE INVISIBLE IN A SCREENSHOT.
//
//   1. NESTED PRESSABLES. The artboard is a card containing a button. Made
//      literally — an outer `Pressable` wrapping an inner one — Android fires
//      both, and a member who meant to open the class ends up booked. Only the
//      CONTENT REGION is pressable here; the action row sits outside it, as a
//      sibling. The pressed tint is painted on the card root so the target
//      still looks like the whole card.
//
//   2. `max-w-[190px]` ON THE TITLE. That is a hard pixel against the
//      artboard's 390pt canvas. Ported literally, a long Georgian class name
//      clips mid-word on a 320pt device — and 190 is 58% of the artboard's
//      content width but 68% of a small phone's. The title gets `flex: 1` and
//      `numberOfLines={2}` instead, so it wraps where the device says.
//
//   3. `lineHeight` IS EXPLICIT. 24 × 1.05 = 25 (`leading-[1.05]`). Left to
//      the platform, Georgian descenders clip on Android at this size. The
//      `heading` role already carries 28; the artboard is tighter, so the
//      override is written out rather than left to a `leading` class that does
//      not exist here.
//
// ---------------------------------------------------------------------------
// TWO ACCESSIBILITY NODES. ONE FOR THE DESCRIPTION, ONE FOR THE ACTION.
//
// The visible card is eleven text runs: a coloured dot, a category, a title, a
// duration figure, its unit, a time, a trainer, a location, a spots count and
// a button. Announced individually that is eleven stops, three of which are
// read digit by digit because they are tabular monospace.
//
// So the content region is ONE node carrying the caller's
// `accessibilityLabel`, everything inside it is `DECORATIVE`, and the action
// button is the only other node.
//
// THE SPOTS PILL IS INSIDE THAT SILENCE. It sits in the action row for layout
// reasons, but it is part of the description, so it is hidden and its count
// MUST appear in `accessibilityLabel` — "Spin Express, 18:00, Sandro K.,
// 3 spots left". That is the one thing a caller can get wrong here, and it is
// why the prop's doc comment says so twice.
//
// ---------------------------------------------------------------------------
// THE DOT IS THE COLOUR THE API SHIPS.
//
// `categoryColor` is a required literal, not a name this component maps. Every
// artboard reads `style={{ backgroundColor: c.color }}` from the class record;
// a client-side category→colour map would be a second source of truth that
// drifts the first time an admin adds a category.
//
// ---------------------------------------------------------------------------
// THE COVER, AND THE THREE THINGS THAT GOVERN IT.
//
// `imageUrl` has been on `classInstanceCardSchema` (and therefore on the
// detail, which extends it) since the contract was written, and the public
// service populates it from `template.imageUrl` on both routes. Nothing on
// mobile read it. It is drawn here as a FULL-BLEED layer behind the card's own
// content — not a leading thumbnail and not a top banner — which is the shape
// `mobile-home-v2.tsx:339` was already built for: the card root is
// `relative overflow-hidden rounded-[30px]` with its content in a separate
// `relative p-5`. The artboard author left the hook and never drew the layer,
// so this treatment is NEW, and these three rules are what make it safe.
//
//   1. NULL IS NOT A STATE. On the seeded downtown gym three templates carry a
//      photo and the other seven do not, and most real classes never will — so
//      `coverImageUrl == null` renders the card EXACTLY as it is drawn today:
//      no `Image` node, no scrim, no placeholder, no skeleton, no "no photo"
//      tile. A grey box where a
//      photograph might have been is a fabrication, which is the failure this
//      rebuild exists to avoid. A FAILED REMOTE LOAD degrades to the same
//      thing — `onError` drops the URL and the card becomes the null card,
//      rather than showing the platform's broken-image plate.
//
//   2. THE SCRIM IS MEASURED, NOT TASTED. A photograph can be any colour, so
//      the worst case is white, and over white the scrim IS the background the
//      text is read against. `coverScrim` (ink-950 @ 72%) composites to
//      rgb(85,85,84) there: the title at `onDark` measures 7.45:1 and the meta
//      at `onCoverMuted` 5.43:1. `textSecondary` — the muted stop everywhere
//      else — would be 2.30:1 and is therefore PROMOTED to ink-200 over a
//      cover rather than the scrim being pushed darker until grey works; see
//      the role's comment in `tokens/semantic.ts`. Flat rgba, not a gradient:
//      `expo-linear-gradient` is not in the dependency set and a native module
//      costs every developer a fresh dev-client build for a wash that a
//      measured flat fill already delivers.
//
//   3. THE COVER IS DECORATION. The content region already announces the whole
//      card in one sentence (`accessibilityLabel`); a photo behind it says
//      nothing a member needs, and the API ships no alt text to say it with —
//      so inventing one would be inventing copy. Both layers are `DECORATIVE`.
//
// The hero takes the same layer with one addition: a `minHeight`, so a class
// detail's cover reads as a photo hero (the parity audit's own name for it)
// rather than as a tint behind a compact header, with the content bottom-
// aligned inside it. The default card gets NO height change — its cover is the
// card's own height, whatever the copy makes that.
// ===========================================================================

/** What the member's booking state is on this class, if anything. */
export type ClassCardStatus = 'BOOKED' | 'WAITLIST' | null;

/**
 * `default` is the list card; `hero` is the class-detail header.
 *
 * They differ by more than a radius, which is why this is a variant and not a
 * style override: the hero is padded 24 rather than 20, sets its title at 34
 * rather than 24, drops the duration disc, and shows the time and the length
 * as two pills instead of an inline meta line and an action row.
 */
export type ClassCardVariant = 'default' | 'hero';

/** A class's length. The same three strings, drawn two ways by the variants. */
export interface ClassCardDuration {
  /** The number, already formatted — "45". */
  value: string;
  /** The unit — "წთ". Copy, so it is the caller's. */
  unit: string;
  /** REQUIRED. The whole spoken sentence: "45 minutes". */
  accessibilityLabel: string;
}

/**
 * The card's action, and every word it can say.
 *
 * ALL FOUR LABELS ARE REQUIRED even though only one is drawn. The card picks
 * between them from `status` and its own occupancy arithmetic, which is the
 * entire reason it can serve two screens: neither screen gets to decide that
 * "full" means something different from what the other thinks.
 */
export interface ClassCardAction {
  onPress: () => void;
  /** `status` is null and seats remain — "დაჯავშნა". */
  bookLabel: string;
  /** `status` is null and the class is full — "მოლოდინის სია". */
  joinWaitlistLabel: string;
  /** `status` is `'BOOKED'` — "დაჯავშნილია". */
  bookedLabel: string;
  /** `status` is `'WAITLIST'` — "მოლოდინი · #2", position included by the caller. */
  waitlistedLabel: string;
  disabled?: boolean;
  /** In flight. Keeps the fill; see `Button`'s `busy`. */
  busy?: boolean;
  busyLabel?: string;
  /** Forwarded to the button, not to the card. */
  testID?: string;
}

export interface ClassCardProps {
  /** Default `'default'`. */
  variant?: ClassCardVariant;

  /** The category name, set as an eyebrow — "ძალა". Copy, so it is the caller's. */
  category: string;

  /**
   * The dot's colour, as the API ships it (`#E4F26A`). A literal, deliberately:
   * see the header.
   */
  categoryColor: string;

  /** The class name. Wraps to two lines; see pitfall 2 in the header. */
  title: string;

  /**
   * The class's cover photograph, drawn full-bleed behind the content under a
   * measured scrim. `null` / omitted is the NORMAL case and renders the card
   * exactly as it is drawn without one — no image node, no placeholder. A URL
   * that fails to load degrades to that same card. See the header.
   *
   * This is `ClassInstanceCard['imageUrl']`, straight off the wire.
   */
  coverImageUrl?: string | null;

  /**
   * The start time — "18:00". Set in tabular mono, inline in the meta line on
   * the default variant and as an ink pill on the hero.
   */
  time?: string;

  /**
   * The rest of the meta line, already composed by the caller — "Sandro K. ·
   * Downtown". On the hero this is the day ("ხუთშაბათი, 14 აგვისტო") and there
   * is no `time` inline; the hero draws it as a pill instead.
   */
  meta?: string;

  /** The white duration disc (default) or the second pill (hero). */
  duration?: ClassCardDuration;

  /** Seats in the room. With `bookedCount`, decides "book" vs "waitlist". */
  capacity: number;

  /** Seats taken. */
  bookedCount: number;

  /** Shown while seats remain — "3 ადგილი დარჩა". The caller interpolates the
   *  count, which it gets from the exported `spotsLeftFor`. */
  spotsLeftLabel?: string;

  /** Shown once the class is full — "სავსეა". */
  fullLabel?: string;

  /** The member's booking state. Default null. */
  status?: ClassCardStatus;

  /** The action. Omit on a card that only navigates (the hero does). */
  action?: ClassCardAction;

  /** Opens the class. Only the content region is pressable; see pitfall 1. */
  onPress?: () => void;

  /**
   * REQUIRED. The one sentence the content region announces.
   *
   * Everything visible inside the card except the action button is hidden
   * behind this, INCLUDING THE SPOTS PILL — so the seat count belongs in this
   * string. See the header.
   */
  accessibilityLabel: string;

  /** Longer supporting text, announced after the label. */
  accessibilityHint?: string;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * Variant geometry, transcribed.
 *
 * `radius` 30 is one of the artboards' pass-through literals; 'page' is 32,
 * the named rung the class-detail hero uses.
 */
const VARIANTS = {
  default: {
    radius: 30,
    pad: 5,
    titleVariant: 'heading',
    titleLineHeight: 25,
    metaVariant: 'bodySmall',
  },
  hero: {
    radius: 'page',
    pad: 6,
    titleVariant: 'display',
    titleLineHeight: 34,
    metaVariant: 'body',
  },
} as const;

/** The 8pt category dot — `h-2 w-2`. */
const DOT = 8;

/**
 * The floor a HERO with a cover is given, so the photograph has room to be one.
 *
 * The hero's own content is about 170pt tall (eyebrow, 34pt title, meta line,
 * two pills) and a photo cropped to that reads as a texture behind a header
 * rather than as the class's picture. 240 leaves roughly a 70pt band of
 * uncropped image above the content, which is what makes it a hero. It applies
 * ONLY with a cover and ONLY to the hero: the default card's height is its
 * content's, cover or not.
 */
const COVER_HERO_MIN_HEIGHT = 240;

/** Which of the four rows of the header's table this card is on. */
type ActionState = 'book' | 'joinWaitlist' | 'booked' | 'waitlisted';

function actionStateFor(status: ClassCardStatus, full: boolean): ActionState {
  if (status === 'BOOKED') return 'booked';
  if (status === 'WAITLIST') return 'waitlisted';
  return full ? 'joinWaitlist' : 'book';
}

/**
 * State → the `Button` that draws it.
 *
 * Three of the four are a `Button` variant outright: the two `null` states are
 * `primary` (brand-300 on ink-950) and `WAITLIST` is `secondary` (ink-800 /
 * ink-200), which is what those variants already are.
 *
 * `BOOKED` IS THE ONE THAT HAS NO VARIANT — brand-950 with a brand-800 hairline
 * and brand-200 text, the "already done, not a CTA" tint `Pill` carries as its
 * `booked` tone. Adding a seventh `Button` variant is a WP-6 change to a file
 * this work package does not own, so the three roles are applied here, ONCE,
 * through the props `Button` already exposes for it: `style` for the plate and
 * `children` for the label's colour. The label's SIZE and WEIGHT still come
 * from `Button` — `caption` at 600 is exactly what its `sm` rung sets, and
 * `sansFamily('600')` is `undefined`, so `fontWeight` is the whole of it.
 *
 * If a second component ever needs this treatment, that is the signal to
 * promote it to a real variant rather than copy these four lines.
 */
const ACTION_BUTTON = {
  book: { variant: 'primary' },
  joinWaitlist: { variant: 'primary' },
  booked: { variant: 'secondary', fill: 'booked', border: 'bookedBorder', fg: 'onBooked' },
  waitlisted: { variant: 'secondary' },
} as const;

/** A class, as it appears on home, on classes, and (as a hero) on its own screen. */
export function ClassCard({
  variant = 'default',
  category,
  categoryColor,
  title,
  coverImageUrl = null,
  time,
  meta,
  duration,
  capacity,
  bookedCount,
  spotsLeftLabel,
  fullLabel,
  status = null,
  action,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  className,
}: ClassCardProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();
  const spec = VARIANTS[variant];

  /**
   * The URL that failed, not a boolean.
   *
   * A list recycles this component: a boolean would carry one row's dead image
   * onto the next class scrolled into its place, which is a card silently
   * missing a cover it has. Keyed by URL, a new `coverImageUrl` is simply not
   * the failed one and draws.
   */
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const cover =
    coverImageUrl !== null && coverImageUrl !== '' && coverImageUrl !== failedCover
      ? coverImageUrl
      : null;

  // Over a photograph the two text ladders are fixed rather than themed — see
  // rule 2 in the header. Without a cover these are exactly today's roles.
  const titleColor = cover === null ? undefined : 'onDark';
  const mutedColor = cover === null ? 'textSecondary' : 'onCoverMuted';

  // The same number `Surface` resolves the variant's radius to, so the cover's
  // corners are the card's corners rather than an approximation of them.
  const coverRadius = clampRadiusTo(spec.radius);

  // Derived HERE, so the two screens cannot disagree. See composite-metrics.ts.
  const full = isClassFull(capacity, bookedCount);
  const spotsLabel = full ? fullLabel : spotsLeftLabel;

  const actionState = actionStateFor(status, full);
  const actionLabel = action
    ? {
        book: action.bookLabel,
        joinWaitlist: action.joinWaitlistLabel,
        booked: action.bookedLabel,
        waitlisted: action.waitlistedLabel,
      }[actionState]
    : undefined;

  const pressable = onPress !== undefined;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <View
            {...DECORATIVE}
            style={{
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              backgroundColor: categoryColor,
            }}
          />
          {/* 11 / 600 / uppercase / 0.12em — the `label` role exactly. */}
          <Eyebrow size="label" color={mutedColor} numberOfLines={1} {...DECORATIVE}>
            {category}
          </Eyebrow>
        </View>

        <Heading
          variant={spec.titleVariant}
          color={titleColor}
          numberOfLines={2}
          {...DECORATIVE}
          style={{ marginTop: spacing[2.5], lineHeight: spec.titleLineHeight }}
        >
          {title}
        </Heading>
      </View>

      {/*
        WRAPPED, NOT SPREAD. `DurationBadge` makes itself an accessibility
        element — correctly, since it is one node wherever else it is used —
        and its props are exact, so `{...DECORATIVE}` on it would be silently
        dropped. iOS would group it under the card's label anyway; Android
        keeps a focusable child focusable, which is how a "two node" card
        becomes a three-stop card on half the devices. The wrapper hides the
        subtree on both.
      */}
      {variant === 'default' && duration ? (
        <View {...DECORATIVE}>
          <DurationBadge
            value={duration.value}
            unit={duration.unit}
            accessibilityLabel={duration.accessibilityLabel}
          />
        </View>
      ) : null}
    </View>
  );

  // The meta line. `time` is tabular mono inline; the rest is plain. The middot
  // between them is punctuation the artboards draw, not copy — but it is only
  // emitted when there is something on both sides of it.
  const metaLine =
    variant === 'default' && (time || meta) ? (
      <Text
        variant={spec.metaVariant}
        color={mutedColor}
        {...DECORATIVE}
        style={{ marginTop: spacing[3] }}
      >
        {time ? (
          <Mono variant="monoSmall" color={titleColor}>
            {time}
          </Mono>
        ) : null}
        {time && meta ? ' · ' : null}
        {meta}
      </Text>
    ) : variant === 'hero' && meta ? (
      <Text
        variant={spec.metaVariant}
        color={mutedColor}
        {...DECORATIVE}
        style={{ marginTop: spacing[3] }}
      >
        {meta}
      </Text>
    ) : null;

  /**
   * The hero's two pills — the time range and the length.
   *
   * They live INSIDE the description node rather than beside it, because the
   * hero has no action button for them to sit next to and a pill that
   * announces on its own would make the class-detail header three stops. The
   * caller's `accessibilityLabel` carries what they say.
   */
  const heroPills =
    variant === 'hero' && (time ?? duration) ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          marginTop: spacing[6],
        }}
      >
        {time ? (
          <Pill tone="onAccent" size="md" tabular>
            {time}
          </Pill>
        ) : null}
        {duration ? (
          <Pill tone="quiet" size="md" accessibilityLabel={duration.accessibilityLabel}>
            {duration.value} {duration.unit}
          </Pill>
        ) : null}
      </View>
    ) : null;

  const content = (
    <>
      {header}
      {metaLine}
      {heroPills}
    </>
  );

  /**
   * The cover, as two stacked absolute layers behind everything else.
   *
   * `overflow: 'hidden'` AND a `borderRadius` on the image: the wrapper's clip
   * is what actually rounds the photo, and the radius on the `Image` itself is
   * the Android belt-and-braces `Avatar` documents — a `borderRadius` on an
   * image clips reliably there only when it has a same-radius parent.
   *
   * THE PRESSED STATE MOVES TO THE SCRIM. The card's own pressed tint is
   * painted on the Surface, i.e. UNDER the photograph, so on a covered card it
   * is invisible; the scrim steps from 72% to the sheet scrim's 85% instead.
   * That darkens where the plain card lightens, deliberately — a photo tile
   * that goes lighter under a finger reads as an image still loading.
   */
  const coverLayer =
    cover === null ? null : (
      <View
        {...DECORATIVE}
        testID={testID === undefined ? undefined : `${testID}-cover`}
        style={[StyleSheet.absoluteFill, { borderRadius: coverRadius, overflow: 'hidden' }]}
      >
        <Image
          source={{ uri: cover }}
          resizeMode="cover"
          onError={() => {
            setFailedCover(cover);
          }}
          testID={testID === undefined ? undefined : `${testID}-cover-image`}
          style={[StyleSheet.absoluteFill, { borderRadius: coverRadius }]}
        />
        <View
          testID={testID === undefined ? undefined : `${testID}-cover-scrim`}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: pressed ? colors.scrim : colors.coverScrim },
          ]}
        />
      </View>
    );

  const body = (
    <>
      {pressable ? (
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          {...interactiveA11y({ accessibilityLabel, accessibilityHint })}
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={accessibilityLabel} accessibilityRole="text">
          {content}
        </View>
      )}

      {/*
        THE ACTION ROW — a SIBLING of the pressable region, never a child.
        The hero has none: its screen puts the book button at the bottom and
        its occupancy in a section of its own.
      */}
      {variant === 'hero' ? null : spotsLabel !== undefined || action ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[2],
            marginTop: spacing[4],
          }}
        >
          {/*
            HIDDEN, and its count therefore belongs in `accessibilityLabel`.
            See the header: the pill is visually part of the action row and
            semantically part of the description, and it cannot be both nodes.

            Wrapped rather than spread — `Pill`'s props are exact, so
            `{...DECORATIVE}` on it compiles and does nothing.
          */}
          {spotsLabel === undefined ? null : (
            <View {...DECORATIVE}>
              <Pill tone="quiet" size="md" tabular>
                {spotsLabel}
              </Pill>
            </View>
          )}

          {action && actionLabel !== undefined ? (
            <Button
              label={actionLabel}
              onPress={action.onPress}
              size="sm"
              variant={ACTION_BUTTON[actionState].variant}
              disabled={action.disabled}
              busy={action.busy}
              busyLabel={action.busyLabel}
              testID={action.testID}
              style={
                actionState === 'booked'
                  ? {
                      backgroundColor: colors.booked,
                      borderWidth: layout.hairline,
                      borderColor: colors.bookedBorder,
                    }
                  : null
              }
            >
              {actionState === 'booked' ? (
                <Text variant="caption" color="onBooked" style={{ fontWeight: '600' }}>
                  {actionLabel}
                </Text>
              ) : undefined}
            </Button>
          ) : null}
        </View>
      ) : null}
    </>
  );

  return (
    <Surface
      testID={testID}
      tone="card"
      border
      radius={spec.radius}
      /*
        WITHOUT a cover this is the card exactly as it has always been: the
        padding is the Surface's. WITH one it moves to a wrapper inside, so the
        absolute layers fill the whole card rather than its content box —
        Yoga's inset origin for an absolute child relative to its parent's
        padding is a version-dependent detail, and a cover that is 20pt short
        on every edge on one RN version is not something a render test can see.
      */
      padding={cover === null ? spec.pad : undefined}
      style={[
        pressed ? { backgroundColor: colors.tilePressed } : null,
        cover === null
          ? null
          : {
              overflow: 'hidden',
              ...(variant === 'hero' ? { minHeight: COVER_HERO_MIN_HEIGHT } : null),
            },
        style,
      ]}
      className={className}
    >
      {coverLayer}
      {cover === null ? (
        body
      ) : (
        <View
          style={[
            { padding: spacing[spec.pad] },
            // The hero's cover is a photo hero: the content sits at the bottom
            // of the taller box and the picture fills the band above it.
            variant === 'hero' ? { flex: 1, justifyContent: 'flex-end' } : null,
          ]}
        >
          {body}
        </View>
      )}
    </Surface>
  );
}
