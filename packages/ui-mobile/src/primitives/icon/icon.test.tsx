// Render tests for `Icon`. Behavioural, never visual.
//
// There is no snapshot in this file and there will not be one. A snapshot of an
// icon's style object locks in today's tokens and fails on every legitimate
// repaint — which is how a test gets deleted rather than fixed, and this
// package has already lost one design system to tests nobody trusted.

import { render, screen } from '@testing-library/react-native';

import { darkColors } from '../../tokens/semantic';

import { Icon, ICON_DEFAULT_SIZE, ICON_STROKE_WIDTH, resolveColor } from './icon';
import { ICON_MOBILE_ONLY, ICON_NAMES, ICON_PATHS, ICON_WEB_DIVERGENCE } from './paths';

// A decorative icon is HIDDEN from the accessibility tree, and RNTL's queries
// skip hidden elements by default. That default is right — it is what makes
// `getByRole` mean "what a screen-reader user can reach" — so every query for a
// decorative node opts in explicitly. Needing this option is itself proof the
// icon is hidden; `is decorative by default` below asserts the same thing from
// the other side.
const HIDDEN = { includeHiddenElements: true } as const;

describe('the dictionary', () => {
  it('draws every glyph as exactly one path', () => {
    for (const name of ICON_NAMES) {
      const d = ICON_PATHS[name];
      expect(typeof d).toBe('string');
      expect(d.length).toBeGreaterThan(0);
      // One `<Path>` per icon: `react-native-svg` mounts a native view per
      // element, so a five-element icon inside a 60-row list is 300 views.
      // Subpaths concatenate into one `d` instead.
      expect(d.startsWith('M') || d.startsWith('m')).toBe(true);
    }
  });

  it('carries no glyph name twice and no empty name', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(ICON_NAMES.every((n) => n.trim().length > 0)).toBe(true);
  });

  // The bug this asserts against, spelled out: the artboards call their
  // DIAGONAL-OUT glyph `arrow`, and `@fit/ui-web` calls its RIGHT-POINTING
  // glyph `arrow`. Shipping the artboard drawing under the web name would mean
  // a screen written against the shared vocabulary silently renders the wrong
  // arrow — both are arrows, so nobody notices. The diagonal ships as
  // `arrowUpRight`; `arrow` keeps web's meaning.
  it('keeps `arrow` and `arrowUpRight` as two different glyphs', () => {
    expect(ICON_PATHS.arrow).not.toBe(ICON_PATHS.arrowUpRight);
    expect(ICON_PATHS.arrowUpRight).toBe('M7 17 17 7M9 7h8v8');
    expect(ICON_MOBILE_ONLY.arrowUpRight).toBeDefined();
  });

  it('records a reason for every mobile-only and every divergent name', () => {
    for (const [name, reason] of Object.entries(ICON_MOBILE_ONLY)) {
      expect(ICON_NAMES).toContain(name);
      expect(reason.length).toBeGreaterThan(20);
    }
    for (const [name, reason] of Object.entries(ICON_WEB_DIVERGENCE)) {
      expect(ICON_NAMES).toContain(name);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('keeps the chevron family one size', () => {
    // `chevronDown`/`chevronUp` are the artboard's right-chevron rotated, not
    // web's chevrons, because web spans y 6→18 and the artboard spans 5→19 —
    // one of each puts two chevron sizes in the same list row.
    expect(ICON_PATHS.chevronRight).toBe('m9 5 7 7-7 7');
    expect(ICON_PATHS.chevronDown).toBe('M5 9l7 7 7-7');
    expect(ICON_PATHS.chevronUp).toBe('M5 15l7-7 7 7');
  });
});

describe('Icon', () => {
  it('forwards testID to the root node', () => {
    render(<Icon name="bolt" color="accent" testID="glyph" />);
    expect(screen.getByTestId('glyph', HIDDEN)).toBeTruthy();
  });

  // Note 1 in the component: given only one dimension, Android's SVG backend
  // derives the other at a different rounding step than iOS, and a 20pt icon
  // comes out 19 or 21 on one platform only.
  it('sets BOTH width and height', () => {
    render(<Icon name="bolt" color="accent" size={24} testID="glyph" />);
    const svg = screen.getByTestId('glyph', HIDDEN);
    expect(svg.props.width).toBe(24);
    expect(svg.props.height).toBe(24);
  });

  it('defaults to 20pt and the Lime Block 1.9 stroke', () => {
    expect(ICON_DEFAULT_SIZE).toBe(20);
    // The artboards are 1.9; `@fit/ui-web`'s pre-repaint set is 2.1.
    expect(ICON_STROKE_WIDTH).toBe(1.9);
    render(<Icon name="bolt" color="accent" testID="glyph" />);
    expect(screen.getByTestId('glyph', HIDDEN).props.width).toBe(20);
  });

  it('resolves a semantic role to a concrete colour', () => {
    // `react-native-svg` has no cascade, so `currentColor` never resolves and a
    // role name reaching `stroke` verbatim renders nothing at all.
    expect(resolveColor('accent', darkColors)).toBe(darkColors.accent);
    expect(resolveColor('#E4F26A', darkColors)).toBe('#E4F26A');
  });

  it('is decorative by default', () => {
    render(<Icon name="bell" color="iconPrimary" testID="glyph" />);
    const svg = screen.getByTestId('glyph', HIDDEN);
    expect(svg.props.accessible).toBe(false);
    // Both platforms, because they use different APIs for the same thing.
    expect(svg.props.accessibilityElementsHidden).toBe(true);
    expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('becomes an image with a role once it is given a label', () => {
    render(<Icon name="bell" color="iconPrimary" accessibilityLabel="Alerts" testID="glyph" />);
    const svg = screen.getByTestId('glyph', HIDDEN);
    expect(svg.props.accessible).toBe(true);
    expect(svg.props.accessibilityRole).toBe('image');
    expect(svg.props.accessibilityLabel).toBe('Alerts');
  });

  it('renders every glyph in the dictionary without throwing', () => {
    for (const name of ICON_NAMES) {
      const view = render(<Icon name={name} color="textPrimary" testID={`i-${name}`} />);
      expect(view.getByTestId(`i-${name}`, HIDDEN)).toBeTruthy();
      view.unmount();
    }
  });
});
