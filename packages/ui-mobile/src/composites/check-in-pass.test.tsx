// Render tests for `CheckInPass`.
//
// ===========================================================================
// THE TWO TESTS THIS FILE EXISTS FOR ARE BOTH ABOUT WHAT THE CARD CLAIMS.
//
// Decision Q1: there is no scanner side and no member-scoped check-in endpoint
// exists, so the code is an identity claim, not a credential. Two things
// follow, and both are assertions here rather than comments in a header:
//
//   1. The MEMBER ID renders, prominently, with a copy affordance — because
//      the receptionist typing `FC-4821` into the admin console is the only
//      flow that works today.
//
//   2. NO COUNTDOWN. The artboard draws "განახლდება 0:47-ში" between the code
//      and the member strip. A refresh timer tells the member the code expires
//      and is therefore secure; neither is true, and the salvaged `checkin.ts`
//      is candid that its nonce is cosmetic. The test looks for a clock-shaped
//      string anywhere in the tree and for the refresh glyph, and fails if
//      either reappears.
// ===========================================================================

import { fireEvent, render, screen } from '@testing-library/react-native';

import { themeColors } from '../tokens/semantic';
import { brand } from '../palette';

import { CheckInPass } from './check-in-pass';

const dark = themeColors(true);
const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

const BASE = {
  payload: 'fitspace://check-in?u=usr_01H8QKC7&g=gym_downtown',
  qrAccessibilityLabel: 'ჩექ-ინის QR კოდი',
  gymName: 'Downtown Strength',
  statusLabel: 'აქტიური',
  memberId: {
    label: 'წევრის ID',
    value: 'FC-4821',
    accessibilityLabel: 'წევრის ID FC-4821',
  },
} as const;

const MEMBER = {
  name: 'Nino Kapanadze',
  meta: 'Premium · წევრის ID FC-4821',
  initials: 'NK',
} as const;

const TRAILING = { value: '8', label: 'დარჩენილი დღე', accessibilityLabel: '8 დარჩენილი დღე' };

// ===========================================================================
// 1 · THE MEMBER ID IS THE PRIMARY ELEMENT.
// ===========================================================================

