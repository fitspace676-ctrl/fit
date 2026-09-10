// Render tests for `MembershipBlock`.
//
// The component's claim is that ONE component serves two screens whose lower
// halves look nothing alike, so the tests are organised the same way: the home
// shape, the profile shape, and the things that must be true of both.
//
// The assertion that matters most is the negative one — that no subscription
// state ever reaches this file. `statusLine` and `statusPill` are strings, and
// a test that passes `ACTIVE` through them and finds it rendered verbatim is
// what makes that concrete.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { themeColors } from '../tokens/semantic';
import { ink } from '../palette';

import { MembershipBlock } from './membership-block';

const dark = themeColors(true);
const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

const PLAN = { eyebrow: 'აბონემენტი', plan: 'Premium' } as const;

// ===========================================================================
// HOME — `mobile-home-v2.tsx:228-269`.
// ===========================================================================

describe('MembershipBlock, the home shape', () => {
  const HOME = {
    ...PLAN,
    statusLine: 'აქტიური · 22 / 30 დღე დარჩა',
    progressValue: 73,
    progressAccessibilityLabel: 'ბილინგის პერიოდი',
    progressValueText: '22 / 30 დღე დარჩა',
    progressShape: 'ring',
    highlight: {
      value: '8',
      label: 'დღე დარჩა',
      accessibilityLabel: '8 დღე დარჩა',
      action: {
        icon: 'arrow',
        onPress: jest.fn(),
        accessibilityLabel: 'გამოცხადების QR',
        testID: 'home-qr',
      },
    },
  } as const;

  it('draws the ring, the capsule and the lime action', () => {
    render(<MembershipBlock {...HOME} testID="block" />);

    expect(screen.getByLabelText('ბილინგის პერიოდი')).toBeTruthy();
    // The capsule is ONE node: "8" and "დღე დარჩა" would otherwise be two
    // stops, the first read as a bare digit.
    expect(screen.getByLabelText('8 დღე დარჩა')).toBeTruthy();
    expect(screen.getByLabelText('გამოცხადების QR')).toBeTruthy();
  });

  it('opens the check-in code from the capsule action', () => {
    const onPress = jest.fn();
    render(
      <MembershipBlock
        {...HOME}
        highlight={{ ...HOME.highlight, action: { ...HOME.highlight.action, onPress } }}
      />,
    );
    fireEvent.press(screen.getByTestId('home-qr'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws no bar when the shape is a ring', () => {
    render(<MembershipBlock {...HOME} testID="block" />);
    // One progress node, not two: `getByLabelText` throws on a duplicate.
    expect(screen.getByLabelText('ბილინგის პერიოდი').props.accessibilityRole).toBe('progressbar');
  });
});

// ===========================================================================
// PROFILE — `mobile-profile.tsx:184-224`.
// ===========================================================================

describe('MembershipBlock, the profile shape', () => {
  const PROFILE = {
    ...PLAN,
    eyebrow: 'წევრობა',
    statusPill: 'აქტიური',
    statusLine: 'განახლდება 14 აგვისტოს · დარჩა 22/30 დღე',
    progressValue: 73,
    progressAccessibilityLabel: 'ბილინგის პერიოდი',
    actions: [
      { label: 'გამოცხადების QR', onPress: jest.fn(), primary: true, testID: 'profile-qr' },
      { label: 'გაყინვა', onPress: jest.fn(), icon: 'pause', testID: 'profile-freeze' },
    ],
  } as const;

  it('draws the pill, the bar and both on-block buttons', () => {
    render(<MembershipBlock {...PROFILE} testID="block" />);

    expect(screen.getByText('აქტიური', HIDDEN)).toBeTruthy();
    expect(screen.getByLabelText('ბილინგის პერიოდი')).toBeTruthy();
    expect(screen.getByLabelText('გამოცხადების QR')).toBeTruthy();
    expect(screen.getByLabelText('გაყინვა')).toBeTruthy();
  });

  // The loud action takes the room that is left and the quiet one is exactly
  // as wide as its label. Two equal halves would lose the hierarchy the two
  // fills are drawing.
  it('flexes the primary action and shrink-wraps the quiet one', () => {
    render(<MembershipBlock {...PROFILE} testID="block" />);
    expect(flatten(screen.getByTestId('profile-qr').props.style).flex).toBe(1);
    expect(flatten(screen.getByTestId('profile-freeze').props.style).flexShrink).toBe(0);
  });

  it('paints the two on-lime fills, not the page ones', () => {
    render(<MembershipBlock {...PROFILE} testID="block" />);
    // `onAccent`: an ink-950 plate. Anything else on lime is a hole.
    expect(flatten(screen.getByTestId('profile-qr').props.style).backgroundColor).toBe(
      dark.onAccent,
    );
  });

  it('presses each action independently', () => {
    const qr = jest.fn();
    const freeze = jest.fn();
    render(
      <MembershipBlock
        {...PROFILE}
        actions={[
          { ...PROFILE.actions[0], onPress: qr },
          { ...PROFILE.actions[1], onPress: freeze },
        ]}
      />,
    );
    fireEvent.press(screen.getByTestId('profile-freeze'));
    expect(freeze).toHaveBeenCalledTimes(1);
    expect(qr).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// WHAT IS TRUE OF BOTH.
// ===========================================================================

describe('MembershipBlock', () => {
  it('takes no status enum — the vocabulary is the caller’s, verbatim', () => {
    // Deliberately the BACKEND's word. If this component ever grew a
    // `status: 'ACTIVE' | …` prop and a mapping, this test would still pass —
    // so it is the type signature that carries the rule and this that shows
    // the string is not interpreted, reordered or translated on the way
    // through.
    render(<MembershipBlock {...PLAN} statusPill="ACTIVE" statusLine="PAST_DUE" testID="block" />);
    expect(screen.getByText('ACTIVE', HIDDEN)).toBeTruthy();
    expect(screen.getByText('PAST_DUE', HIDDEN)).toBeTruthy();
  });

  it('is the lime block in both modes', () => {
    render(<MembershipBlock {...PLAN} testID="block" />);
    // `accent` is brand-300 in BOTH arms of the semantic map, which is what
    // makes this block identical in light and dark.
    expect(flatten(screen.getByTestId('block').props.style).backgroundColor).toBe(dark.accent);
  });

  it('sets the muted text on lime to ink-800, not the page’s secondary', () => {
    render(<MembershipBlock {...PLAN} statusLine="აქტიური" testID="block" />);
    expect(flatten(screen.getByText('აქტიური', HIDDEN).props.style).color).toBe(ink[800]);
  });

  it('announces the plan name as a heading', () => {
    render(<MembershipBlock {...PLAN} testID="block" />);
    expect(screen.getByText('Premium', HIDDEN).props.accessibilityRole).toBe('header');
  });

  it('draws neither meter when no progress value is given', () => {
    render(<MembershipBlock {...PLAN} progressAccessibilityLabel="ბილინგი" testID="block" />);
    expect(screen.queryByLabelText('ბილინგი')).toBeNull();
  });

  // The gym's own photograph, as a band across the top. The block below it is
  // untouched — see the file header on why this is not `ClassCard`'s full-bleed
  // layer: every run of text here is ink-950 on lime and cannot be read over a
  // dark scrim.
  describe('the cover', () => {
    it('draws the gym’s photograph as a band, and keeps the lime block under it', () => {
      render(<MembershipBlock {...PLAN} coverUrl="https://cdn.test/gym.jpg" testID="block" />);

      expect(screen.getByTestId('block-cover-image', HIDDEN).props.source).toEqual({
        uri: 'https://cdn.test/gym.jpg',
      });
      // Still the lime block, and the plan is still its heading.
      expect(flatten(screen.getByTestId('block').props.style).backgroundColor).toBe(dark.accent);
      expect(screen.getByText('Premium', HIDDEN).props.accessibilityRole).toBe('header');
    });

    it('draws NOTHING when the gym has no portal image — not a placeholder', () => {
      render(<MembershipBlock {...PLAN} coverUrl={null} testID="block" />);
      expect(screen.queryByTestId('block-cover', HIDDEN)).toBeNull();
      // And the padding is still the Surface's own.
      expect(flatten(screen.getByTestId('block').props.style).padding).toBe(20);
    });

    it('degrades a broken URL to the block without one', () => {
      render(<MembershipBlock {...PLAN} coverUrl="https://cdn.test/gone.jpg" testID="block" />);
      fireEvent(screen.getByTestId('block-cover-image', HIDDEN), 'error');
      expect(screen.queryByTestId('block-cover', HIDDEN)).toBeNull();
      expect(screen.getByText('Premium', HIDDEN)).toBeTruthy();
    });

    it('says nothing about the photograph — there is no alt text to say it with', () => {
      render(<MembershipBlock {...PLAN} coverUrl="https://cdn.test/gym.jpg" testID="block" />);
      const band = screen.getByTestId('block-cover', HIDDEN);
      expect(band.props.accessible).toBe(false);
      expect(band.props.importantForAccessibility).toBe('no-hide-descendants');
    });
  });

  it('forwards testID, style and className', () => {
    render(<MembershipBlock {...PLAN} testID="block" style={{ marginTop: 7 }} className="mt-2" />);
    expect(flatten(screen.getByTestId('block').props.style).marginTop).toBe(7);
  });
});
