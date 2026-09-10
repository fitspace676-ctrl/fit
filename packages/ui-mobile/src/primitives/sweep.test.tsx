// The cross-cutting sweep.
//
// ===========================================================================
// WHAT THIS FILE IS FOR.
//
// §5 of the rebuild plan asks for ONE test over every barrel export checking
// that `testID` reaches the root, that `accessibilityRole` is set, and that
// `minHeight + hitSlop >= 44`. It is called out by name because of a specific
// regression: the old package shipped `TabBarIcon` as an EMOJI GLYPH into a
// design system whose own moodboard says "stroke icons, no emoji". It was
// unusable on arrival, and no per-component test caught it, because every
// per-component test was written by the person who had just written the
// component and shared its assumptions.
//
// A sweep does not share those assumptions. It has one row per export and it
// fails the moment a new export forgets a rule — which is the only kind of
// test that survives the package growing from ten components to forty.
//
// HOW TO ADD A ROW. Every component added in WP-6, WP-8 and WP-9 gets an entry
// in EXPORTS below, and every one that a finger can land on gets `interactive:
// true`. Not adding a row is not an option a reviewer should let past: an
// export absent from this table is an export exempt from the package's rules.
// ===========================================================================

import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { IconButton } from '../forms/icon-button';
import { CountBadge, DotBadge, Pill } from '../feedback/pill';
import { MIN_TOUCH_TARGET } from '../internal/hit-slop';

import { Avatar } from './avatar';
import { Divider } from './divider';
import { Icon } from './icon/icon';
import { Skeleton } from './skeleton';
import { Spinner } from './spinner';
import { Card, Surface } from './surface';
import { Eyebrow, Heading, Money, Mono, Text } from './text';

const HIDDEN = { includeHiddenElements: true } as const;

interface SweepRow {
  name: string;
  /** Render the component with the given testID, style and className. */
  render: (props: { testID: string; style: object; className: string }) => ReactElement;
  /**
   * Can a finger land on it? Interactive rows carry two extra obligations:
   * an `accessibilityRole`, and a touch target of at least 44pt once the
   * component's own hit slop is applied.
   */
  interactive?: boolean;
  /** The a11y role this export must announce, when it announces one. */
  role?: string;
  /**
   * Decorative components are hidden from the accessibility tree on purpose,
   * so their queries have to opt in to hidden elements. That is the correct
   * behaviour, not an exemption — `hidden: true` asserts it.
   */
  hidden?: boolean;
}

/**
 * Every component this package exports, as of WP-5.
 *
 * The props each row passes are the MINIMUM the component's types accept. That
 * is deliberate: if a required prop is ever removed — say `accessibilityLabel`
 * stops being required on `IconButton` — this table still compiles, and the
 * role/label assertions below are what catch it.
 */
const EXPORTS: SweepRow[] = [
  {
    name: 'Icon',
    render: (p) => <Icon name="bolt" color="accent" {...p} />,
    hidden: true,
  },
  { name: 'Text', render: (p) => <Text {...p}>x</Text> },
  { name: 'Heading', render: (p) => <Heading {...p}>x</Heading>, role: 'header' },
  { name: 'Eyebrow', render: (p) => <Eyebrow {...p}>x</Eyebrow> },
  { name: 'Mono', render: (p) => <Mono {...p}>12</Mono> },
  {
    name: 'Money',
    render: (p) => (
      <Money accessibilityLabel="89 ლარი" {...p}>
        89.00 ₾
      </Money>
    ),
  },
  { name: 'Surface', render: (p) => <Surface {...p} /> },
  { name: 'Card', render: (p) => <Card {...p} /> },
  {
    name: 'IconButton',
    render: (p) => <IconButton icon="bell" accessibilityLabel="a" onPress={jest.fn()} {...p} />,
    interactive: true,
    role: 'button',
  },
  { name: 'Pill', render: (p) => <Pill {...p}>x</Pill> },
  { name: 'CountBadge', render: (p) => <CountBadge count={3} {...p} />, hidden: true },
  { name: 'DotBadge', render: (p) => <DotBadge {...p} />, hidden: true },
  { name: 'Divider', render: (p) => <Divider {...p} />, hidden: true },
  { name: 'Avatar', render: (p) => <Avatar initials="NK" {...p} />, hidden: true },
  {
    name: 'Spinner',
    render: (p) => <Spinner accessibilityLabel="იტვირთება" {...p} />,
    role: 'progressbar',
  },
  { name: 'Skeleton', render: (p) => <Skeleton {...p} />, hidden: true },
];

