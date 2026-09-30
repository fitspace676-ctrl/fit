// Render tests for the frame: `Screen`, `ScrollRail`, `TileGrid`,
// `SectionHeader`.
//
// Everything asserted here is a thing the artboards CANNOT show, because the
// canvas they were drawn on is 390pt wide, has no home indicator, and has no
// keyboard: the bottom reserve, the keyboard behaviour, the status-bar flip,
// and a rail's edge padding.

import { act } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
import { render, screen, within } from '@testing-library/react-native';

import { Text } from '../primitives/text';
import { darkColors } from '../tokens/semantic';
import { layout } from '../tokens/spacing';

import { TileGrid } from './grid';
import { SCREEN_GUTTER, tabBarInset } from './metrics';
import { Screen } from './screen';
import { ScrollRail } from './scroll-rail';
import { SectionHeader } from './section-header';

const NO_INSETS: EdgeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
/** An iPhone 15: Dynamic Island up top, home indicator at the bottom. */
const NOTCHED: EdgeInsets = { top: 59, bottom: 34, left: 0, right: 0 };

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

/** Fire the footer wrapper's `onLayout`, if it has one, at `height`. */
function layOutFooter(height: number): void {
  const onLayout = screen.getByTestId('s-footer').props.onLayout as
    | ((event: { nativeEvent: { layout: Record<string, number> } }) => void)
    | undefined;
  act(() => {
    onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
  });
}

function renderScreen(node: React.ReactElement, insets: EdgeInsets = NO_INSETS) {
  return render(
    <SafeAreaInsetsContext.Provider value={insets}>{node}</SafeAreaInsetsContext.Provider>,
  );
}

