// The cross-cutting sweep, extended to WP-8b.
//
// ===========================================================================
// WHY THERE IS A THIRD SWEEP FILE.
//
// WP-5 wrote `src/primitives/sweep.test.tsx` and WP-6 wrote
// `src/forms/sweep.test.tsx`. Neither is extended in place, because neither
// directory is this work package's to write. So this is the same table, the
// same rules and the same reason for existing — one row per export, failing
// the moment a new export forgets a rule — over the feedback layer.
//
// The regression the pattern exists for is the one no per-component test
// catches, because a per-component test is written by the person who has just
// written the component and shares its assumptions: the old package shipped an
// EMOJI tab glyph into a design system whose own moodboard says "stroke icons,
// no emoji", and every one of its tests was green.
//
// HOW TO ADD A ROW. Every WP-9 composite gets an entry in its own stage's
// sweep, and every one a finger can land on gets `interactive: true` or names
// its `targets`. An export absent from a sweep is an export exempt from the
// package's rules.
//
// `ToastProvider` is deliberately NOT here. It renders no box of its own — it
// is a context provider whose toast appears only after a call — so there is no
// root node for `testID`, `style` or `className` to reach. Its own file tests
// the pill, which is the thing with a role, a label and a touch target.
// ===========================================================================

import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text as RNText } from 'react-native';

import { MIN_TOUCH_TARGET } from '../internal/hit-slop';

import { Alert, InlineNote } from './alert';
import { ConfirmSheet } from './confirm-sheet';
import { EmptyState } from './empty-state';
import { OccupancyMeter, Pips, ProgressBar, ProgressRing } from './progress';
import { Sheet } from './sheet';

interface SweepRow {
  name: string;
  render: (props: { testID: string; style: object; className: string }) => ReactElement;
  /** Can a finger land on the ROOT? */
  interactive?: boolean;
  /** The a11y role this export must announce, when it announces one. */
  role?: string;
  /** Where the touch target is not the root — a sheet's close, a CTA. */
  targets?: string[];
  /** Rows whose accessible name is their own visible text, not a prop. */
  unlabelled?: boolean;
}

const SHEET = {
  open: true as const,
  onClose: jest.fn(),
  title: 'ჩექ-ინი',
  closeAccessibilityLabel: 'დახურვა',
};

/**
 * Every component WP-8b exports.
 *
 * Each row passes the MINIMUM its types accept — so if a required prop is ever
 * dropped (say `accessibilityLabel` stops being required on `ProgressBar`),
 * this table still compiles and the label assertion below is what catches it.
 */
const EXPORTS: SweepRow[] = [
  {
    name: 'ProgressBar',
    render: (p) => <ProgressBar value={42} accessibilityLabel="ადგილები" {...p} />,
    role: 'progressbar',
  },
  {
    name: 'OccupancyMeter',
    render: (p) => (
      <OccupancyMeter booked={14} capacity={20} accessibilityLabel="ადგილები" {...p} />
    ),
    role: 'progressbar',
  },
  {
    name: 'ProgressRing',
    render: (p) => <ProgressRing value={73} accessibilityLabel="პერიოდი" {...p} />,
    role: 'progressbar',
  },
  {
    name: 'Pips',
    render: (p) => <Pips filled={2} accessibilityLabel="PT კრედიტი" {...p} />,
    role: 'progressbar',
  },
  {
    name: 'Alert',
    render: (p) => <Alert title="Premium 8 დღეში სრულდება" {...p} />,
    role: 'alert',
    // An advisory's accessible name IS its visible title, which is a required
    // prop — see the `accessible` note in `alert.tsx`.
    unlabelled: true,
  },
  {
    name: 'InlineNote',
    render: (p) => <InlineNote {...p}>გაუქმება უფასოა 2 საათამდე.</InlineNote>,
    role: 'alert',
    unlabelled: true,
  },
  {
    name: 'EmptyState',
    render: (p) => (
      <EmptyState
        title="დღეს გაკვეთილები არ არის"
        action={{ label: 'ყველა', onPress: jest.fn(), testID: 'sweep-root-action' }}
        {...p}
      />
    ),
    targets: ['sweep-root-action'],
  },
  {
    name: 'Sheet',
    render: (p) => (
      <Sheet {...SHEET} {...p}>
        <RNText>body</RNText>
      </Sheet>
    ),
    // The panel is not itself a control; the close button in its header is.
    targets: ['sweep-root-close'],
  },
  {
    name: 'ConfirmSheet',
    render: (p) => (
      <ConfirmSheet
        {...SHEET}
        onConfirm={jest.fn()}
        confirmLabel="დადასტურება"
        cancelLabel="დახურვა"
        {...p}
      />
    ),
    targets: ['sweep-root-close', 'sweep-root-cancel', 'sweep-root-confirm'],
  },
];

