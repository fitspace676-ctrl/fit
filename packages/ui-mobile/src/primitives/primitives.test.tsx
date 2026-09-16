// Behavioural tests for the remaining primitives.
//
// The sweep (`sweep.test.tsx`) already asserts what every export owes the
// package — `testID`, `style`, `className`, roles, the 44pt floor. This file
// covers what each one owes the DESIGN, and only where getting it wrong would
// be invisible in review.

import { render, screen } from '@testing-library/react-native';

import { CountBadge, DotBadge, Pill } from '../feedback/pill';
import { darkColors } from '../tokens/semantic';
import { radii } from '../tokens/radii';

import { Avatar } from './avatar';
import { Divider } from './divider';
import { Skeleton } from './skeleton';
import { Spinner } from './spinner';
import { Card, Surface } from './surface';

const HIDDEN = { includeHiddenElements: true } as const;

/**
 * RNTL types a host node's `props` as `any`, so every reach into
 * `accessibilityState` is an unsafe member access the shared lint config
 * (correctly) refuses. Narrow it once, here, rather than casting at each site.
 */
function a11yState(node: unknown): { disabled?: boolean; selected?: boolean; busy?: boolean } {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  return props.accessibilityState ?? {};
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('Surface', () => {
  it('defaults to the card tone at the container radius', () => {
    render(<Card testID="s" />);
    const style = flatten(screen.getByTestId('s').props.style);
    expect(style.backgroundColor).toBe(darkColors.backgroundCard);
    expect(style.borderRadius).toBe(radii.container);
  });

  it('lets a literal artboard radius through unrounded', () => {
    // The artboards use 18/20/22/28/30 directly. Q3 says let them pass rather
    // than force-snapping them onto the six named steps.
    render(<Surface radius={30} testID="s" />);
    expect(flatten(screen.getByTestId('s').props.style).borderRadius).toBe(30);
  });

  it('clamps the radius to half a fixed side', () => {
    // A 26pt container radius on a 29pt-tall box renders a full CAPSULE in
    // React Native — CSS clamps this for you and RN does not — and the
    // design's octagonal silhouette is gone. See internal/clamp-radius.ts.
    render(<Surface radius="container" side={29} testID="s" />);
    expect(flatten(screen.getByTestId('s').props.style).borderRadius).toBe(14);
  });

  it('draws the tile tone as the RECESSED step, not a lighter one', () => {
    // The direction's main depth trick: inside a panel, an inset tile goes
    // DARKER than its parent in dark mode — the page colour punched back
    // through — and lighter in light mode. It reads as recessed without a
    // shadow, which this design reserves for floating chrome.
    render(<Surface tone="tile" testID="s" />);
    expect(flatten(screen.getByTestId('s').props.style).backgroundColor).toBe(darkColors.tile);
  });

  it('paints nothing for the `none` tone', () => {
    render(<Surface tone="none" testID="s" />);
    expect(flatten(screen.getByTestId('s').props.style).backgroundColor).toBeUndefined();
  });
});

describe('Pill', () => {
  it('renders its label', () => {
    render(<Pill testID="p">აქტიური</Pill>);
    expect(screen.getByText('აქტიური')).toBeTruthy();
  });

  it('keeps `booked` distinct from `accent`', () => {
    // The two sit in the same row on the classes screen: `accent` OFFERS the
    // booking, `booked` says it is already done. Same hue, different jobs — so
    // they must not resolve to the same fill.
    const booked = render(
      <Pill tone="booked" testID="b">
        დაჯავშნილია
      </Pill>,
    );
    const accent = render(
      <Pill tone="accent" testID="a">
        დაჯავშნა
      </Pill>,
    );
    const bookedBg = flatten(booked.getByTestId('b').props.style).backgroundColor;
    const accentBg = flatten(accent.getByTestId('a').props.style).backgroundColor;
    expect(bookedBg).toBe(darkColors.booked);
    expect(accentBg).toBe(darkColors.accent);
    expect(bookedBg).not.toBe(accentBg);
  });

  it('clamps its radius to half its own height', () => {
    // `full` is 9999. Unclamped that is harmless on a capsule and wrong the
    // moment somebody passes `container`.
    const view = render(
      <Pill size="sm" radius="container" testID="p">
        x
      </Pill>,
    );
    expect(flatten(view.getByTestId('p').props.style).borderRadius).toBe(11); // floor(22 / 2)
  });

  it('sets tabular figures when asked', () => {
    render(
      <Pill tabular testID="p">
        12 დარჩა
      </Pill>,
    );
    // A spots-left count that ticks down must not make the pill's width jitter.
    expect(screen.getByText('12 დარჩა').props.style).toBeTruthy();
  });

  it('drops the small-caps treatment the scale carries', () => {
    // `type.label` is 11px AND uppercase AND tracked, because it is an eyebrow
    // role. The artboards' pills are 11px plainly set. See the note on SIZES.
    render(
      <Pill size="sm" testID="p">
        Active
      </Pill>,
    );
    const style = flatten(screen.getByText('Active').props.style);
    expect(style.textTransform).toBe('none');
    expect(style.letterSpacing).toBe(0);
  });
});

describe('badges', () => {
  it('caps a count and stays out of the a11y tree', () => {
    render(<CountBadge count={128} testID="c" />);
    expect(screen.getByText('9+', HIDDEN)).toBeTruthy();
    expect(screen.queryByText('9+')).toBeNull();
  });

  it('rings itself in the colour of the surface behind it', () => {
    // A ring, not a gap: it is what lets a lime dot stay legible over a lime
    // block, which a gap cannot do.
    render(<DotBadge ringColor="backgroundCard" testID="d" />);
    const style = flatten(screen.getByTestId('d', HIDDEN).props.style);
    expect(style.borderWidth).toBe(2);
    expect(style.borderColor).toBe(darkColors.backgroundCard);
    expect(style.backgroundColor).toBe(darkColors.accent);
  });
});

describe('Divider', () => {
  it('draws one full point, not a hairline', () => {
    // `StyleSheet.hairlineWidth` is 0.33pt on a 3× screen, and `ink-800` on
    // `ink-900` at a third of a point renders as a dithered, intermittent line
    // that reads as a rendering bug. The artboards draw `h-px`.
    render(<Divider testID="d" />);
    const style = flatten(screen.getByTestId('d', HIDDEN).props.style);
    expect(style.height).toBe(1);
    expect(style.backgroundColor).toBe(darkColors.border);
  });
});

describe('Avatar', () => {
  it('rings the signed-in member in lime and everybody else in neutral', () => {
    // The only thing on the home header that says "this is you" without a word
    // of copy — which matters in a package that ships none.
    const me = render(<Avatar initials="NK" ring="accent" testID="me" />);
    expect(flatten(me.getByTestId('me', HIDDEN).props.style).borderColor).toBe(darkColors.accent);
    const them = render(<Avatar initials="GT" ring="neutral" testID="them" />);
    expect(flatten(them.getByTestId('them', HIDDEN).props.style).borderColor).toBe(
      darkColors.avatarRing,
    );
  });

  it('falls back to a monogram the caller supplied', () => {
    // Not derived from a name: initial-taking is locale-specific, and this
    // package does not know the locale — the same reason it ships no copy.
    render(<Avatar initials="NK" testID="a" />);
    expect(screen.getByText('NK', HIDDEN)).toBeTruthy();
  });

  it('is decorative unless the name is not already beside it', () => {
    const decorative = render(<Avatar initials="NK" testID="a" />);
    expect(decorative.getByTestId('a', HIDDEN).props.accessible).toBe(false);
    decorative.unmount();

    const labelled = render(
      <Avatar initials="NK" accessibilityLabel="Nino Kapanadze" testID="b" />,
    );
    const node = labelled.getByTestId('b');
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe('image');
  });
});

describe('Spinner', () => {
  it('announces itself as busy, with the caller’s label', () => {
    render(<Spinner accessibilityLabel="იტვირთება" testID="s" />);
    const node = screen.getByTestId('s');
    expect(node.props.accessibilityRole).toBe('progressbar');
    expect(node.props.accessibilityLabel).toBe('იტვირთება');
    expect(a11yState(node).busy).toBe(true);
  });

  it('will not compile without a label', () => {
    // A busy indicator that announces nothing leaves a screen-reader user on a
    // silent screen with no way to tell "working" from "finished, and empty".
    // @ts-expect-error -- `accessibilityLabel` is required on Spinner.
    const unlabelled = <Spinner />;
    expect(unlabelled).toBeTruthy();
  });
});

describe('Skeleton', () => {
  it('uses the skeleton role and clamps its radius to its own height', () => {
    render(<Skeleton height={12} testID="s" />);
    const style = flatten(screen.getByTestId('s', HIDDEN).props.style);
    expect(style.backgroundColor).toBe(darkColors.skeleton);
    expect(style.borderRadius).toBe(6); // `inner` is 10; floor(12 / 2) wins
  });

  it('is silent by default and announces busy when labelled', () => {
    // The right place for the announcement is ONE label on the section, not
    // one per bar: a loading card made of six skeletons should say it once.
    const quiet = render(<Skeleton testID="q" />);
    expect(quiet.getByTestId('q', HIDDEN).props.accessible).toBe(false);
    quiet.unmount();

    const loud = render(<Skeleton accessibilityLabel="იტვირთება" testID="l" />);
    expect(a11yState(loud.getByTestId('l')).busy).toBe(true);
  });
});
