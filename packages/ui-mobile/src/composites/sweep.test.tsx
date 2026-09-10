// The WP-9 half of the cross-cutting sweep.
//
// ===========================================================================
// SAME TABLE, SAME ASSERTIONS, ONE PER STAGE — see the header of
// `src/data-display/sweep.test.tsx` for why the PATTERN is extended rather
// than the file (four work packages cannot edit one table concurrently).
//
// The rule this stage's sweep is most likely to catch a violation of is rule
// 3, `style` last. A composite is the component a screen is most likely to
// need to nudge — a card in a rail wants a width, a block wants a top margin —
// and a composite that swallows `style` is a composite the screen forks, which
// is the documented root cause of the last package having zero consumers.
//
// TWO OF THE FOUR EXPORTS ARE INTERACTIVE-BUT-NOT-A-CONTROL. `ClassCard` and
// `MembershipBlock` contain buttons rather than being buttons, so their ROOT
// is a plain `Surface`: it carries no role and no hit slop, and the 44pt floor
// is the inner controls' obligation, asserted by WP-6's own sweep. Their rows
// below therefore set neither `role` nor `interactive` — and the components
// that ARE one node (`QrCode`) do.
// ===========================================================================

import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { MIN_TOUCH_TARGET } from '../internal/hit-slop';

import { CheckInPass } from './check-in-pass';
import { ClassCard } from './class-card';
import { MembershipBlock } from './membership-block';
import { QrCode } from './qr/qr-code';

const HIDDEN = { includeHiddenElements: true } as const;

interface SweepRow {
  name: string;
  render: (props: { testID: string; style: object; className: string }) => ReactElement;
  /** The a11y role this export's ROOT must announce, if it is a node at all. */
  role?: string;
}

/** Every component WP-9 adds to the barrel. */
const EXPORTS: SweepRow[] = [
  {
    name: 'ClassCard',
    render: (p) => (
      <ClassCard
        category="ძალა"
        categoryColor="#E4F26A"
        title="CrossFit WOD"
        time="18:00"
        meta="Sandro K. · Downtown"
        capacity={20}
        bookedCount={17}
        spotsLeftLabel="3 ადგილი დარჩა"
        fullLabel="სავსეა"
        accessibilityLabel="CrossFit WOD, 18:00, 3 ადგილი დარჩა"
        action={{
          onPress: jest.fn(),
          bookLabel: 'დაჯავშნა',
          joinWaitlistLabel: 'მოლოდინის სია',
          bookedLabel: 'დაჯავშნილია',
          waitlistedLabel: 'მოლოდინი',
        }}
        {...p}
      />
    ),
  },
  {
    name: 'MembershipBlock',
    render: (p) => (
      <MembershipBlock
        eyebrow="აბონემენტი"
        plan="Premium"
        statusLine="აქტიური · 22 / 30 დღე დარჩა"
        progressValue={73}
        progressAccessibilityLabel="ბილინგის პერიოდი"
        {...p}
      />
    ),
  },
  {
    name: 'CheckInPass',
    render: (p) => (
      <CheckInPass
        payload="fitspace://check-in?u=usr_01H8QKC7&g=gym_downtown"
        qrAccessibilityLabel="ჩექ-ინის QR კოდი"
        gymName="Downtown Strength"
        memberId={{
          label: 'წევრის ID',
          value: 'FC-4821',
          accessibilityLabel: 'წევრის ID FC-4821',
        }}
        {...p}
      />
    ),
  },
  {
    name: 'QrCode',
    render: (p) => (
      <QrCode value="fitspace://check-in?u=usr_01H8QKC7" accessibilityLabel="QR" {...p} />
    ),
    role: 'image',
  },
];

const PROPS = { testID: 'sweep-root', style: { marginTop: 7 }, className: 'mt-2' };

/**
 * The host component's name.
 *
 * React Native's host names ("View", "Text") are not in React's `ElementType`
 * union — that is the DOM's lowercase tag list — so the comparison has to go
 * through a cast. One helper rather than one cast per call site.
 */
