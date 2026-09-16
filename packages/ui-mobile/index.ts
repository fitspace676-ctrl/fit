// @fit/ui-mobile — the mobile design system.
//
// One barrel, so a screen imports from `@fit/ui-mobile` and nothing else. The
// last package leaked its internals through deep paths, which is part of how
// half the app ended up on a second, local kit.
//
// WHAT MAY LIVE BEHIND THIS BARREL. A component belongs in this package iff it
// can be fully specified by the artboards WITHOUT naming a backend field, a
// route, an i18n key or a query hook. Every label — including every
// `accessibilityLabel` — is a required prop. No component in here ships copy.
// The eslint import-ban (`@fit/types`, `@fit/i18n`, `expo-router`,
// `@tanstack/react-query` are all banned under `src/**`) is what enforces it
// mechanically; this paragraph is why.

// ============================================================================
// Tokens (WP-1) — the whole public surface today.
// ============================================================================
export * from './src/tokens';

// ============================================================================
// Components — NOT YET SHIPPED.
//
// This section is deliberately empty and deliberately marked. The stages that
// fill it, in dependency order:
//
//   WP-5  src/primitives/**   Icon · Text/Heading/Eyebrow/Mono/Money ·
//                             Surface/Card · IconButton · Pill/CountBadge/
//                             DotBadge · Divider/Avatar/Spinner/Skeleton
//   WP-6  src/forms/**        Button · Chip · Switch · QtyStepper ·
//                             TextField
//         src/layout/**       Screen · ScreenHeader · SectionHeader ·
//                             ScrollRail · TileGrid
//         src/navigation/**   FloatingTabBar
//   WP-8  src/data-display/** StatTile · DurationBadge · ListRow · FactTile ·
//                             PersonRow · ProductRow · DayCell · AchievementTile
//         src/feedback/**     ProgressBar/OccupancyMeter/ProgressRing/Pips ·
//                             Alert · EmptyState · Sheet · ConfirmSheet ·
//                             ToastProvider
//   WP-9  src/composites/**   ClassCard · MembershipBlock · CheckInPass · QrCode
//
// `Text` lands FIRST in WP-5 and is non-negotiable. RN `<Text>` inherits
// nothing, so without a text primitive every screen hand-writes
// `{fontSize, fontWeight, color, letterSpacing}` — and once a screen is doing
// that, a `Card` from the package buys it nothing and a local kit is born. That
// is the documented root cause of the last package having zero consumers.
//
// Add exports below this line as each stage lands. Keep them grouped by stage
// so a reviewer can see at a glance what a PR is claiming to have finished.
// ============================================================================

// ----------------------------------------------------------------------------
// WP-5 · Primitives.
//
// `Text` and its family are the centre of this stage, not an afterthought —
// see the header of `src/primitives/text.tsx` for the failure they exist to
// prevent. Everything below is subject to the three package rules:
//
//   1. No copy. Every label, INCLUDING every `accessibilityLabel`, is a prop,
//      and on the controls that cannot work without one it is a REQUIRED prop
//      (`IconButton`, `Spinner`, `Money`) so omitting it fails `type-check`.
//   2. `testID` forwards to the root node of every interactive component.
//      The smoke suite drives the app by these selectors; a component that
//      swallows `testID` gets re-implemented locally.
//   3. `style` and `className` both pass through, always last. A component the
//      screen cannot nudge is a component the screen forks.
//
// `src/primitives/*.test.tsx` asserts all three across every export here.
// ----------------------------------------------------------------------------

// Icon.
export {
  Icon,
  ICON_DEFAULT_SIZE,
  ICON_STROKE_WIDTH,
  resolveColor,
} from './src/primitives/icon/icon';
export {
  ICON_PATHS,
  ICON_NAMES,
  ICON_MOBILE_ONLY,
  ICON_WEB_DIVERGENCE,
  type IconName,
} from './src/primitives/icon/paths';
export type { ColorValue, IconProps } from './src/primitives/icon/types';

