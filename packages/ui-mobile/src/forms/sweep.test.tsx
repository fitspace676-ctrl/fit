// The cross-cutting sweep, extended to WP-6.
//
// ===========================================================================
// WHY THERE ARE TWO SWEEP FILES.
//
// WP-5 wrote `src/primitives/sweep.test.tsx` and it covers the primitives. It
// is not extended in place because `src/primitives/**` is WP-5's boundary and
// this work package does not write there. So this is the same table, the same
// four rules, and the same reason for existing — one row per export, failing
// the moment a new export forgets a rule — over the controls, the frame and
// the navigation.
//
// The regression the pattern exists for is worth restating, because it is the
// only kind of bug a sweep catches and no per-component test does: the old
// package shipped `TabBarIcon` as an EMOJI GLYPH into a design system whose
// own moodboard says "stroke icons, no emoji". Every per-component test was
// written by the person who had just written the component, and shared its
// assumptions. A table does not.
//
// HOW TO ADD A ROW. Every component added in WP-8 and WP-9 gets an entry in
// its own stage's sweep, and every one a finger can land on gets `interactive:
// true`. An export absent from a sweep is an export exempt from the package's
// rules.
// ===========================================================================

import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { MIN_TOUCH_TARGET } from '../internal/hit-slop';
import { Text } from '../primitives/text';
import { TileGrid } from '../layout/grid';
import { Screen } from '../layout/screen';
import { ScrollRail } from '../layout/scroll-rail';
import { SectionHeader } from '../layout/section-header';
import { AppBar } from '../navigation/app-bar';
import { FloatingTabBar, type TabItem } from '../navigation/floating-tab-bar';

import { Button } from './button';
import { Chip } from './chip';
import { QtyStepper } from './qty-stepper';
import { Segmented } from './segmented';
import { StarRating } from './star-rating';
import { Switch, SwitchRow } from './switch';
import { TextField } from './text-field';

const STEPPER_LABELS = { decrease: 'a', increase: 'b', value: 'c' };
const TABS: TabItem[] = [
  { key: 'home', icon: 'home', accessibilityLabel: 'a' },
  { key: 'qr', icon: 'qr', accessibilityLabel: 'b', intercept: true },
];

interface SweepRow {
  name: string;
  render: (props: { testID: string; style: object; className: string }) => ReactElement;
  /**
   * Can a finger land on it? Interactive rows carry two extra obligations: an
   * `accessibilityRole`, and a touch target of at least 44pt once the
   * component's own hit slop is applied.
   */
  interactive?: boolean;
  /** The a11y role this export must announce, when it announces one. */
  role?: string;
  /**
   * Where the touch target is NOT the root — a stepper's two buttons, a
   * field's input. The 44pt rule is checked on these instead.
   */
  targets?: string[];
  /** Rows whose root is not itself the labelled control. */
  unlabelled?: boolean;
}

/**
 * Every component WP-6 exports.
 *
 * The props each row passes are the MINIMUM the component's types accept — so
 * if a required prop is ever dropped (say `accessibilityLabel` stops being
 * required on a `TabItem`), this table still compiles and the label assertion
 * below is what catches it.
 */