describe('Screen', () => {
  // ==========================================================================
  // THE RESERVE. `pb-32` = 128 = 24 + 72 + 32, and only on a phone with no
  // home indicator.
  // ==========================================================================
  it('reserves exactly 128 on a device with no home indicator', () => {
    renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
    );
    const content = flatten(screen.getByTestId('s-scroll').props.contentContainerStyle);
    expect(content.paddingBottom).toBe(128);
    expect(content.paddingBottom).toBe(layout.tabBarInset);
  });

  it('reserves MORE on a device that has one', () => {
    renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
      NOTCHED,
    );
    const content = flatten(screen.getByTestId('s-scroll').props.contentContainerStyle);
    expect(content.paddingBottom).toBe(tabBarInset(34));
    expect(Number(content.paddingBottom)).toBeGreaterThan(128);
  });

  it('reserves nothing when there is no tab bar under it', () => {
    // The auth stack, a modal, a sheet route.
    renderScreen(
      <Screen testID="s" reserveTabBar={false}>
        <Text>x</Text>
      </Screen>,
    );
    expect(
      flatten(screen.getByTestId('s-scroll').props.contentContainerStyle).paddingBottom,
    ).toBeUndefined();
  });

  // The shop's cart bar. A footer pinned to `bottom: 0` slides UNDER the
  // floating capsule and loses its rows to it — the exact defect a member
  // reported on the shop screen.
  it('pins the footer above the floating capsule, not against the edge', () => {
    const screen = render(
      <Screen testID="s" footer={<View testID="s-footer-content" />}>
        <View />
      </Screen>,
    );
    const style = flatten(screen.getByTestId('s-footer').props.style);
    expect(style.position).toBe('absolute');
    // 24 (capsule offset at inset 0) + 72 (capsule) + 12 (gap) — the
    // `bottom-[108px]` every shop artboard draws.
    expect(style.bottom).toBe(108);
  });

  // The join funnel: with no capsule under it, the footer floated above the
  // edge and the rows scrolling past showed in the strip below its plate and
  // in the gutters beside it.
  it('paints the canvas from a tab-less footer down to the bottom edge', () => {
    renderScreen(
      <Screen testID="s" reserveTabBar={false} footer={<View testID="s-footer-content" />}>
        <View />
      </Screen>,
      NOTCHED,
    );
    const style = flatten(screen.getByTestId('s-footer').props.style);
    // The home indicator's band is inside the wrapper, not under the scroll.
    expect(style.paddingBottom).toBe(34);
    expect(style.backgroundColor).toBe(darkColors.backgroundBody);
  });

  // The checkout's details step: iOS scrolls a focused field into the scroll
  // view's visible frame, and while the footer lay over that frame the field
  // landed above the keyboard but behind the footer. Docked under the scroll,
  // the frame ends where the footer begins.
  it('docks a tab-less footer under the scroll instead of over it', () => {
    renderScreen(
      <Screen testID="s" reserveTabBar={false} footer={<View testID="s-footer-content" />}>
        <View />
      </Screen>,
      NOTCHED,
    );
    const footer = screen.getByTestId('s-footer');
    const style = flatten(footer.props.style);
    expect(style.position).toBeUndefined();
    expect(style.bottom).toBeUndefined();

    // A sibling AFTER the scroll view, in the same column.
    const column = screen.getByTestId(Platform.OS === 'ios' ? 's-keyboard-frame' : 's');
    const order = column.children
      .filter((node) => typeof node !== 'string')
      .map((node) => (node as { props: { testID?: string } }).props.testID);
    expect(order.indexOf('s-scroll')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('s-footer')).toBe(order.indexOf('s-scroll') + 1);
  });

  it('reserves no scroll room for a docked footer — it takes its own', () => {
    renderScreen(
      <Screen testID="s" reserveTabBar={false} footer={<View />}>
        <View />
      </Screen>,
    );
    layOutFooter(118);
    expect(
      flatten(screen.getByTestId('s-scroll').props.contentContainerStyle).paddingBottom,
    ).toBeUndefined();
  });

  it('still reserves the measured height of a floating footer', () => {
    renderScreen(
      <Screen testID="s" footer={<View />}>
        <View />
      </Screen>,
    );
    layOutFooter(56);
    expect(flatten(screen.getByTestId('s-scroll').props.contentContainerStyle).paddingBottom).toBe(
      128 + 56,
    );
  });

  it('keeps the capsule-side footer transparent — the capsule is the plate there', () => {
    render(
      <Screen testID="s" footer={<View testID="s-footer-content" />}>
        <View />
      </Screen>,
    );
    const style = flatten(screen.getByTestId('s-footer').props.style);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.paddingBottom).toBeUndefined();
  });

  it('hands the scroll view to a screen that has to reset it', () => {
    const ref = { current: null as ScrollView | null };
    renderScreen(
      <Screen testID="s" scrollRef={ref}>
        <Text>x</Text>
      </Screen>,
    );
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.scrollTo).toBe('function');
  });

  it('reserves no room for a footer that is not there', () => {
    const screen = render(
      <Screen testID="s">
        <View />
      </Screen>,
    );
    // Only the tab bar's own inset, with nothing added for a footer.
    expect(flatten(screen.getByTestId('s-scroll').props.contentContainerStyle).paddingBottom).toBe(
      128,
    );
  });

  it('gutters the content at the artboards’ px-5', () => {
    renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
    );
    expect(
      flatten(screen.getByTestId('s-scroll').props.contentContainerStyle).paddingHorizontal,
    ).toBe(SCREEN_GUTTER);
    expect(SCREEN_GUTTER).toBe(20);
  });

  // ==========================================================================
  // THE HEADER'S TOP: a FLOOR under the inset, not a value.
  // ==========================================================================
  it('floors the header at 56 on a device with no notch', () => {
    renderScreen(
      <Screen testID="s" header={<Text testID="h">header</Text>}>
        <Text>x</Text>
      </Screen>,
    );
    expect(flatten(screen.getByTestId('s-header').props.style).paddingTop).toBe(56);
  });

  it('clears a Dynamic Island rather than drawing under it', () => {
    renderScreen(
      <Screen testID="s" header={<Text testID="h">header</Text>}>
        <Text>x</Text>
      </Screen>,
      NOTCHED,
    );
    expect(flatten(screen.getByTestId('s-header').props.style).paddingTop).toBe(59 + 12);
  });

  // ==========================================================================
  // TRAP 3 — the keyboard.
  // ==========================================================================
  it('never lets a tap be eaten by the keyboard dismissal', () => {
    // Without `"handled"` the first tap after typing only closes the keyboard
    // and the button under the finger never fires.
    renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
    );
    expect(screen.getByTestId('s-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('lets a drag put away a keyboard that has no Return key', () => {
    // iOS's phone and number pads cannot close themselves.
    renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
    );
    expect(screen.getByTestId('s-scroll').props.keyboardDismissMode).toBe('interactive');
  });

  it('avoids the keyboard on iOS with behavior="padding", and nowhere else', () => {
    const view = renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
    );

    if (Platform.OS === 'ios') {
      // `"padding"`, not `"height"`: `"height"` sets a fixed height that
      // fights `flex: 1` and makes the content jump rather than slide.
      expect(view.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    } else {
      // Android already resizes the window (`adjustResize`); wrapping there
      // makes the layout pay for the keyboard twice and leaves a
      // keyboard-sized band of empty canvas above it.
      expect(view.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
    }
  });

  // The register screen's submit sat behind the keyboard: an absolute footer
  // resolves `bottom: 0` against its parent's PADDING box, so the padding the
  // KAV adds never moved it. It has to be the child of a box the KAV shrinks.
  it('puts the footer inside the box the keyboard shrinks, not on the KAV itself', () => {
    const view = renderScreen(
      <Screen testID="s" reserveTabBar={false} footer={<View />}>
        <Text>x</Text>
      </Screen>,
    );
    if (Platform.OS !== 'ios') return;

    const frame = view.getByTestId('s-keyboard-frame');
    expect(flatten(frame.props.style).flex).toBe(1);
    // The footer is INSIDE the frame, not a sibling of it on the KAV.
    expect(within(frame).getByTestId('s-footer')).toBeTruthy();
  });

  // iOS never scrolls a React Native scroll view to its first responder, and
  // the KAV only shrinks it: the details step's name field was left cut in
  // half behind the docked footer.
  it('scrolls the focused field up into the visible frame when the keyboard shows', () => {
    if (Platform.OS !== 'ios') return;
    let onShow: (() => void) | undefined;
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      if (event === 'keyboardDidShow') onShow = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    // The scroll view's frame: y 211–421. The field's bare input: y 400–421.
    const field = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => {
        cb(20, 400, 350, 21);
      },
    };
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(field as never);

    const ref = { current: null as ScrollView | null };
    try {
      renderScreen(
        <Screen testID="s" reserveTabBar={false} scrollRef={ref} footer={<View />}>
          <Text>x</Text>
        </Screen>,
      );
      // Own properties on this one instance, not spies: the mock's methods are
      // shared `jest.fn`s on the prototype, and a spy would record into them.
      const scroller = ref.current as ScrollView;
      const scrollTo = jest.fn();
      Object.assign(scroller, {
        scrollTo,
        getNativeScrollRef: () => ({
          measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => {
            cb(0, 211, 402, 210);
          },
        }),
      });

      act(() => {
        onShow?.();
      });
      // 421 + 28 (the box's padding and a gap) − 421: the overlap, no more.
      expect(scrollTo).toHaveBeenCalledWith({ y: 28, animated: true });
    } finally {
      jest.restoreAllMocks();
    }
  });

  // ==========================================================================
  // `tone="accent"` — the QR screen's brightness boost.
  // ==========================================================================
  it('flips the canvas AND the status bar together', () => {
    const view = renderScreen(
      <Screen testID="s" tone="accent">
        <Text>x</Text>
      </Screen>,
    );

    expect(flatten(screen.getByTestId('s').props.style).backgroundColor).toBe(darkColors.accent);
    // White status-bar glyphs on #E4F26A measure about 1.5:1 — not "hard to
    // read", invisible. And the declaration is global, so it stays invisible
    // after navigating away.
    expect(view.UNSAFE_getByType(StatusBar).props.barStyle).toBe('dark-content');
  });

  it('keeps light glyphs on the dark canvas', () => {
    const view = renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
    );
    expect(flatten(screen.getByTestId('s').props.style).backgroundColor).toBe(
      darkColors.backgroundBody,
    );
    expect(view.UNSAFE_getByType(StatusBar).props.barStyle).toBe('light-content');
  });

  it('scroll={false} still reserves the tab bar', () => {
    renderScreen(
      <Screen testID="s" scroll={false}>
        <Text testID="child">x</Text>
      </Screen>,
    );
    expect(screen.queryByTestId('s-scroll')).toBeNull();
    expect(flatten(screen.getByTestId('s-content').props.style).paddingBottom).toBe(128);
  });
});