// Text.
export {
  Text,
  Heading,
  Eyebrow,
  Mono,
  Money,
  type TextProps,
  type TextVariant,
  type HeadingLevel,
  type HeadingProps,
  type EyebrowProps,
  type EyebrowSize,
  type MonoProps,
  type MonoVariant,
  type MoneyProps,
} from './src/primitives/text';

// Surface.
export { Surface, Card, type SurfaceProps, type SurfaceTone } from './src/primitives/surface';

// Controls.
export { IconButton, type IconButtonProps, type IconButtonVariant } from './src/forms/icon-button';

// Pills and badges.
export {
  Pill,
  CountBadge,
  DotBadge,
  type BadgeSpec,
  type CountBadgeProps,
  type DotBadgeProps,
  type PillProps,
  type PillSize,
  type PillTone,
} from './src/feedback/pill';

// The small stuff.
export { Divider, type DividerProps } from './src/primitives/divider';
export {
  Avatar,
  type AvatarProps,
  type AvatarRing,
  type AvatarSize,
} from './src/primitives/avatar';
export { Spinner, type SpinnerProps } from './src/primitives/spinner';
export { Skeleton, type SkeletonProps } from './src/primitives/skeleton';

// Shared internals that a screen legitimately needs.
//
// `hitSlopFor` is exported so the app's OWN controls can meet the same 44pt
// floor, and `clampRadiusTo` so a screen composing a fixed-height row can
// clamp its own radius. Both are pure and Vitest-tested. Nothing else from
// `src/internal/**` is public.
export {
  hitSlopFor,
  slopFor,
  touchTargetFor,
  MIN_TOUCH_TARGET,
  type HitSlop,
} from './src/internal/hit-slop';
export { clampRadiusTo } from './src/internal/clamp-radius';

// ----------------------------------------------------------------------------
// WP-6 · Controls, frame and navigation.
//
// The three things in this stage that are NOT visible on the 390pt artboard
// canvas, and are therefore the three things most likely to be undone by a
// later edit that "looks equivalent":
//
//   1. The floating capsule OVERFLOWS a 320pt device at five items — 5 × 56 +
//      2 × 8 = 296 against 320 − 40 = 280. `capsuleMetricsFor` shrinks it
//      below 340pt. The app ships four tabs today (240, which fits), but the
//      branch is what keeps a fifth from clipping silently.
//   2. `bottom-6` is 24 from the screen edge, which on a home-indicator phone
//      is ON the indicator. `tabBarBottomOffset` computes it from the inset,
//      and `useTabBarInset()` is 128 at inset 0 — the artboards' own `pb-32`.
//   3. No artboard has a keyboard. Every scroll container here sets
//      `keyboardShouldPersistTaps="handled"`, `Screen` wraps in a
//      `KeyboardAvoidingView` on iOS ONLY, and `FloatingTabBar` unmounts
//      itself while the keyboard is up.
//
// All three are asserted — the arithmetic in `src/layout/metrics.spec.ts` on
// Vitest, the behaviour in `src/forms/*.test.tsx` on jest-expo.
// ----------------------------------------------------------------------------

// Controls.
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './src/forms/button';
export {
  Chip,
  type ChipProps,
  type ChipSelectedFill,
  type ChipSize,
  type ChipTone,
} from './src/forms/chip';
export { Switch, SwitchRow, type SwitchProps, type SwitchRowProps } from './src/forms/switch';
export { QtyStepper, type QtyStepperProps, type QtyStepperSize } from './src/forms/qty-stepper';
export { Segmented, type SegmentedOption, type SegmentedProps } from './src/forms/segmented';
// `StarRating` — the write side of the star row the trainer profile reads. Added
// by C5's review composer; a rating INPUT cannot borrow the read-only row's
// trick of labelling the whole run, because it has to be operable as well as
// legible. See the header of `src/forms/star-rating.tsx`.
export {
  StarRating,
  STAR_MAX,
  STAR_MIN,
  STAR_UNRATED,
  type StarRatingLabels,
  type StarRatingProps,
} from './src/forms/star-rating';
export { TextField, type TextFieldProps } from './src/forms/text-field';