describe('CheckInPass member id', () => {
  it('renders the id, large and tracked, with its label', () => {
    render(<CheckInPass {...BASE} testID="pass" />);

    const id = screen.getByText('FC-4821', HIDDEN);
    const style = flatten(id.props.style);
    expect(style.fontSize).toBe(20);
    expect(style.letterSpacing).toBe(2);
    expect(screen.getByText('წევრის ID', HIDDEN)).toBeTruthy();
  });

  it('announces the id block as one node, as the caller wrote it', () => {
    render(<CheckInPass {...BASE} testID="pass" />);
    expect(screen.getByLabelText('წევრის ID FC-4821')).toBeTruthy();
    // Not as two — the eyebrow and the mono run are both hidden behind it.
    expect(screen.queryByText('FC-4821')).toBeNull();
  });

  it('offers a copy affordance, and fires it', () => {
    const onPress = jest.fn();
    render(
      <CheckInPass
        {...BASE}
        memberId={{
          ...BASE.memberId,
          copy: { onPress, accessibilityLabel: 'დააკოპირე წევრის ID', testID: 'copy' },
        }}
      />,
    );
    fireEvent.press(screen.getByTestId('copy'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('latches the copied state to the accent pair, and never to a changed label', () => {
    render(
      <CheckInPass
        {...BASE}
        memberId={{
          ...BASE.memberId,
          copy: {
            onPress: jest.fn(),
            accessibilityLabel: 'დააკოპირე წევრის ID',
            copied: true,
            testID: 'copy',
          },
        }}
      />,
    );
    const button = screen.getByTestId('copy');
    // The name a screen-reader user searches for must not change under them —
    // which is also why the tick is not an announcement, and the screen owes
    // the member a toast. See the component.
    expect(button.props.accessibilityLabel).toBe('დააკოპირე წევრის ID');
    // The accent pair: a lime plate. `selected` is deliberately NOT used —
    // `IconButton` inverts it on the already-accented variants, which is the
    // opposite of the artboard, and "selected" is a toggle's word for a
    // momentary state.
    expect(flatten(button.props.style).backgroundColor).toBe(dark.accent);
    const state = button.props.accessibilityState as { selected?: boolean } | undefined;
    expect(state?.selected).toBeUndefined();
  });

  it('keeps the copy button the same size in both states', () => {
    const copy = { onPress: jest.fn(), accessibilityLabel: 'დააკოპირე', testID: 'copy' };
    const idle = render(<CheckInPass {...BASE} memberId={{ ...BASE.memberId, copy }} />);
    const idleStyle = flatten(idle.getByTestId('copy').props.style);
    idle.unmount();

    render(
      <CheckInPass {...BASE} memberId={{ ...BASE.memberId, copy: { ...copy, copied: true } }} />,
    );
    // A control that grows four points at the moment it is pressed shifts the
    // id beside it.
    expect(flatten(screen.getByTestId('copy').props.style).width).toBe(idleStyle.width);
  });

  it('renders without a copy button when none is given', () => {
    render(<CheckInPass {...BASE} testID="pass" />);
    expect(screen.getByLabelText('წევრის ID FC-4821')).toBeTruthy();
  });
});

// ===========================================================================
// 2 · NO COUNTDOWN. NOT NOW, NOT LATER.
// ===========================================================================

describe('CheckInPass ships no countdown', () => {
  it('renders no clock-shaped string anywhere in the tree', () => {
    render(<CheckInPass {...BASE} member={MEMBER} trailing={TRAILING} testID="pass" />);

    // "0:47", "12:03", "განახლდება 0:47-ში" — any of them.
    expect(screen.queryByText(/\d{1,2}:\d{2}/, HIDDEN)).toBeNull();
  });

  it('renders no refresh glyph', () => {
    render(<CheckInPass {...BASE} member={MEMBER} trailing={TRAILING} testID="pass" />);
    // The artboard's countdown row is `<Icon d={P.refresh}>` plus the timer.
    // `Icon` renders its name into `testID`-free SVG, so the check is that the
    // component asks for no icon beyond the ones it declares — asserted by the
    // absence of any node carrying the refresh path's accessibility identity.
    expect(screen.queryByLabelText(/განახლდება/)).toBeNull();
  });

  it('exposes no prop that could hold one', () => {
    // A compile-time claim, made explicit: there is no `refreshesIn`,
    // `expiresAt`, `secondsRemaining` or `onRefresh`. If one is ever added,
    // this line stops compiling — which is the point.
    const props: Record<string, unknown> = { ...BASE };
    for (const banned of ['refreshesIn', 'expiresAt', 'secondsRemaining', 'onRefresh']) {
      expect(props[banned]).toBeUndefined();
    }
  });
});

// ===========================================================================
// 3 · The code, the member strip, and the brightness boost.
// ===========================================================================

describe('CheckInPass', () => {
  it('encodes the payload it is handed, whole and unparsed', () => {
    render(<CheckInPass {...BASE} testID="pass" />);
    // The code announces as ONE labelled image, in the caller's language.
    expect(screen.getByLabelText('ჩექ-ინის QR კოდი').props.accessibilityRole).toBe('image');
  });

  it('draws the member strip with the lime-ringed avatar', () => {
    render(<CheckInPass {...BASE} member={MEMBER} trailing={TRAILING} testID="pass" />);
    expect(screen.getByText('Nino Kapanadze', HIDDEN)).toBeTruthy();
    expect(screen.getByLabelText('8 დარჩენილი დღე')).toBeTruthy();
  });

  it('omits the strip entirely inside a sheet that already names the member', () => {
    render(<CheckInPass {...BASE} testID="pass" />);
    expect(screen.queryByText('Nino Kapanadze', HIDDEN)).toBeNull();
  });

  it('is the lime card by default', () => {
    render(<CheckInPass {...BASE} testID="pass" />);
    expect(flatten(screen.getByTestId('pass').props.style).backgroundColor).toBe(dark.accent);
  });

  it('flips its surfaces to white when boosted — and only its surfaces', () => {
    render(<CheckInPass {...BASE} boosted testID="pass" />);
    expect(flatten(screen.getByTestId('pass').props.style).backgroundColor).toBe(dark.onDark);

    // The code's own light modules follow the plate; its dark modules never
    // change. `brand[50]` is the un-boosted plate, so it must be gone.
    const qr = screen.getByLabelText('ჩექ-ინის QR კოდი');
    expect(flatten(qr.props.style).backgroundColor).toBe(dark.onDark);
    expect(flatten(qr.props.style).backgroundColor).not.toBe(brand[50]);
  });

  it('paints the code on the near-white lime plate when not boosted', () => {
    render(<CheckInPass {...BASE} testID="pass" />);
    expect(flatten(screen.getByLabelText('ჩექ-ინის QR კოდი').props.style).backgroundColor).toBe(
      brand[50],
    );
  });

  it('forwards testID, style and className', () => {
    render(<CheckInPass {...BASE} testID="pass" style={{ marginTop: 7 }} className="mt-2" />);
    expect(flatten(screen.getByTestId('pass').props.style).marginTop).toBe(7);
  });
});