// ===========================================================================
// THE ONE SCREEN WITHOUT A HEADER, AND THE INSET IT WAS NOT GETTING.
//
// `headerTopFor(insets.top)` is applied to the `header` slot. `app/onboarding`
// passes no header — the only screen in the app that does not — so its first
// row started at y=0 and its Skip button was drawn INSIDE the status bar,
// glyphs against the Wi-Fi and battery icons, on every notched device.
// ===========================================================================
describe('Screen — a headerless screen', () => {
  it('clears the status bar itself when there is no header to do it', () => {
    renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
      NOTCHED,
    );
    expect(flatten(screen.getByTestId('s').props.style).paddingTop).toBe(59);
  });

  it('pays nothing for it on a device with no inset', () => {
    renderScreen(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
    );
    expect(flatten(screen.getByTestId('s').props.style).paddingTop).toBe(0);
  });

  // The header slot already applies `headerTopFor`; adding it to the root too
  // would push every one of the other screens down by a second inset.
  it('leaves the root alone when a header is present', () => {
    renderScreen(
      <Screen testID="s" header={<Text>hdr</Text>}>
        <Text>x</Text>
      </Screen>,
      NOTCHED,
    );
    expect(flatten(screen.getByTestId('s').props.style).paddingTop).toBeUndefined();
    // …and the header slot is still the one paying it: 59 + 12, floored at 56.
    expect(flatten(screen.getByTestId('s-header').props.style).paddingTop).toBe(71);
  });
});