// The frame.
export { Screen, type ScreenProps, type ScreenTone } from './src/layout/screen';
export {
  SectionHeader,
  type SectionHeaderAction,
  type SectionHeaderProps,
  type SectionHeaderSize,
} from './src/layout/section-header';
export { ScrollRail, type ScrollRailProps } from './src/layout/scroll-rail';
export { TileGrid, type TileGridProps } from './src/layout/grid';

// Navigation.
export {
  FloatingTabBar,
  useKeyboardVisible,
  useSafeInsets,
  useTabBarInset,
  type FloatingTabBarProps,
  type TabItem,
} from './src/navigation/floating-tab-bar';
export { AppBar, type AppBarAlign, type AppBarProps } from './src/navigation/app-bar';

// The layout arithmetic, exported so a screen that scrolls OUTSIDE `Screen`
// (a `FlatList` screen) can reserve the same space, and so `apps/mobile` can
// place the tab bar the navigator mounts. Pure, and Vitest-tested; nothing
// else from `src/layout/metrics.ts` is worth a screen's attention.
export {
  capsuleMetricsFor,
  headerTopFor,
  tabBarBottomOffset,
  tabBarInset,
  CAPSULE_HEIGHT,
  COMPACT_WIDTH,
  SCREEN_GUTTER,
  TAB_BAR_CLEARANCE,
  TAB_BAR_EDGE_OFFSET,
  TAB_ITEM_SIZE,
  type CapsuleMetrics,
} from './src/layout/metrics';

// ----------------------------------------------------------------------------
// WP-8a · Data display.
//
// Eight components, all of them the same kind of thing: a fixed piece of the
// artboards that appears more than once, with every string it shows arriving
// as a prop. Nothing here fetches, routes, formats money or knows a locale.
//
// THE THREE THINGS IN THIS STAGE THAT ARE INVISIBLE IN A SCREENSHOT, and are
// therefore the three most likely to be undone by a later edit that "looks
// equivalent":
//
//   1. `StatTile`, `FactTile`, `DurationBadge`, `AchievementTile` and
//      `DayCell` are each ONE accessibility node. Split into their visible
//      parts — which is literally what the artboard markup is — VoiceOver
//      reads "one eight" and then, as an unrelated stop, "day streak": the
//      figure spelled digit by digit because it is a tabular monospace run,
//      and the caption detached from what it captions.
//
//   2. Two of them carry information that has NO TEXT AT ALL.
//      `AchievementTile`'s earned state is a colour swap and nothing else, so
//      it takes a required `statusLabel` and surfaces it as
//      `accessibilityValue`. `DayCell`'s dot is the only thing that says
//      whether a day has classes, so its `accessibilityLabel` is required and
//      must spell the whole sentence out ("Thursday 6, 4 classes").
//
//   3. `ProductRow` narrows its pressable region the moment it is given a
//      `trailing` control, so the shop's qty stepper is never a button nested
//      inside a button.
//
// `src/data-display/sweep.test.tsx` extends WP-5's sweep to every export
// below; the per-component behaviour is in the co-located `*.test.tsx` files.
// ----------------------------------------------------------------------------

export {
  StatTile,
  type StatTileLabelPosition,
  type StatTileProps,
  type StatTileVariant,
} from './src/data-display/stat-tile';
export { FactTile, type FactTileProps } from './src/data-display/fact-tile';
export { ListRow, type ListRowProps } from './src/data-display/list-row';
export {
  PersonRow,
  type PersonRowAction,
  type PersonRowProps,
} from './src/data-display/person-row';
export {
  ProductRow,
  type ProductRowLayout,
  type ProductRowProps,
} from './src/data-display/product-row';
export { DurationBadge, type DurationBadgeProps } from './src/data-display/duration-badge';
export { AchievementTile, type AchievementTileProps } from './src/data-display/achievement-tile';
export { DayCell, DAY_CELL_WIDTH, type DayCellProps } from './src/data-display/day-cell';