const PROPS = { testID: 'sweep-root', style: { marginTop: 7 }, className: 'mt-2' };

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

function root(view: RenderResult, row: SweepRow) {
  return row.hidden ? view.getByTestId(PROPS.testID, HIDDEN) : view.getByTestId(PROPS.testID);
}

describe('every export', () => {
  // RULE 2. Maestro drives this app entirely by `testID` — the flows are
  // locale-independent by construction, so a selector is the ONLY handle they
  // have. A component that swallows `testID` cannot be tested end to end, and
  // gets re-implemented locally by the first person who needs to.
  it.each(EXPORTS)('$name forwards testID to its root node', (row) => {
    const view = render(row.render(PROPS));
    expect(root(view, row)).toBeTruthy();
  });

  // RULE 3. A component the screen cannot nudge is a component the screen
  // forks — and a forked component is how this package got to zero consumers
  // last time. `style` is applied LAST, after everything the component set.
  it.each(EXPORTS)('$name lets style through, last', (row) => {
    const view = render(row.render(PROPS));
    expect(flatten(root(view, row).props.style).marginTop).toBe(7);
  });

  it.each(EXPORTS)('$name accepts className', (row) => {
    // NativeWind resolves `className` to styles through the Babel transform,
    // so the assertion here is only that the prop is ACCEPTED and does not
    // throw or displace the component's own styling.
    const view = render(row.render(PROPS));
    expect(root(view, row)).toBeTruthy();
  });

  it.each(EXPORTS.filter((r) => r.role))('$name announces its role', (row) => {
    const view = render(row.render(PROPS));
    expect(root(view, row).props.accessibilityRole).toBe(row.role);
  });

  // The emoji-tab-icon regression, generalised: a decorative element must be
  // OUT of the accessibility tree, not merely unlabelled. Both platforms need
  // saying, because they use different APIs for the same thing.
  it.each(EXPORTS.filter((r) => r.hidden))('$name stays out of the a11y tree', (row) => {
    const view = render(row.render(PROPS));
    const node = view.getByTestId(PROPS.testID, HIDDEN);
    expect(node.props.accessible).toBe(false);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    // …and is genuinely unreachable through the default queries.
    expect(view.queryByTestId(PROPS.testID)).toBeNull();
  });
});

describe('every INTERACTIVE export', () => {
  const interactive = EXPORTS.filter((r) => r.interactive);

  it('there is at least one, so these assertions are not vacuous', () => {
    // A filter that silently matches nothing is a green test that checks
    // nothing — the failure mode this whole file exists to avoid.
    expect(interactive.length).toBeGreaterThan(0);
  });

  it.each(interactive)('$name sets an accessibilityRole', (row) => {
    const view = render(row.render(PROPS));
    expect(root(view, row).props.accessibilityRole).toBeTruthy();
  });

  it.each(interactive)('$name carries a label', (row) => {
    const view = render(row.render(PROPS));
    const label: unknown = root(view, row).props.accessibilityLabel;
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  });

  it.each(interactive)('$name reports its disabled state', (row) => {
    const view = render(row.render(PROPS));
    // Always present, even when false: a state object that appears only once
    // something is set makes the announcement change shape mid-interaction.
    expect(root(view, row).props.accessibilityState).toBeDefined();
  });

  // THE 44pt FLOOR, asserted from outside the component that implements it.
  it.each(interactive)('$name clears the 44pt touch target', (row) => {
    const view = render(row.render(PROPS));
    const node = root(view, row);
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
    expect(width + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