describe('ScrollRail', () => {
  // ==========================================================================
  // THE SINGLE VISUAL TELL OF A WRONG RAIL.
  // ==========================================================================
  it('puts its edge padding on the CONTENT container, not the parent', () => {
    render(
      <ScrollRail testID="rail">
        <View />
      </ScrollRail>,
    );
    const node = screen.getByTestId('rail');

    // With the padding on the parent instead, the scroll viewport narrows by
    // 40pt: the last item is clipped 20pt short of the screen edge rather than
    // bleeding to it.
    expect(flatten(node.props.contentContainerStyle).paddingHorizontal).toBe(SCREEN_GUTTER);
    expect(flatten(node.props.style).paddingHorizontal).toBeUndefined();
  });

  it('is a horizontal ScrollView with no indicator, and persists taps', () => {
    render(
      <ScrollRail testID="rail">
        <View />
      </ScrollRail>,
    );
    const node = screen.getByTestId('rail');
    expect(node.props.horizontal).toBe(true);
    expect(node.props.showsHorizontalScrollIndicator).toBe(false);
    expect(node.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('scrolls to an index once the viewport has been measured', () => {
    // Seven 50pt cells and six 6pt gaps is 386pt of content: it fits a 390pt
    // screen and overflows a 320pt one, so "today" can start off-screen.
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {
      /* no native scroller under test */
    });

    render(
      <ScrollRail testID="rail" scrollToIndex={6} itemWidth={50}>
        <View />
      </ScrollRail>,
    );

    // Nothing yet: a zero-width viewport centres on nothing and lands at 0,
    // which is indistinguishable from the prop being ignored.
    expect(scrollTo).not.toHaveBeenCalled();

    act(() => {
      // RNTL types a host node's props as `any`; narrow the one handler this
      // test drives rather than casting inline.
      const onLayout = screen.getByTestId('rail').props.onLayout as (event: {
        nativeEvent: { layout: { width: number } };
      }) => void;
      onLayout({ nativeEvent: { layout: { width: 320 } } });
    });

    expect(scrollTo).toHaveBeenCalledWith({ x: 221, animated: false });
    scrollTo.mockRestore();
  });
});

describe('TileGrid', () => {
  it('lays out rows of equal-width cells', () => {
    render(
      <TileGrid testID="g">
        <Text testID="a">a</Text>
        <Text testID="b">b</Text>
        <Text testID="c">c</Text>
        <Text testID="d">d</Text>
      </TileGrid>,
    );

    // Two rows of two, no spacers.
    expect(screen.getByTestId('g-row-0')).toBeTruthy();
    expect(screen.getByTestId('g-row-1')).toBeTruthy();
    expect(screen.queryAllByTestId('g-spacer')).toHaveLength(0);
    // Every cell is `flex: 1`, which is what makes the columns equal without
    // the container ever being measured.
    const cells = screen.getByTestId('g-row-0').children;
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(flatten((cell as { props: { style?: unknown } }).props.style).flex).toBe(1);
    }
  });

  it('pads a short last row with spacers rather than stretching the tile', () => {
    // A lone tile stretched to full width stops reading as a member of the
    // grid above it and starts reading as a banner.
    render(
      <TileGrid testID="g">
        <Text testID="a">a</Text>
        <Text testID="b">b</Text>
        <Text testID="c">c</Text>
      </TileGrid>,
    );

    // The last row holds `c` plus one spacer, so `c` stays half-width.
    expect(screen.getByTestId('g-row-1').children).toHaveLength(2);
    expect(screen.queryAllByTestId('g-spacer')).toHaveLength(1);
  });
});

describe('SectionHeader', () => {
  it('announces its title as a header', () => {
    render(<SectionHeader title="მიღწევები" testID="sh" />);
    expect(screen.getByRole('header').props.children).toBe('მიღწევები');
  });

  it('gives the "see all" action a 44pt target it does not visually have', () => {
    const onPress = jest.fn();
    render(
      <SectionHeader
        title="მიღწევები"
        action={{ label: 'ყველა', onPress, testID: 'all' }}
        testID="sh"
      />,
    );

    const node = screen.getByTestId('all');
    const style = flatten(node.props.style);
    const slop = node.props.hitSlop as { top: number; bottom: number };
    // 16pt of unplated text; the slop is what makes it a target.
    expect(Number(style.minHeight) + slop.top + slop.bottom).toBe(44);
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('ყველა');
  });

  // ==========================================================================
  // THE DESCRIPTION WAS TRAPPED IN THE TITLE'S COLUMN.
  //
  // The header is a row and the subtitle sat inside its LEFT half, so an action
  // on the right took ~110pt off the width of a paragraph that has nothing to
  // do with it: three ragged lines with an empty gutter beside each one. The
  // subtitle now sits below the row, at the full width of the section.
  //
  // The width itself is geometry and a test renderer measures none — what is
  // assertable is the tree: the subtitle is a SIBLING of the row, not a child
  // of the title column the action narrows.
  // ==========================================================================
  it('puts the subtitle below the header row, not inside the title column', () => {
    render(
      <SectionHeader
        title="მიღწევები"
        subtitle="აქ ჩანს ყველა მიღწევა, რომელიც დაგროვდა ვარჯიშების მიხედვით."
        action={{ label: 'ყველა', onPress: jest.fn(), testID: 'all' }}
        testID="sh"
      />,
    );

    // The root is now a column wrapper; the row inside it is the only `row`.
    expect(flatten(screen.getByTestId('sh').props.style).flexDirection).toBeUndefined();
    // The action and the subtitle are not in the same column any more.
    const column = within(screen.getByTestId('sh'));
    expect(column.getByTestId('all')).toBeTruthy();
    expect(
      column.getByText('აქ ჩანს ყველა მიღწევა, რომელიც დაგროვდა ვარჯიშების მიხედვით.'),
    ).toBeTruthy();
  });

  // The overwhelming majority of the seven artboard instances carry no
  // subtitle; those must not gain a wrapper node, because `style` and `testID`
  // land on it.
  it('stays a bare row when there is no subtitle', () => {
    render(<SectionHeader title="მიღწევები" testID="sh" />);
    expect(flatten(screen.getByTestId('sh').props.style).flexDirection).toBe('row');
  });
});