const EXPORTS: SweepRow[] = [
  {
    name: 'Button',
    render: (p) => <Button label="დაჯავშნა" onPress={jest.fn()} {...p} />,
    interactive: true,
    role: 'button',
  },
  {
    name: 'Chip',
    render: (p) => <Chip label="ყველა" onPress={jest.fn()} {...p} />,
    interactive: true,
    role: 'button',
  },
  {
    name: 'Switch',
    render: (p) => <Switch label="Push" checked onChange={jest.fn()} {...p} />,
    interactive: true,
    role: 'switch',
  },
  {
    name: 'SwitchRow',
    render: (p) => <SwitchRow label="Push" checked onChange={jest.fn()} {...p} />,
    interactive: true,
    role: 'switch',
  },
  {
    name: 'QtyStepper',
    render: (p) => <QtyStepper value={2} onChange={jest.fn()} labels={STEPPER_LABELS} {...p} />,
    interactive: true,
    role: 'adjustable',
    // The container is 44, but a finger aims at the 36pt circles inside it.
    targets: ['sweep-root-decrease', 'sweep-root-increase'],
  },
  {
    name: 'Segmented',
    render: (p) => (
      <Segmented
        label="ხედი"
        value="a"
        onChange={jest.fn()}
        options={[
          { value: 'a', label: 'დღეს' },
          { value: 'b', label: 'კვირა' },
        ]}
        {...p}
      />
    ),
    interactive: true,
    role: 'radiogroup',
    // The group is a `radiogroup`; the options are what a finger lands on.
    targets: ['sweep-root-a', 'sweep-root-b'],
  },
  {
    name: 'StarRating',
    render: (p) => (
      <StarRating
        value={3}
        onChange={jest.fn()}
        labels={{
          value: 'შენი შეფასება',
          valueText: (rating) => `${String(rating)} 5-დან`,
          empty: 'შეფასება ჯერ არ არის არჩეული',
          star: (rating) => `${String(rating)} ვარსკვლავი`,
        }}
        {...p}
      />
    ),
    interactive: true,
    role: 'adjustable',
    // The group is `adjustable`; a finger lands on the 36pt stars inside it.
    targets: ['sweep-root-1', 'sweep-root-5'],
  },
  {
    name: 'TextField',
    render: (p) => <TextField label="ელფოსტა" {...p} />,
    // Deliberately NOT `interactive`. A `TextInput` announces itself, and the
    // ROOT here is the wrapper that also carries the label, the hint and the
    // error — giving that a role and a state would make the field announce
    // twice. The 44pt rule still applies, to the field's box.
    unlabelled: true,
    targets: ['sweep-root-box'],
  },
  {
    name: 'Screen',
    render: (p) => (
      <Screen {...p}>
        <Text>x</Text>
      </Screen>
    ),
  },
  {
    name: 'SectionHeader',
    render: (p) => <SectionHeader title="მიღწევები" {...p} />,
  },
  {
    name: 'ScrollRail',
    render: (p) => (
      <ScrollRail {...p}>
        <View />
      </ScrollRail>
    ),
  },
  {
    name: 'TileGrid',
    render: (p) => (
      <TileGrid {...p}>
        <Text>x</Text>
      </TileGrid>
    ),
  },
  {
    name: 'AppBar',
    render: (p) => <AppBar title="მაღაზია" {...p} />,
  },
  {
    name: 'FloatingTabBar',
    render: (p) => (
      <FloatingTabBar
        items={TABS}
        activeKey="home"
        onSelect={jest.fn()}
        accessibilityLabel="ნავიგაცია"
        {...p}
      />
    ),
    role: 'tablist',
    // The bar is a `tablist`; the tabs are the targets.
    targets: ['sweep-root-home', 'sweep-root-qr'],
  },
];

const PROPS = { testID: 'sweep-root', style: { marginTop: 7 }, className: 'mt-2' };

/** Every WP-6 component needs a label, except where the row says otherwise. */
const LABELLED = EXPORTS.filter((row) => !row.unlabelled && (row.interactive ?? row.role));

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

/**
 * Every row renders under a zero-inset safe area.
 *
 * `Screen` and `FloatingTabBar` read the insets, and `useSafeAreaInsets`
 * THROWS with no provider above it — which both components deliberately do not
 * call, for that reason. Providing zeros here keeps the sweep asserting the
 * artboards' own no-inset geometry rather than a device's.
 */
function renderRow(row: SweepRow): RenderResult {
  return render(
    <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}>
      {row.render(PROPS)}
    </SafeAreaInsetsContext.Provider>,
  );
}

describe('every WP-6 export', () => {
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

  // RULE 1. No component ships copy — so every labelled control's name came
  // from a required prop, and a control with no name at all is the failure
  // this rule exists to make impossible.
  it.each(LABELLED)('$name carries the label the caller gave it', (row) => {
    const view = renderRow(row);
    const label: unknown = view.getByTestId(PROPS.testID).props.accessibilityLabel;
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  });

  it.each(EXPORTS.filter((r) => r.interactive))('$name reports its disabled state', (row) => {
    const view = renderRow(row);
    // Always present, even when false: a state object that appears only once
    // something is set makes the announcement change shape mid-interaction.
    expect(view.getByTestId(PROPS.testID).props.accessibilityState).toBeDefined();
  });
});

describe('every WP-6 touch target', () => {
  /** Every node the 44pt floor applies to: the root, or the row's overrides. */
  const TARGETS = EXPORTS.filter((r) => r.interactive ?? r.targets).flatMap((row) =>
    (row.targets ?? [PROPS.testID]).map((testID) => ({ name: row.name, row, testID })),
  );

  it('there is at least one, so these assertions are not vacuous', () => {
    // A filter that silently matches nothing is a green test that checks
    // nothing — the failure mode this whole file exists to avoid.
    expect(TARGETS.length).toBeGreaterThan(0);
  });

  // THE 44pt FLOOR, asserted from outside the components that implement it.
  // Every one of these is under 44 at some size (a 29pt `sm` button, a 28pt
  // switch track, a 36pt stepper circle, a 36pt segmented option) and pays for
  // it with `hitSlopFor` rather than leaving it to a call site.
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
