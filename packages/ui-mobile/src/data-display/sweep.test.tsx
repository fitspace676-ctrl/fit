// The WP-8a half of the cross-cutting sweep.
//
// ===========================================================================
// WHY THIS EXISTS SEPARATELY FROM `src/primitives/sweep.test.tsx`.
//
// §5 of the rebuild plan asks for ONE sweep over every barrel export checking
// that `testID` reaches the root, that `accessibilityRole` is set, and that
// `minHeight + hitSlop >= 44`. WP-5 wrote that file and owns it; WP-6, WP-8
// and WP-9 own different directories and cannot edit it concurrently without
// three agents fighting over one table. So the PATTERN is extended rather than
// the file: same table, same assertions, one per stage.
//
// The regression it generalises is WP-5's: the old package shipped an EMOJI
// tab icon into a design system whose own moodboard says "stroke icons, no
// emoji", and no per-component test caught it — because every per-component
// test was written by the person who had just written the component and shared
// its assumptions. A sweep does not share them. Every export added here gets a
// row, and an export with no row is an export exempt from the package's rules.
// ===========================================================================

import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { MIN_TOUCH_TARGET } from '../internal/hit-slop';

import { AchievementTile } from './achievement-tile';
import { DayCell } from './day-cell';
import { DurationBadge } from './duration-badge';
import { FactTile } from './fact-tile';
import { ListRow } from './list-row';
import { PersonRow } from './person-row';
import { ProductRow } from './product-row';
import { StatTile } from './stat-tile';

const HIDDEN = { includeHiddenElements: true } as const;

interface SweepRow {
  name: string;
  render: (props: { testID: string; style: object; className: string }) => ReactElement;
  /**
   * Can a finger land on it? Interactive rows carry two extra obligations: an
   * `accessibilityRole`, and a touch target of at least 44pt once the
   * component's own hit slop is applied.
   */
  interactive?: boolean;
  /** The a11y role this export must announce. */
  role?: string;
  /**
   * Components that are a SINGLE accessibility node hide their own subtree,
   * but the ROOT still announces — so none of these is `hidden`. A row marked
   * hidden would be one whose root is out of the tree entirely, and this stage
   * ships none.
   */
}

/** Every component WP-8a adds to the barrel. */
const EXPORTS: SweepRow[] = [
  {
    name: 'StatTile',
    render: (p) => <StatTile label="დღის სერია" value="18" {...p} />,
    role: 'text',
  },
  {
    name: 'FactTile',
    render: (p) => <FactTile label="მწვრთნელი" value="Sandro K." icon="user" {...p} />,
    role: 'text',
  },
  {
    name: 'ListRow',
    render: (p) => <ListRow title="ბილინგი" icon="card" onPress={jest.fn()} {...p} />,
    interactive: true,
    role: 'button',
  },
  {
    name: 'PersonRow',
    render: (p) => <PersonRow name="Ana G." eyebrow="მწვრთნელი" meta="Yoga Flow" {...p} />,
  },
  {
    name: 'ProductRow',
    render: (p) => (
      <ProductRow
        name="Whey Protein 1kg"
        price="89,00 ₾"
        priceAccessibilityLabel="89 ლარი"
        onPress={jest.fn()}
        {...p}
      />
    ),
    interactive: true,
    role: 'button',
  },
  {
    name: 'DurationBadge',
    render: (p) => <DurationBadge value="45" unit="წთ" accessibilityLabel="45 წუთი" {...p} />,
    role: 'text',
  },
  {
    name: 'AchievementTile',
    render: (p) => (
      <AchievementTile label="10 ვიზიტი" statusLabel="მიღწეულია" earned icon="medal" {...p} />
    ),
    role: 'text',
  },
  {
    name: 'DayCell',
    render: (p) => (
      <DayCell
        weekday="ხუთ"
        date="6"
        accessibilityLabel="ხუთშაბათი 6, 4 გაკვეთილი"
        hasClasses
        onPress={jest.fn()}
        {...p}
      />
    ),
    interactive: true,
    role: 'button',
  },
];

const PROPS = { testID: 'sweep-root', style: { marginTop: 7 }, className: 'mt-2' };

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

function root(view: RenderResult) {
  return view.getByTestId(PROPS.testID, HIDDEN);
}

describe('every WP-8a export', () => {
  // RULE 2. Maestro drives this app entirely by `testID`; a component that
  // swallows it cannot be tested end to end and gets re-implemented locally.
  it.each(EXPORTS)('$name forwards testID to its root node', (row) => {
    expect(root(render(row.render(PROPS)))).toBeTruthy();
  });

  // RULE 3. A component the screen cannot nudge is a component the screen
  // forks — which is how the last package got to zero consumers.
  it.each(EXPORTS)('$name lets style through, last', (row) => {
    expect(flatten(root(render(row.render(PROPS))).props.style).marginTop).toBe(7);
  });

  it.each(EXPORTS)('$name accepts className', (row) => {
    // NativeWind resolves `className` through the Babel transform, so the
    // assertion is only that the prop is accepted and displaces nothing.
    expect(root(render(row.render(PROPS)))).toBeTruthy();
  });

  it.each(EXPORTS.filter((r) => r.role))('$name announces its role', (row) => {
    expect(root(render(row.render(PROPS))).props.accessibilityRole).toBe(row.role);
  });

  // RULE 1. Every label is a required prop, so every export that announces
  // must arrive at the tree WITH one. A silent root is the failure this
  // catches: it looks perfect until someone turns VoiceOver on.
  it.each(EXPORTS.filter((r) => r.role))('$name carries a label', (row) => {
    const label: unknown = root(render(row.render(PROPS))).props.accessibilityLabel;
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  });
});

describe('every INTERACTIVE WP-8a export', () => {
  const interactive = EXPORTS.filter((r) => r.interactive);

  it('there is at least one, so these assertions are not vacuous', () => {
    expect(interactive.length).toBeGreaterThan(0);
  });

  it.each(interactive)('$name reports its disabled state', (row) => {
    // Always present, even when false: a state object that appears only once
    // something is set makes the announcement change shape mid-interaction.
    expect(root(render(row.render(PROPS))).props.accessibilityState).toBeDefined();
  });

  // THE 44pt FLOOR, asserted from outside the component that implements it.
  it.each(interactive)('$name clears the 44pt touch target', (row) => {
    const node = root(render(row.render(PROPS)));
    const style = flatten(node.props.style);
    const height = Number(style.height ?? style.minHeight ?? 0);
    const slop = (node.props.hitSlop ?? { top: 0, bottom: 0, left: 0, right: 0 }) as {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };

    expect(height).toBeGreaterThan(0);
    expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