function hostName(node: { type: unknown }): string {
  return typeof node.type === 'string' ? node.type : '';
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

function root(view: RenderResult) {
  return view.getByTestId(PROPS.testID, HIDDEN);
}

describe('every WP-9 export', () => {
  // RULE 2. Maestro drives this app entirely by `testID` — `member-qr-pass` is
  // one of the two selectors named in the package's own rules — and a
  // component that swallows it cannot be tested end to end.
  it.each(EXPORTS)('$name forwards testID to its root node', (row) => {
    expect(root(render(row.render(PROPS)))).toBeTruthy();
  });

  // RULE 3. See the header: this is the rule a composite fails first.
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
  // must arrive at the tree WITH one.
  it.each(EXPORTS.filter((r) => r.role))('$name carries a label', (row) => {
    const label: unknown = root(render(row.render(PROPS))).props.accessibilityLabel;
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  });
});

describe('the composites ship no copy', () => {
  // The package's first rule, asserted the only way a test can: render each
  // composite with EVERY string it takes set to a marker, and assert that
  // nothing else appears. A component that hard-coded a word — the salvage's
  // "QR code" `accessibilityLabel`, an "of" between two numbers — puts a
  // string on screen that no caller supplied and no locale can change.
  it('renders nothing the caller did not supply', () => {
    const view = render(
      <ClassCard
        category="AAA"
        categoryColor="#E4F26A"
        title="BBB"
        time="CCC"
        meta="DDD"
        capacity={20}
        bookedCount={17}
        spotsLeftLabel="EEE"
        fullLabel="FFF"
        duration={{ value: 'GGG', unit: 'HHH', accessibilityLabel: 'III' }}
        accessibilityLabel="JJJ"
        action={{
          onPress: jest.fn(),
          bookLabel: 'KKK',
          joinWaitlistLabel: 'LLL',
          bookedLabel: 'MMM',
          waitlistedLabel: 'NNN',
        }}
        testID="card"
      />,
    );

    const strings = view
      .getByTestId('card', HIDDEN)
      .findAll((node) => hostName(node) === 'Text')
      .flatMap((node): unknown[] => {
        const children: unknown = node.props.children;
        return Array.isArray(children) ? (children as unknown[]) : [children];
      })
      .filter((child): child is string => typeof child === 'string')
      // The middot the artboards draw between a time and a trainer is
      // punctuation, not copy — it is the one glyph this component emits, and
      // only when there is something on both sides of it.
      .filter((child) => child.trim() !== '·');

    for (const s of strings)
      expect(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'GGG', 'HHH', 'KKK']).toContain(s);
  });
});

// ===========================================================================
// THE 44pt FLOOR, FOR THE CONTROLS THE COMPOSITES CONTAIN.
//
// WP-5/6/8's sweeps assert this on components whose ROOT is the control. A
// composite's root is a `Surface`, so the floor moves inward: what has to
// clear it is the button inside the card, the copy button on the pass, and the
// disc on the membership block. Each is a shipped control asked for by these
// files at a size these files chose — `Button size="sm"` is 29 and
// `IconButton size={40}` is 40, both UNDER the floor and both paying the
// difference in hit slop — so the choice is this stage's to defend.
// ===========================================================================

interface ControlRow {
  name: string;
  testID: string;
  render: (testID: string) => ReactElement;
}

const CONTROLS: ControlRow[] = [
  {
    name: "ClassCard's action",
    testID: 'inner-action',
    render: (testID) => (
      <ClassCard
        category="ძალა"
        categoryColor="#E4F26A"
        title="CrossFit WOD"
        capacity={20}
        bookedCount={17}
        spotsLeftLabel="3 ადგილი დარჩა"
        fullLabel="სავსეა"
        accessibilityLabel="CrossFit WOD, 3 ადგილი დარჩა"
        action={{
          onPress: jest.fn(),
          bookLabel: 'დაჯავშნა',
          joinWaitlistLabel: 'მოლოდინის სია',
          bookedLabel: 'დაჯავშნილია',
          waitlistedLabel: 'მოლოდინი',
          testID,
        }}
      />
    ),
  },
  {
    name: "MembershipBlock's capsule action",
    testID: 'inner-action',
    render: (testID) => (
      <MembershipBlock
        eyebrow="აბონემენტი"
        plan="Premium"
        highlight={{
          value: '8',
          label: 'დღე დარჩა',
          accessibilityLabel: '8 დღე დარჩა',
          action: { icon: 'arrow', onPress: jest.fn(), accessibilityLabel: 'QR', testID },
        }}
      />
    ),
  },
  {
    name: "MembershipBlock's on-block button",
    testID: 'inner-action',
    render: (testID) => (
      <MembershipBlock
        eyebrow="წევრობა"
        plan="Premium"
        actions={[{ label: 'გაყინვა', onPress: jest.fn(), testID }]}
      />
    ),
  },
  {
    name: "CheckInPass's copy button",
    testID: 'inner-action',
    render: (testID) => (
      <CheckInPass
        payload="fitspace://check-in?u=usr_01H8QKC7"
        qrAccessibilityLabel="QR"
        gymName="Downtown Strength"
        memberId={{
          label: 'წევრის ID',
          value: 'FC-4821',
          accessibilityLabel: 'წევრის ID FC-4821',
          copy: { onPress: jest.fn(), accessibilityLabel: 'დააკოპირე', testID },
        }}
      />
    ),
  },
];

describe('every control a WP-9 composite contains', () => {
  it.each(CONTROLS)('$name announces a role and a label', (row) => {
    const view = render(row.render(row.testID));
    const node = view.getByTestId(row.testID, HIDDEN);
    expect(node.props.accessibilityRole).toBe('button');
    expect(typeof node.props.accessibilityLabel).toBe('string');
  });

  it.each(CONTROLS)('$name reports its disabled state', (row) => {
    const view = render(row.render(row.testID));
    expect(view.getByTestId(row.testID, HIDDEN).props.accessibilityState).toBeDefined();
  });

  it.each(CONTROLS)('$name clears the 44pt touch target', (row) => {
    const node = render(row.render(row.testID)).getByTestId(row.testID, HIDDEN);
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
