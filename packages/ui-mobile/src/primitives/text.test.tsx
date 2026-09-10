// Render tests for the text family.
//
// These assert the two things a screen cannot get right on its own: that a
// heading is announced as a heading, and that a number is spoken as a quantity
// rather than as a row of glyphs. Neither is visible in a screenshot, which is
// exactly why they need a test.

import { render, screen } from '@testing-library/react-native';

import { darkColors } from '../tokens/semantic';
import { type as typeRoles } from '../tokens/typography';

import { Eyebrow, Heading, Money, Mono, Text } from './text';

/** Flatten RN's nested style arrays down to one object. */
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('Text', () => {
  it('forwards testID to the root node', () => {
    render(<Text testID="label">გამარჯობა</Text>);
    expect(screen.getByTestId('label')).toBeTruthy();
  });

  it('takes its whole setting from the token layer', () => {
    render(
      <Text variant="heading" testID="label">
        სათაური
      </Text>,
    );
    const style = flatten(screen.getByTestId('label').props.style);
    expect(style.fontSize).toBe(typeRoles.heading.fontSize);
    // The two values a hand-written screen gets wrong. RN has no `em`, so a
    // screen porting `tracking-[-0.025em]` does the multiplication itself and
    // eventually rounds one size differently from another.
    expect(style.letterSpacing).toBe(typeRoles.heading.letterSpacing);
    // And the one that is not cosmetic: Georgian text at 20px+ clips its
    // ascenders on Android when lineHeight is left to the platform.
    expect(style.lineHeight).toBe(typeRoles.heading.lineHeight);
    expect(style.lineHeight).toBeGreaterThan(0);
  });

  it('gives every scale step an explicit lineHeight', () => {
    for (const role of Object.keys(typeRoles) as (keyof typeof typeRoles)[]) {
      expect(typeRoles[role].lineHeight).toBeGreaterThanOrEqual(typeRoles[role].fontSize);
    }
  });

  it('resolves a semantic colour role', () => {
    render(
      <Text color="textSecondary" testID="label">
        x
      </Text>,
    );
    expect(flatten(screen.getByTestId('label').props.style).color).toBe(darkColors.textSecondary);
  });

  it('lets style and className through, last', () => {
    render(
      <Text testID="label" className="mt-4" style={{ color: '#FF0000' }}>
        x
      </Text>,
    );
    const node = screen.getByTestId('label');
    // `style` is applied after the token setting, so a screen can always nudge.
    expect(flatten(node.props.style).color).toBe('#FF0000');
  });

  it('passes RN text props through (numberOfLines, onPress, …)', () => {
    render(
      <Text testID="label" numberOfLines={2}>
        x
      </Text>,
    );
    expect(screen.getByTestId('label').props.numberOfLines).toBe(2);
  });
});

describe('Heading', () => {
  // The assertion this file exists for. A screen whose "headings" are `Text`
  // with a bigger fontSize has NO headings, and rotor navigation drops the
  // user at the top of the page every time.
  it('sets accessibilityRole="header"', () => {
    render(<Heading testID="h">ბოლო ჩექ-ინები</Heading>);
    expect(screen.getByTestId('h').props.accessibilityRole).toBe('header');
  });

  it('is reachable by role', () => {
    render(<Heading>ბოლო ჩექ-ინები</Heading>);
    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('maps every level onto a scale step, and keeps the role at all of them', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const view = render(
        <Heading level={level} testID="h">
          t
        </Heading>,
      );
      const node = view.getByTestId('h');
      expect(node.props.accessibilityRole).toBe('header');
      expect(flatten(node.props.style).fontSize).toBeGreaterThan(0);
      view.unmount();
    }
  });

  it('lets `variant` change the size without changing the role', () => {
    render(
      <Heading level={1} variant="caption" testID="h">
        t
      </Heading>,
    );
    const node = screen.getByTestId('h');
    expect(node.props.accessibilityRole).toBe('header');
    expect(flatten(node.props.style).fontSize).toBe(typeRoles.caption.fontSize);
  });
});

describe('Eyebrow', () => {
  it('is small-caps at all three sizes', () => {
    for (const size of ['micro', 'label', 'eyebrow'] as const) {
      const view = render(
        <Eyebrow size={size} testID="e">
          კატეგორია
        </Eyebrow>,
      );
      const style = flatten(view.getByTestId('e').props.style);
      expect(style.textTransform).toBe('uppercase');
      // Tracking is what makes small caps readable; it is absolute px here
      // because RN has no `em`.
      expect(style.letterSpacing).toBeGreaterThan(0);
      view.unmount();
    }
  });

  it('defaults to the secondary text colour, as the artboards do', () => {
    render(<Eyebrow testID="e">კატეგორია</Eyebrow>);
    expect(flatten(screen.getByTestId('e').props.style).color).toBe(darkColors.textSecondary);
  });
});

describe('Mono and Money', () => {
  it('sets tabular figures', () => {
    render(<Mono testID="m">22/30</Mono>);
    // Proportional figures make a column that updates jitter a point or two on
    // every change, which reads as the layout being unstable.
    expect(flatten(screen.getByTestId('m').props.style).fontVariant).toEqual(['tabular-nums']);
  });

  it('uses a monospace family from the token layer', () => {
    render(<Mono testID="m">FC-4821</Mono>);
    expect(flatten(screen.getByTestId('m').props.style).fontFamily).toBe(
      typeRoles.monoBody.fontFamily,
    );
  });

  it('speaks its label instead of its glyphs', () => {
    // VoiceOver reads a tabular run character by character — "eight nine full
    // stop zero zero" — unless something tells it the run is a quantity.
    render(
      <Money accessibilityLabel="89 ლარი" testID="money">
        89.00 ₾
      </Money>,
    );
    const node = screen.getByTestId('money');
    expect(node.props.accessibilityLabel).toBe('89 ლარი');
    expect(node.props.accessible).toBe(true);
  });

  it('still renders the formatted glyphs it was given', () => {
    // Formatting is the SCREEN's job: it needs the locale, the currency and the
    // minor-unit convention, none of which this package knows — and `Intl` is
    // banned on this platform outright.
    render(<Money accessibilityLabel="89 ლარი">89.00 ₾</Money>);
    expect(screen.getByText('89.00 ₾')).toBeTruthy();
  });

  it('leaves Mono unlabelled by default', () => {
    // An identifier read out character by character is arguably correct, so
    // `Mono` does not force a label; `Money` does.
    render(<Mono testID="m">FC-4821</Mono>);
    expect(screen.getByTestId('m').props.accessibilityLabel).toBeUndefined();
  });
});

describe('the type contract, at compile time', () => {
  it('will not let Money ship without a spoken label', () => {
    // Package rule 1: every label, including every `accessibilityLabel`, is a
    // required prop. `@ts-expect-error` FAILS the build if the error is ever
    // absent, so this line is the assertion.
    // @ts-expect-error -- `accessibilityLabel` is required on Money.
    const missing = <Money>89.00 ₾</Money>;
    expect(missing).toBeTruthy();
  });
});