const PROPS = { testID: 'sweep-root', style: { marginTop: 7 }, className: 'mt-2' };

/** Every WP-8b component needs a label, except where the row says otherwise. */
const LABELLED = EXPORTS.filter((row) => !row.unlabelled && (row.interactive ?? row.role));

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

function renderRow(row: SweepRow): RenderResult {
  return render(row.render(PROPS));
}

describe('every WP-8b export', () => {
  // RULE 2. Maestro drives this app entirely by `testID` — the flows are
  // locale-independent by construction, so a selector is the ONLY handle they
  // have. A component that swallows `testID` gets re-implemented locally by
  // the first person who needs one.
  it.each(EXPORTS)('$name forwards testID to its root node', (row) => {
    const view = renderRow(row);
    expect(view.getByTestId(PROPS.testID)).toBeTruthy();
  });

  // RULE 3. A component the screen cannot nudge is a component the screen
  // forks — and a forked component is how this package reached zero consumers
  // last time. `style` is applied LAST, after everything the component set.
  it.each(EXPORTS)('$name lets style through, last', (row) => {
    const view = renderRow(row);
    expect(flatten(view.getByTestId(PROPS.testID).props.style).marginTop).toBe(7);
  });

  it.each(EXPORTS)('$name accepts className', (row) => {
    // NativeWind resolves `className` through the Babel transform, so the
    // assertion is that the prop is ACCEPTED and does not displace the
    // component's own styling.
    const view = renderRow(row);
    expect(view.getByTestId(PROPS.testID)).toBeTruthy();
  });

  it.each(EXPORTS.filter((r) => r.role))('$name announces its role', (row) => {
    const view = renderRow(row);
    expect(view.getByTestId(PROPS.testID).props.accessibilityRole).toBe(row.role);
  });

  // RULE 1. No component ships copy — so every labelled node's name came from
  // a required prop, and a node with no name at all is the failure this rule
  // exists to make impossible.
  it.each(LABELLED)('$name carries the label the caller gave it', (row) => {
    const view = renderRow(row);
    const label: unknown = view.getByTestId(PROPS.testID).props.accessibilityLabel;
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  });

  // Every progressbar reports a value, and it is inside its own range. An
  // `accessibilityValue.now` outside `[min, max]` is announced wrong on iOS
  // and dropped on Android, and neither failure appears on screen.
  it.each(EXPORTS.filter((r) => r.role === 'progressbar'))(
    '$name reports an in-range accessibilityValue',
    (row) => {
      const view = renderRow(row);
      const value = view.getByTestId(PROPS.testID).props.accessibilityValue as {
        min: number;
        max: number;
        now: number;
      };
      expect(typeof value.now).toBe('number');
      expect(Number.isNaN(value.now)).toBe(false);
      expect(value.now).toBeGreaterThanOrEqual(value.min);
      expect(value.now).toBeLessThanOrEqual(value.max);
    },
  );
});

describe('every WP-8b touch target', () => {
  /** Every node the 44pt floor applies to: the root, or the row's overrides. */
  const TARGETS = EXPORTS.filter((r) => r.interactive ?? r.targets).flatMap((row) =>
    (row.targets ?? [PROPS.testID]).map((testID) => ({ name: row.name, row, testID })),
  );

  it('there is at least one, so these assertions are not vacuous', () => {
    // A filter that silently matches nothing is a green test that checks
    // nothing — the failure mode this whole file exists to avoid.
    expect(TARGETS.length).toBeGreaterThan(0);
  });

  it.each(TARGETS)('$name / $testID clears the 44pt touch target', ({ row, testID }) => {
    const view = renderRow(row);
    const node = view.getByTestId(testID);
    const style = flatten(node.props.style);
    const height = Number(style.height ?? style.minHeight ?? 0);
    const width = Number(style.width ?? style.minWidth ?? 0);
    const slop = (node.props.hitSlop ?? { top: 0, bottom: 0, left: 0, right: 0 }) as {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };

    expect(height).toBeGreaterThan(0);
    expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    // A width of 0 means "stretches to its container", which is what a
    // full-width row does and is not a failure.
    if (width > 0) {
      expect(width + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });
});
