// A host node's flattened `style`, typed — the sibling of `a11y.ts`.
//
// Most of what a visual regression looks like is not expressible as text: a
// sticky footer that paints nothing draws the page through itself, and every
// query in the test still passes because every node is still mounted. The only
// handle a render test has on that class of defect is the STYLE the component
// resolved to, and `ReactTestInstance['props']` is `any`, so reading it is
// three `no-unsafe-*` lint errors per assertion.
//
// So the cast lives here once, exactly as it does for `accessibilityState`.
// What these assertions can and cannot prove is worth stating: a style
// assertion pins the RULE ("this footer has an opaque fill", "this row allows
// two lines") and never the GEOMETRY that follows from it — a test renderer
// runs no layout pass, so nothing here can measure a point frame.

import { StyleSheet, type ViewStyle, type TextStyle } from 'react-native';

/** Structurally typed for the same reason `A11yNode` is. */
export interface StyledNode {
  props?: { style?: unknown; numberOfLines?: number };
}

/** The node's `style` prop, flattened. `{}` when it sets none. */
export function flatStyle(node: StyledNode): ViewStyle & TextStyle {
  return StyleSheet.flatten(node.props?.style as never) ?? {};
}

/** The node's `numberOfLines`, or `undefined` — "wraps freely". */
export function lineClamp(node: StyledNode): number | undefined {
  return node.props?.numberOfLines;
}

/**
 * Does this node paint an opaque plate?
 *
 * "Opaque" is deliberately strict: a fill that is present AND not `transparent`
 * AND not an `rgba()` with a fractional alpha. A footer wrapper positioned over
 * a scroll view has to stop the content behind it outright — a 90% wash still
 * shows the ascenders of whatever is underneath.
 */
export function paintsOpaquely(node: StyledNode): boolean {
  const fill = flatStyle(node).backgroundColor;
  if (typeof fill !== 'string' || fill === '' || fill === 'transparent') return false;
  const rgba = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(fill);
  return rgba === null || Number(rgba[1]) >= 1;
}