// ----------------------------------------------------------------------------
// WP-8b · Feedback.
//
// Four ways of drawing one number, two advisories, an empty state that is also
// the ERROR state, the bottom sheet, and the toast host.
//
// THREE THINGS HERE ARE NOT OBVIOUS FROM THE PROP NAMES:
//
//   1. `occupancyTone` is exported as a PURE FUNCTION, not just baked into
//      `OccupancyMeter`. The >=100 / >85 / else thresholds appear in three
//      places in the design, and a screen that needs to colour the "3 spots
//      left" line beside the meter must ask, not re-derive. `OCCUPANCY_TONE_ROLE`
//      is the one tone->role mapping.
//
//   2. `Sheet` is SINGLE-INSTANCE PER SCREEN and the component cannot enforce
//      it. Two overlapping `Modal`s flash black on iOS, so a screen that can
//      open more than one sheet holds ONE `sheet: <name> | null` state rather
//      than a boolean apiece. See the header of `sheet.tsx` for that and for
//      the other five sheet pitfalls.
//
//   3. `EmptyState` IS the error state (plan item G-05) — no artboard draws a
//      failed load, and a toast is never one, because it auto-dismisses. Pass
//      `icon="info"` and a retry `action`. (There is no warning-triangle glyph
//      in the 60-icon dictionary; adding one is a WP-5 change plus a line on
//      the `ICON_WEB_DIVERGENCE` ledger.)
//
// `src/feedback/sweep.test.tsx` extends the WP-5/WP-6 sweep to every component
// below; `feedback-metrics.spec.ts` holds the arithmetic, on Vitest.
// ----------------------------------------------------------------------------

// Progress.
export {
  ProgressBar,
  OccupancyMeter,
  ProgressRing,
  Pips,
  OCCUPANCY_TONE_ROLE,
  type ProgressBarProps,
  type ProgressTone,
  type OccupancyMeterProps,
  type ProgressRingProps,
  type PipsProps,
} from './src/feedback/progress';

// Advisories.
export {
  Alert,
  InlineNote,
  ADVISORY_ICON_SIZE,
  type AlertProps,
  type AlertTone,
  type InlineNoteProps,
} from './src/feedback/alert';

// Empty — and, per plan item G-05, error.
export {
  EmptyState,
  type EmptyStateAction,
  type EmptyStateLayout,
  type EmptyStateProps,
} from './src/feedback/empty-state';

// Sheets.
export { Sheet, type SheetProps } from './src/feedback/sheet';
export {
  ConfirmSheet,
  SHEET_FOOTER_HALF,
  SHEET_FOOTER_SHARE,
  type ConfirmSheetProps,
} from './src/feedback/confirm-sheet';

// Toast. The API is the salvaged one, verbatim; the visual and the anchor are
// not — see the header of `toast-provider.tsx`.
export { ToastProvider, type ToastProviderProps } from './src/feedback/toast/toast-provider';
export { useToast, type ToastApi, type ToastVariant } from './src/feedback/toast/use-toast';

// The feedback layer's pure arithmetic, exported for the same reason
// `layout/metrics.ts` is: a screen that composes its own meter, its own sheet
// footer or its own toast-adjacent chrome must ask for the numbers rather than
// re-derive them. Nothing else from `feedback-metrics.ts` is public.
export {
  occupancyTone,
  occupancyToneFor,
  occupancyPercent,
  clampToRange,
  progressFraction,
  progressPercent,
  sheetBottomPad,
  toastBottomOffset,
  weightedType,
  OCCUPANCY_FULL,
  OCCUPANCY_TIGHT,
  PROGRESS_BAR_HEIGHT,
  SHEET_ENTER_MS,
  SHEET_EXIT_MS,
  SHEET_MAX_HEIGHT_RATIO,
  SHEET_RADIUS,
  TOAST_AUTO_HIDE_MS,
  type OccupancyTone,
  type SansTypeRole,
} from './src/feedback/feedback-metrics';

