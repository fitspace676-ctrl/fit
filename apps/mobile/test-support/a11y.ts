// `accessibilityState`, typed.
//
// What a screen test asserts is the a11y contract (plan §6 item 7), and on a
// control that means `accessibilityState`: `busy` while a request is in flight,
// `disabled` while a cool-down is running or the radio is dead. Those are not
// decoration — they are the only thing a screen-reader user has to tell "the
// button is thinking" from "the button is dead", and the *reason* the assertions
// are written against them rather than against a spinner's presence.
//
// The problem is the type. `ReactTestInstance['props']` is `any`, so every
// `node.props.accessibilityState.disabled` is three `no-unsafe-*` lint errors,
// and the tempting fix — an inline cast per assertion — spreads the same cast
// over sixty lines and lets a typo (`accessiblityState`) resolve to `undefined`
// and quietly pass. One typed accessor instead: the cast lives here, once, and
// every call site reads as a normal property access.

/** The subset of `AccessibilityState` these screens actually set. */
export interface A11yState {
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  expanded?: boolean;
}

/**
 * The `accessibilityState` a host element reports, or `{}` when it sets none.
 *
 * `{}` rather than `undefined` so a missing state fails the assertion that
 * wanted `true` instead of throwing a `TypeError` that reads like a broken test.
 */
export function a11yState(node: A11yNode): A11yState {
  return node.props?.accessibilityState ?? {};
}

/**
 * Structurally typed rather than `ReactTestInstance`, because
 * `react-test-renderer` ships no type declarations in this workspace and adding
 * `@types/react-test-renderer` for one parameter would pull a second, possibly
 * divergent, copy of React's element types into the app's type graph. Every
 * element `screen.*` returns satisfies this shape.
 */
export interface A11yNode {
  props?: { accessibilityState?: A11yState };
}