// ----------------------------------------------------------------------------
// WP-9 · Composites. The last stage.
//
// Four components, and the bar they had to clear is higher than WP-8's: each
// appears on MORE THAN ONE SCREEN WITH IDENTICAL VISUALS. `ClassCard` is home
// + classes (+ a hero on class detail), `MembershipBlock` is home + profile.
// Left app-local, every one of them would have been built twice — which is
// exactly what produced two tab bars last time.
//
// TWO OF THE FOUR ARE PARKED. `CheckInPass` and `QrCode` have had NO CONSUMER
// since 2026-08-31: Q1 closed the other way (no scanner integration, and the
// only check-in surface on the API is `@Controller('admin/check-ins')` behind
// `MemberRead`/`MemberWrite`), so `apps/mobile`'s QR screen was removed. They
// stay, exported and tested, because the encoder under them shipped two silent
// bugs that were found and fixed against an independent implementation, and a
// re-port would re-introduce both. Their file headers carry the full note.
// Bringing them back costs one screen. See `docs/mobile-rebuild-plan.md` §7.
//
// THREE THINGS HERE ARE DECISIONS, NOT TRANSCRIPTIONS:
//
//   1. `CheckInPass` LEADS WITH THE MEMBER ID, NOT THE CODE, AND SHIPS NO
//      COUNTDOWN. Decision Q1 closed: there is no scanner side and no
//      member-scoped check-in endpoint exists, so the QR is an identity claim,
//      not a credential. A receptionist typing `FC-4821` is the flow that
//      works today; a "refreshes in 0:47" timer would tell the member the code
//      expires and is therefore secure, and neither is true. The `qr`
//      namespace's `refreshesIn` key stays unused.
//
//   2. `MembershipBlock` TAKES NO STATUS ENUM. `statusLine` and `statusPill`
//      are strings, so `ACTIVE`/`FROZEN`/`PAST_DUE` never enters this package
//      and one component serves both screens.
//
//   3. `ClassCard` DERIVES `spotsLeft` AND `full` ITSELF, from `capacity` and
//      `bookedCount`, and takes ALL FOUR action labels. Home and classes word
//      the same waitlist state differently — which is why the labels are
//      props — but they must never disagree about which state it IS, which is
//      why the arithmetic is not.
//
//   4. `ClassCard`'s `coverImageUrl` IS NULLABLE AND NULL IS THE COMMON CASE.
//      Most classes carry no photograph, so a null cover renders the card
//      exactly as it is drawn without one — no image node, no placeholder — and
//      a URL that fails to load degrades to that same card rather than to a
//      broken-image plate. Over a cover the text ladders move to the two fixed
//      stops (`onDark`, `onCoverMuted`) because the scrim, not the theme, is
//      what they are read against. The contrast arithmetic is in the
//      component's header and asserted in `tokens/tokens.spec.ts`.
//
// The QR ENCODER is not exported and never will be: nothing outside
// `src/composites/qr/` needs a module matrix. It is a hand-rolled port of
// Nayuki's generator, and `qr/qrcode.spec.ts` pins it against golden vectors
// from an independent implementation — which is how the two silent placement
// bugs it shipped with were found. Read that spec's header before touching it.
// ----------------------------------------------------------------------------

export {
  ClassCard,
  type ClassCardAction,
  type ClassCardDuration,
  type ClassCardProps,
  type ClassCardStatus,
  type ClassCardVariant,
} from './src/composites/class-card';

export {
  MembershipBlock,
  type MembershipBlockAction,
  type MembershipBlockHighlight,
  type MembershipBlockProps,
} from './src/composites/membership-block';

// PARKED (2026-08-31) — no consumer in `apps/mobile`. See the note above and
// the file headers; the tests stay green either way.
export {
  CheckInPass,
  type CheckInPassCopyAction,
  type CheckInPassMember,
  type CheckInPassMemberId,
  type CheckInPassProps,
  type CheckInPassTrailing,
} from './src/composites/check-in-pass';

// PARKED (2026-08-31) — see `CheckInPass` above.
export {
  QrCode,
  QR_DEFAULT_SIZE,
  QR_QUIET_ZONE,
  type EcLevel,
  type QrCodeProps,
} from './src/composites/qr/qr-code';

// The occupancy arithmetic a class card runs on, exported for the same reason
// `layout/metrics.ts` and `feedback-metrics.ts` are: the screen needs the same
// number the card does — to interpolate it into "3 ადგილი დარჩა", which is
// copy and therefore the caller's — and a screen that recomputes it is a
// screen that can disagree with the card.
export { isClassFull, spotsLeftFor } from './src/composites/composite-metrics';
